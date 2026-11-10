import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../lib/api-error.js';
import { createAuthCookies } from './cookies.js';
import { authModels } from './models.js';
import { displayNameSchema } from './validation.js';

const phone = z
  .string('Enter a valid Indian mobile number.')
  .trim()
  .max(32, 'Use 32 characters or fewer for your phone number.')
  .refine(
    (value) =>
      !value || /^(?:\+91)?[6-9]\d{9}$/.test(value.replace(/[ -]/g, '')),
    'Enter a valid Indian mobile number.',
  )
  .transform((value) =>
    value ? `+91${value.replace(/[ -]/g, '').slice(-10)}` : null,
  );
const profilePatch = z
  .strictObject({
    displayName: displayNameSchema.optional(),
    phone: phone.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Enter a profile change.');

function ownProfile(user) {
  const id = String(user._id);
  return {
    id,
    email: user.email,
    displayName: user.profile.displayName,
    phone: user.profile.phone ?? null,
    version: `"${id}:${user.profile.detailsVersion ?? 0}"`,
  };
}

const expired = () =>
  new ApiError(401, 'SESSION_EXPIRED', 'Please sign in to continue.');

export function createProfileService({ database }) {
  const eligible = (id) => ({
    _id: id,
    status: 'ACTIVE',
    emailVerifiedAt: { $ne: null },
  });
  const fields =
    'email profile.displayName profile.phone profile.detailsVersion';

  async function read(id) {
    const { User } = authModels(await database.connect());
    const user = await User.findOne(eligible(id)).select(fields).lean();
    if (!user) throw expired();
    return ownProfile(user);
  }

  async function update(id, raw, ifMatch) {
    const match = /^"([a-f0-9]{24}):(0|[1-9]\d*)"$/.exec(ifMatch ?? '');
    if (!match || !Number.isSafeInteger(Number(match[2])))
      throw new ApiError(
        428,
        'PROFILE_VERSION_REQUIRED',
        'Reload your profile before saving.',
      );
    if (match[1] !== id)
      throw new ApiError(
        409,
        'PROFILE_ACCOUNT_CHANGED',
        'Your signed-in account changed. Reload your profile.',
      );

    const parsed = profilePatch.safeParse(raw);
    if (!parsed.success) {
      const { fieldErrors } = z.flattenError(parsed.error);
      throw new ApiError(
        400,
        'INVALID_PROFILE',
        'Check your profile details and try again.',
        fieldErrors,
      );
    }
    const changes = parsed.data;
    const version = Number(match[2]);
    const { User } = authModels(await database.connect());
    const set = {};
    if (changes.displayName !== undefined)
      set['profile.displayName'] = changes.displayName;
    if (changes.phone) set['profile.phone'] = changes.phone;

    const user = await User.findOneAndUpdate(
      {
        ...eligible(id),
        ...(version === 0
          ? {
              $or: [
                { 'profile.detailsVersion': 0 },
                { 'profile.detailsVersion': { $exists: false } },
              ],
            }
          : { 'profile.detailsVersion': version }),
      },
      {
        $set: set,
        ...(changes.phone === null ? { $unset: { 'profile.phone': 1 } } : {}),
        $inc: { 'profile.detailsVersion': 1 },
      },
      { returnDocument: 'after', runValidators: true },
    )
      .select(fields)
      .lean();
    if (user) return ownProfile(user);

    const current = await read(id);
    // An unchanged retry can recover a lost response without another write.
    if (Object.entries(changes).every(([key, value]) => current[key] === value))
      return current;
    throw new ApiError(
      409,
      'PROFILE_CHANGED',
      'Your profile changed elsewhere. Reload it before saving.',
    );
  }

  return { read, update };
}

export function createProfileRouter({ service, profiles, settings }) {
  const router = Router();
  const cookies = createAuthCookies(settings);
  router.use('/me', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.get('origin');
    if ((origin || req.method === 'PATCH') && origin !== settings.webOrigin)
      throw new ApiError(
        403,
        'ORIGIN_NOT_ALLOWED',
        'This request is not allowed.',
      );
    if (req.method === 'PATCH' && !req.is('application/json'))
      throw new ApiError(415, 'JSON_REQUIRED', 'Send this request as JSON.');
    next();
  });
  router.get('/me', async (req, res) => {
    const { user } = await service.session(cookies.input(req));
    const data = await profiles.read(user.id);
    res.set('ETag', data.version).json({ success: true, data });
  });
  router.patch('/me', cookies.protect, async (req, res) => {
    const { user } = await service.session(cookies.input(req));
    const data = await profiles.update(user.id, req.body, req.get('if-match'));
    res.set('ETag', data.version).json({ success: true, data });
  });
  return router;
}
