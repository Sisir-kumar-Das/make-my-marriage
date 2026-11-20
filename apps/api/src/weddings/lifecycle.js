import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../lib/api-error.js';
import { authModels } from '../auth/models.js';
import { eventModels } from '../events/models.js';
import { invitationModels } from '../invitations/models.js';
import { weddingModels, weddingLifecycleRequestModel } from './models.js';
import { idempotencyKeySchema } from './validation.js';

export const RECOVERY_MS = 7 * 86400000;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const absent = () =>
  new ApiError(404, 'WEDDING_NOT_FOUND', 'This wedding is not available.');
export function recoverySummary(wedding, member, instant) {
  const deleted = !!wedding.deletedAt;
  const deadline =
    wedding.purgeAfter ||
    (deleted && new Date(+new Date(wedding.deletedAt) + RECOVERY_MS));
  const state = !deleted
    ? 'ACTIVE'
    : wedding.purgeState === 'PURGING'
      ? 'PURGING'
      : deadline <= instant
        ? 'EXPIRED'
        : 'RECOVERABLE';
  return {
    id: String(wedding._id),
    name: wedding.name,
    version: wedding.__v,
    serverNow: instant.toISOString(),
    state,
    canDelete: !deleted && member.role === 'ADMIN',
    canRestore: state === 'RECOVERABLE' && member.role === 'ADMIN',
    ...(deleted && {
      deletedAt: new Date(wedding.deletedAt).toISOString(),
      purgeAfter: new Date(deadline).toISOString(),
    }),
  };
}
async function eligible(
  connection,
  userId,
  weddingId,
  transaction,
  lock = false,
) {
  const { User } = authModels(connection);
  const { Wedding, WeddingMember } = weddingModels(connection);
  const user = lock
    ? await User.updateOne(
        { _id: userId, status: 'ACTIVE', emailVerifiedAt: { $ne: null } },
        { $inc: { __v: 1 } },
        { session: transaction },
      )
    : await User.exists({
        _id: userId,
        status: 'ACTIVE',
        emailVerifiedAt: { $ne: null },
      }).session(transaction);
  if (lock ? user.matchedCount !== 1 : !user)
    throw new ApiError(401, 'SESSION_EXPIRED', 'Please sign in to continue.');
  const member = await WeddingMember.findOne({
    userId,
    weddingId,
    status: 'ACTIVE',
  })
    .session(transaction)
    .lean();
  const wedding =
    member && (await Wedding.findById(weddingId).session(transaction).lean());
  if (!wedding) throw absent();
  if (lock) {
    if (member.role !== 'ADMIN')
      throw new ApiError(
        403,
        'ADMIN_REQUIRED',
        'Only an Admin can delete or restore this wedding.',
      );
    const locked = await WeddingMember.updateOne(
      { _id: member._id, role: 'ADMIN', status: 'ACTIVE' },
      { $inc: { settingsLockVersion: 1 } },
      { session: transaction, timestamps: false },
    );
    if (locked.matchedCount !== 1) throw absent();
  }
  return { member, wedding };
}
export async function readLifecycle({ database, now }, userId, weddingId) {
  if (!/^[a-f\d]{24}$/.test(weddingId)) throw absent();
  const connection = await database.connect();
  let result;
  await connection.transaction(
    async (transaction) => {
      const { wedding, member } = await eligible(
        connection,
        userId,
        weddingId,
        transaction,
      );
      result = recoverySummary(wedding, member, now());
    },
    { readConcern: { level: 'snapshot' } },
  );
  return { lifecycle: result };
}
function lifecycleOperation(action, raw, match, key) {
  const parsed = (
    action === 'DELETE'
      ? z.object({ confirmation: z.literal('DELETE') }).strict()
      : z.object({}).strict()
  ).safeParse(raw);
  if (!parsed.success)
    throw new ApiError(
      400,
      'INVALID_CONFIRMATION',
      'Check the confirmation before continuing.',
    );
  if (
    !/^"(?:0|[1-9]\d*)"$/.test(match || '') ||
    !Number.isSafeInteger(Number(match.slice(1, -1)))
  )
    throw new ApiError(
      428,
      'VERSION_REQUIRED',
      'Reload the current wedding before continuing.',
    );
  if (!idempotencyKeySchema.safeParse(key).success)
    throw new ApiError(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Provide a valid request key.',
    );
  const version = Number(match.slice(1, -1));
  const keyHash = hash(key),
    requestHash = hash(JSON.stringify([action, version, parsed.data]));
  return { version, keyHash, requestHash };
}

