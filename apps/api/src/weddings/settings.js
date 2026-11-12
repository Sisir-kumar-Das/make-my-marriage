import { createHash } from 'node:crypto';
import { ApiError } from '../lib/api-error.js';
import { authModels } from '../auth/models.js';
import { eventModels } from '../events/models.js';
import { weddingModels } from './models.js';
import { idempotencyKeySchema, weddingSettingsSchema } from './validation.js';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) =>
  value && typeof value === 'object'
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonical(value[key])]),
      )
    : value;

export async function updateWeddingSettings(
  { database, now, context },
  userId,
  weddingId,
  raw,
  match,
  key,
) {
  if (!/^[a-f\d]{24}$/.test(weddingId))
    throw new ApiError(
      404,
      'WEDDING_NOT_FOUND',
      'This wedding is not available.',
    );
  const parsed = weddingSettingsSchema.safeParse(raw);
  if (!parsed.success)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      parsed.error.issues.some((issue) => issue.code === 'unrecognized_keys')
        ? 'Only the wedding title, names, city, state, tradition and optional INR budget can be edited here.'
        : 'Please check your wedding details.',
      {
        fields: Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join('.'),
            issue.code === 'unrecognized_keys'
              ? 'Remove fields that cannot be edited here.'
              : issue.message,
          ]),
        ),
      },
    );
  if (
    !/^"(?:0|[1-9]\d*)"$/.test(match || '') ||
    !Number.isSafeInteger(Number(match.slice(1, -1)))
  )
    throw new ApiError(
      428,
      'VERSION_REQUIRED',
      'Reload the current wedding settings before saving.',
    );
  if (!idempotencyKeySchema.safeParse(key).success)
    throw new ApiError(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Provide a valid save key.',
    );
  const version = Number(match.slice(1, -1));
  const data = parsed.data;
  const keyHash = digest(key);
  const requestHash = digest(JSON.stringify([version, canonical(data)]));
  const connection = await database.connect();
  const { User } = authModels(connection);
  const { Wedding, WeddingMember, WeddingSettingsRequest } =
    weddingModels(connection);
  const { Activity } = eventModels(connection);
  let result;
  await connection.transaction(async (transaction) => {
    const instant = now();
    const eligible = await User.updateOne(
      { _id: userId, status: 'ACTIVE', emailVerifiedAt: { $ne: null } },
      { $inc: { __v: 1 } },
      { session: transaction },
    );
    if (eligible.matchedCount !== 1)
      throw new ApiError(401, 'SESSION_EXPIRED', 'Please sign in to continue.');
    const member = await WeddingMember.findOne({
      userId,
      weddingId,
      status: 'ACTIVE',
    })
      .session(transaction)
      .lean();
    const wedding =
      member &&
      (await Wedding.findOne({ _id: weddingId, deletedAt: null })
        .session(transaction)
        .lean());
    if (!wedding)
      throw new ApiError(
        404,
        'WEDDING_NOT_FOUND',
        'This wedding is not available.',
      );
    if (member.role !== 'ADMIN')
      throw new ApiError(
        403,
        'ADMIN_REQUIRED',
        'Only an Admin can change wedding settings.',
      );
    // Serialize permission changes and receipt replay with current membership.
    const locked = await WeddingMember.updateOne(
      { _id: member._id, status: 'ACTIVE', role: 'ADMIN' },
      { $inc: { settingsLockVersion: 1 } },
      { session: transaction, timestamps: false },
    );
    if (locked.matchedCount !== 1)
      throw new ApiError(
        403,
        'ADMIN_REQUIRED',
        'Only an Admin can change wedding settings.',
      );
    const receipt = await WeddingSettingsRequest.findOne({
      weddingId,
      userId,
      keyHash,
    })
      .session(transaction)
      .lean();
    if (receipt && receipt.expiresAt > instant) {
      if (receipt.requestHash !== requestHash)
        throw new ApiError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'This save key belongs to a different change.',
        );
      // Return current settings rather than putting an old receipt snapshot over a newer edit.
      result = {
        ...context(wedding, member),
        replayed: true,
        unchanged: !!receipt.unchanged,
      };
      return;
    }
    if (wedding.__v !== version)
      throw new ApiError(
        409,
        'VERSION_CONFLICT',
        'Wedding settings changed since you opened them. Another Admin or tab may have saved an update. Load the latest details before saving again.',
      );
    const set = {};
    for (const field of ['name', 'brideName', 'groomName', 'tradition'])
      if (data[field] !== undefined && data[field] !== wedding[field])
        set[field] = data[field];
    if (data.location) {
      for (const field of ['city', 'state'])
        if (data.location[field] !== wedding.location[field])
          set[`location.${field}`] = data.location[field];
    }
    if (
      data.estimatedBudget &&
      (!wedding.estimatedBudget ||
        BigInt(wedding.estimatedBudget.amountMinor) !==
          BigInt(data.estimatedBudget.amountMinor))
    )
      set.estimatedBudget = data.estimatedBudget;
    const clearBudget =
      data.estimatedBudget === null && !!wedding.estimatedBudget;
    const unchanged = Object.keys(set).length === 0 && !clearBudget;
    const updated = unchanged
      ? wedding
      : await Wedding.findOneAndUpdate(
          { _id: weddingId, deletedAt: null, __v: version },
          {
            $set: set,
            ...(clearBudget && {
              $unset: { estimatedBudget: 1 },
            }),
            $inc: { __v: 1 },
          },
          {
            session: transaction,
            returnDocument: 'after',
            runValidators: true,
          },
        ).lean();
    if (!updated)
      throw new ApiError(
        409,
        'VERSION_CONFLICT',
        'Wedding settings changed. Load the latest details.',
      );
    // Audit contains no saved budget, names or contact details. This action is
    // outside the approved public activity-feed categories for this increment.
    if (!unchanged)
      await Activity.create(
        [
          {
            weddingId,
            actorId: userId,
            action: 'WEDDING_UPDATED',
            entityType: 'WEDDING',
            entityId: weddingId,
            feedHidden: true,
            createdAt: instant,
          },
        ],
        { session: transaction },
      );
    await WeddingSettingsRequest.findOneAndUpdate(
      { weddingId, userId, keyHash },
      {
        $set: {
          requestHash,
          unchanged,
          expiresAt: new Date(instant.getTime() + 86400000),
        },
      },
      { session: transaction, upsert: true, runValidators: true },
    );
    result = { ...context(updated, member), replayed: false, unchanged };
  });
  return result;
}
