import { createHash } from 'node:crypto';
import { ApiError } from '../lib/api-error.js';
import { weddingModels } from '../weddings/models.js';
import { eventModels } from '../events/models.js';
import { taskModels } from './models.js';
import {
  taskPageSchema,
  taskKeySchema,
  taskVersion,
  taskWarnings,
} from './validation.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const validId = (value) =>
  typeof value === 'string' && /^[a-f\d]{24}$/.test(value);
const absent = () =>
  new ApiError(404, 'TASK_NOT_FOUND', 'This task is not available.');
export function taskRecoveryScope(role, userId) {
  if (role === 'ADMIN') return {};
  if (role === 'FAMILY_MEMBER') return { createdBy: userId };
  throw new ApiError(
    403,
    'FORBIDDEN',
    'Only an Admin or Family Member can access task recovery.',
  );
}
export function createTaskLifecycle({ database, now, authorize, dtos }) {
  async function actor(
    connection,
    transaction,
    userId,
    weddingId,
    write = false,
  ) {
    const wedding = await authorize(
      connection,
      transaction,
      userId,
      weddingId,
      write,
    );
    const member = await weddingModels(connection)
      .WeddingMember.findOne({ weddingId, userId, status: 'ACTIVE' })
      .session(transaction)
      .lean();
    return { wedding, role: member.role };
  }
  async function listDeleted(userId, weddingId, raw = {}) {
    if (!validId(weddingId)) throw absent();
    const parsed = taskPageSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Check the recovery page and limit.',
      );
    const { page, limit } = parsed.data;
    const connection = await database.connect();
    let result;
    await connection.transaction(
      async (transaction) => {
        const { role } = await actor(
          connection,
          transaction,
          userId,
          weddingId,
        );
        const filter = {
          weddingId,
          deletedAt: { $ne: null },
          ...taskRecoveryScope(role, userId),
        };
        const { Task } = taskModels(connection);
        const total = await Task.countDocuments(filter).session(transaction);
        const totalPages = Math.ceil(total / limit),
          selectedPage = Math.min(page, Math.max(1, totalPages));
        const rows = await Task.find(filter)
          .sort({ deletedAt: -1, _id: -1 })
          .skip((selectedPage - 1) * limit)
          .limit(limit)
          .session(transaction)
          .lean();
        result = {
          tasks: await dtos(connection, transaction, weddingId, rows, now()),
          meta: { page: selectedPage, limit, total, totalPages },
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
    return result;
  }
  async function readDeleted(userId, weddingId, taskId) {
    if (!validId(weddingId) || !validId(taskId)) throw absent();
    const connection = await database.connect();
    let result;
    await connection.transaction(
      async (transaction) => {
        const { role } = await actor(
          connection,
          transaction,
          userId,
          weddingId,
        );
        const row = await taskModels(connection)
          .Task.findOne({
            _id: taskId,
            weddingId,
            deletedAt: { $ne: null },
            ...taskRecoveryScope(role, userId),
          })
          .session(transaction)
          .lean();
        if (!row) throw absent();
        result = {
          task: (
            await dtos(connection, transaction, weddingId, [row], now())
          )[0],
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
    return result;
  }
  async function mutate(
    operation,
    userId,
    weddingId,
    taskId,
    raw,
    key,
    ifMatch,
  ) {
    if (!validId(weddingId) || !validId(taskId)) throw absent();
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      Object.keys(raw).length
    )
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'This action does not accept task changes.',
      );
    if (!taskKeySchema.safeParse(key).success)
      throw new ApiError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Retry this task action with its original key.',
      );
    const version = taskVersion(ifMatch);
    if (version === null)
      throw new ApiError(
        400,
        'VERSION_REQUIRED',
        'Load the current task before continuing.',
      );
    const removing = operation === 'DELETE';
    const requestHash = hash(JSON.stringify({ operation, taskId, version }));
    const connection = await database.connect();
    let result;
    await connection.transaction(
      async (transaction) => {
        const { wedding, role } = await actor(
          connection,
          transaction,
          userId,
          weddingId,
          true,
        );
        const scope = removing ? {} : taskRecoveryScope(role, userId);
        const { Task, TaskWriteRequest } = taskModels(connection);
        const current = await Task.findOne({ _id: taskId, weddingId, ...scope })
          .session(transaction)
          .lean();
        if (!current || (removing && current.recurrenceExcluded))
          throw absent();
        const instant = now(),
          identity = { weddingId, userId, keyHash: hash(key) };
        const previous = await TaskWriteRequest.findOne({
          ...identity,
          expiresAt: { $gt: instant },
        })
          .session(transaction)
          .lean();
        let row;
        if (previous) {
          if (previous.requestHash !== requestHash)
            throw new ApiError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'This action key was used with different details. Refresh the task before continuing.',
            );
          row = current;
        } else {
          if (current.__v !== version)
            throw new ApiError(
              409,
              'VERSION_CONFLICT',
              'This task changed. Refresh its current state before continuing.',
            );
          if (removing === !!current.deletedAt)
            throw new ApiError(
              409,
              'TASK_STATE_CHANGED',
              removing
                ? 'This task is already removed. Refresh the task list.'
                : 'This task is already restored. Refresh removed tasks.',
            );
          row = await Task.findOneAndUpdate(
            { _id: taskId, weddingId, __v: version },
            {
              $set: {
                deletedAt: removing ? instant : null,
                deletedBy: removing ? userId : null,
                updatedBy: userId,
                ...(!removing && { recurrenceExcluded: false }),
                ...(current.seriesId && { occurrenceEdited: true }),
              },
              $inc: { __v: 1 },
            },
            {
              session: transaction,
              returnDocument: 'after',
              runValidators: true,
            },
          ).lean();
          await eventModels(connection).Activity.create(
            [
              {
                weddingId,
                actorId: userId,
                action: removing ? 'TASK_DELETED' : 'TASK_RESTORED',
                entityType: 'TASK',
                entityId: row._id,
                displaySnapshot: { label: row.title },
                createdAt: instant,
              },
            ],
            { session: transaction },
          );
          await TaskWriteRequest.updateOne(
            identity,
            {
              $set: {
                requestHash,
                taskId: row._id,
                seriesId: row.seriesId || null,
                expiresAt: new Date(instant.getTime() + 86400000),
              },
            },
            { session: transaction, upsert: true },
          );
        }
        result = {
          task: (
            await dtos(connection, transaction, weddingId, [row], instant)
          )[0],
          warnings: row.deletedAt ? [] : taskWarnings(row, wedding, instant),
          replayed: !!previous,
        };
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
    return result;
  }
  return {
    listDeleted,
    readDeleted,
    remove: (...args) => mutate('DELETE', ...args),
    restore: (...args) => mutate('RESTORE', ...args),
  };
}