export async function changeLifecycle(
  { database, now },
  action,
  userId,
  weddingId,
  raw,
  match,
  key,
) {
  if (!/^[a-f\d]{24}$/.test(weddingId)) throw absent();
  const { version, keyHash, requestHash } = lifecycleOperation(
    action,
    raw,
    match,
    key,
  );
  const connection = await database.connect();
  const { Wedding } = weddingModels(connection);
  const WeddingLifecycleRequest = weddingLifecycleRequestModel(connection);
  const { MemberInvitation } = invitationModels(connection);
  const { Activity } = eventModels(connection);
  let result;
  await connection.transaction(
    async (transaction) => {
      const instant = now();
      const { wedding, member } = await eligible(
        connection,
        userId,
        weddingId,
        transaction,
        true,
      );
      const receipt = await WeddingLifecycleRequest.findOne({
        userId,
        weddingId,
        keyHash,
        expiresAt: { $gt: instant },
      })
        .session(transaction)
        .lean();
      if (receipt) {
        if (receipt.requestHash !== requestHash)
          throw new ApiError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'This request key belongs to a different change.',
          );
        result = {
          lifecycle: recoverySummary(wedding, member, instant),
          replayed: true,
        };
        return;
      }
      if (wedding.__v !== version)
        throw new ApiError(
          409,
          'VERSION_CONFLICT',
          'Wedding details or its recovery state changed. Reload before confirming again.',
        );
      if (action === 'DELETE' && wedding.deletedAt)
        throw new ApiError(
          409,
          'ALREADY_DELETED',
          'This wedding is already scheduled for deletion.',
        );
      if (action === 'RESTORE') {
        if (!wedding.deletedAt)
          throw new ApiError(
            409,
            'ALREADY_RESTORED',
            'This wedding is already active.',
          );
        if (!recoverySummary(wedding, member, instant).canRestore)
          throw new ApiError(
            410,
            'RECOVERY_EXPIRED',
            'The seven-day recovery window has expired.',
          );
      }
      if (action === 'DELETE') {
        if (
          (await MemberInvitation.countDocuments({
            weddingId,
            status: 'PENDING',
          }).session(transaction)) > 1000
        )
          throw new ApiError(
            409,
            'LIFECYCLE_LIMIT',
            'Too many pending invitations to delete safely in one operation.',
          );
        await MemberInvitation.updateMany(
          { weddingId, status: 'PENDING' },
          { $set: { status: 'REVOKED' }, $inc: { __v: 1 } },
          { session: transaction },
        );
      }
      const set =
        action === 'DELETE'
          ? {
              deletedAt: instant,
              deletedBy: userId,
              purgeAfter: new Date(+instant + RECOVERY_MS),
              purgeState: 'WAITING',
              purgeLeaseUntil: null,
              purgeRetryAt: null,
            }
          : {
              deletedAt: null,
              deletedBy: null,
              purgeAfter: null,
              purgeState: 'WAITING',
              purgeLeaseUntil: null,
              purgeRetryAt: null,
            };
      const updated = await Wedding.findOneAndUpdate(
        { _id: weddingId, __v: version },
        { $set: set, $inc: { __v: 1 } },
        { session: transaction, returnDocument: 'after' },
      ).lean();
      if (!updated)
        throw new ApiError(
          409,
          'VERSION_CONFLICT',
          'Wedding state changed. Reload before continuing.',
        );
      await Activity.create(
        [
          {
            weddingId,
            actorId: userId,
            entityId: weddingId,
            entityType: 'WEDDING',
            action:
              action === 'DELETE' ? 'WEDDING_DELETED' : 'WEDDING_RESTORED',
            feedHidden: true,
            createdAt: instant,
          },
        ],
        { session: transaction },
      );
      await WeddingLifecycleRequest.findOneAndUpdate(
        { weddingId, userId, keyHash },
        { $set: { requestHash, expiresAt: new Date(+instant + 86400000) } },
        { upsert: true, session: transaction },
      );
      result = {
        lifecycle: recoverySummary(updated, member, instant),
        replayed: false,
      };
    },
    { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
  );
  return result;
}

// POST keeps the original key/body out of URLs. This operation only reads the
// authorized actor's receipt and current root from one consistent snapshot.
export async function readLifecycleResult(
  { database, now },
  userId,
  weddingId,
  raw,
  match,
  key,
) {
  if (!/^[a-f\d]{24}$/.test(weddingId)) throw absent();
  const parsed = z
    .object({ action: z.enum(['DELETE', 'RESTORE']), body: z.unknown() })
    .strict()
    .safeParse(raw);
  if (!parsed.success)
    throw new ApiError(
      400,
      'INVALID_CONFIRMATION',
      'Check the original request before continuing.',
    );
  const { keyHash, requestHash } = lifecycleOperation(
    parsed.data.action,
    parsed.data.body,
    match,
    key,
  );
  const connection = await database.connect();
  const Receipt = weddingLifecycleRequestModel(connection);
  let result;
  await connection.transaction(
    async (transaction) => {
      const { wedding, member } = await eligible(
        connection,
        userId,
        weddingId,
        transaction,
      );
      if (member.role !== 'ADMIN')
        throw new ApiError(
          403,
          'ADMIN_REQUIRED',
          'Only an Admin can check this wedding request.',
        );
      const instant = now();
      const receipt = await Receipt.findOne({
        userId,
        weddingId,
        keyHash,
        expiresAt: { $gt: instant },
      })
        .session(transaction)
        .lean();
      if (receipt && receipt.requestHash !== requestHash)
        throw new ApiError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'This request key belongs to a different change.',
        );
      result = receipt
        ? {
            confirmed: true,
            lifecycle: recoverySummary(wedding, member, instant),
          }
        : { confirmed: false };
    },
    { readConcern: { level: 'snapshot' } },
  );
  return result;
}
