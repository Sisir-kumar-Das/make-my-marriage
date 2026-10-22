import { createHash, randomBytes } from 'node:crypto';
import { ApiError } from '../lib/api-error.js';
import { authModels } from '../auth/models.js';
import { weddingModels } from './models.js';
import {
  createWeddingSchema,
  idempotencyKeySchema,
  weddingToday,
} from './validation.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const absent = () =>
  new ApiError(404, 'WEDDING_NOT_FOUND', 'This wedding is not available.');

function context(wedding, member) {
  const budgetAllowed =
    member.role === 'ADMIN' ||
    (member.role === 'FAMILY_MEMBER' && member.financeAccess);
  return {
    wedding: {
      id: String(wedding._id),
      name: wedding.name,
      brideName: wedding.brideName,
      groomName: wedding.groomName,
      mainDate: wedding.mainDate,
      timezone: wedding.timezone,
      tradition: wedding.tradition,
      location: wedding.location,
      cover: 'DEFAULT',
      mode: wedding.mode,
      version: wedding.__v,
      ...(budgetAllowed && wedding.estimatedBudget
        ? {
            estimatedBudget: {
              amountMinor: Number(wedding.estimatedBudget.amountMinor),
              currency: 'INR',
            },
          }
        : {}),
    },
    membership: { role: member.role, financeAccess: !!budgetAllowed },
  };
}

export function createWeddingService({ database, now = () => new Date() }) {
  async function current(userId) {
    const { Wedding, WeddingMember } = weddingModels(await database.connect());
    const member = await WeddingMember.findOne({
      userId,
      status: 'ACTIVE',
    }).lean();
    if (!member) return { wedding: null, membership: null };
    const wedding = await Wedding.findOne({
      _id: member.weddingId,
      deletedAt: null,
    }).lean();
    if (!wedding)
      throw new ApiError(
        409,
        'WEDDING_UNAVAILABLE',
        'Your wedding is currently unavailable. Please try again later.',
      );
    return context(wedding, member);
  }
  async function read(userId, weddingId) {
    if (!/^[a-f\d]{24}$/.test(weddingId)) throw absent();
    const { Wedding, WeddingMember } = weddingModels(await database.connect());
    const member = await WeddingMember.findOne({
      userId,
      weddingId,
      status: 'ACTIVE',
    }).lean();
    if (!member) throw absent();
    const wedding = await Wedding.findOne({
      _id: weddingId,
      deletedAt: null,
    }).lean();
    if (!wedding) throw absent();
    return context(wedding, member);
  }
  async function create(userId, raw, key) {
    const parsed = createWeddingSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Please check your wedding details.',
        {
          fields: Object.fromEntries(
            parsed.error.issues.map((issue) => [
              issue.path.join('.'),
              issue.message,
            ]),
          ),
        },
      );
    if (!idempotencyKeySchema.safeParse(key).success)
      throw new ApiError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Please retry creating your wedding.',
      );
    const input = parsed.data;
    const connection = await database.connect();
    const { User } = authModels(connection);
    const { Wedding, WeddingMember, WeddingCreationRequest } =
      weddingModels(connection);
    const keyHash = hash(key),
      requestHash = hash(JSON.stringify(input));
    async function existing(transaction) {
      const request = await WeddingCreationRequest.findOne({
        userId,
        keyHash,
        expiresAt: { $gt: now() },
      })
        .session(transaction || null)
        .lean();
      if (request) {
        if (request.requestHash !== requestHash)
          throw new ApiError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'Those details changed after a previous submission. Check your existing wedding before trying again.',
          );
        // Recheck membership instead of replaying a stored privileged response.
        const member = await WeddingMember.findOne({
          userId,
          weddingId: request.weddingId,
          status: 'ACTIVE',
        })
          .session(transaction || null)
          .lean();
        const wedding = await Wedding.findOne({
          _id: request.weddingId,
          deletedAt: null,
        })
          .session(transaction || null)
          .lean();
        if (!member || !wedding) throw absent();
        return context(wedding, member);
      }
      if (
        await WeddingMember.exists({ userId, status: 'ACTIVE' }).session(
          transaction || null,
        )
      )
        throw new ApiError(
          409,
          'WEDDING_ALREADY_EXISTS',
          'You already belong to a wedding. Open your existing workspace.',
        );
      return null;
    }
    // A retry must see its request record and membership from the same moment.
    // Otherwise a concurrent commit between those reads looks like a different wedding.
    const transactionOptions = {
      readConcern: { level: 'snapshot' },
      maxCommitTimeMS: 5000,
    };
    async function existingSnapshot() {
      let previous;
      await connection.transaction(async (transaction) => {
        previous = await existing(transaction);
      }, transactionOptions);
      return previous;
    }
    const replay = await existingSnapshot();
    if (replay) return replay;
    let result;
    try {
      await connection.transaction(async (transaction) => {
        // Serialize creation with account/session-changing writes. Membership's
        // partial unique index is the final guard against concurrent creators.
        const eligible = await User.updateOne(
          { _id: userId, status: 'ACTIVE', emailVerifiedAt: { $ne: null } },
          { $inc: { __v: 1 } },
          { session: transaction },
        );
        if (eligible.matchedCount !== 1)
          throw new ApiError(
            401,
            'SESSION_EXPIRED',
            'Please sign in to continue.',
          );
        const previous = await existing(transaction);
        if (previous) {
          result = previous;
          return;
        }
        const instant = now();
        // Apply this only to new creation. An earlier successful request can
        // still be replayed after midnight, and existing weddings remain readable.
        if (input.mainDate < weddingToday(instant))
          throw new ApiError(
            400,
            'VALIDATION_ERROR',
            'Please check your wedding details.',
            {
              fields: {
                mainDate: 'Choose today or a future date (India time).',
              },
            },
          );
        const prefix =
          input.name
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 65) || 'wedding';
        const [wedding] = await Wedding.create(
          [
            {
              ...input,
              slug: prefix + '-' + randomBytes(6).toString('hex'),
              createdBy: userId,
            },
          ],
          { session: transaction },
        );
        const [member] = await WeddingMember.create(
          [
            {
              weddingId: wedding._id,
              userId,
              role: 'ADMIN',
              status: 'ACTIVE',
              createdBy: userId,
              joinedAt: instant,
            },
          ],
          { session: transaction },
        );
        // Keep only hashes/resource identity, never form details or a response
        // containing role-restricted data. Expired keys are replaced atomically.
        await WeddingCreationRequest.findOneAndUpdate(
          { userId, keyHash },
          {
            $set: {
              requestHash,
              weddingId: wedding._id,
              expiresAt: new Date(instant.getTime() + 86400000),
            },
          },
          { session: transaction, upsert: true },
        );
        result = context(wedding.toObject(), member.toObject());
      }, transactionOptions);
    } catch (error) {
      if (error.code === 11000) {
        const winner = await existingSnapshot();
        if (winner) return winner;
      }
      throw error;
    }
    return result;
  }
  const safe =
    (operation) =>
    async (...args) => {
      try {
        return await operation(...args);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        console.error('Wedding operation failed.');
        throw new ApiError(
          503,
          'WEDDING_UNAVAILABLE',
          'We could not load or save your wedding. Please try again.',
        );
      }
    };
  return { current: safe(current), read: safe(read), create: safe(create) };
}
