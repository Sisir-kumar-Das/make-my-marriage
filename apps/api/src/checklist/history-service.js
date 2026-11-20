import { z } from 'zod';
import { ApiError } from '../lib/api-error.js';
import { authModels } from '../auth/models.js';
import { weddingModels } from '../weddings/models.js';
import { checklistModels } from './models.js';

const positive = (maximum) =>
  z
    .union([
      z.number(),
      z
        .string()
        .regex(/^[1-9]\d{0,5}$/)
        .transform(Number),
    ])
    .pipe(z.number().int().min(1).max(maximum));
export const checklistHistoryQuery = z
  .object({
    page: positive(100000).default(1),
    limit: positive(100).default(20),
  })
  .strict();
const noQuery = z.object({}).strict();
const validId = (value) =>
  typeof value === 'string' && /^[a-f\d]{24}$/.test(value);
const missing = () =>
  new ApiError(
    404,
    'GENERATION_NOT_FOUND',
    'This generation record is not available.',
  );
function queryFor(schema, raw) {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Check the history page request.',
    );
  return result.data;
}

export function createChecklistHistory({ database, authorize }) {
  async function records(connection, transaction, weddingId, rows) {
    const ids = [...new Set(rows.map((row) => String(row.createdBy)))];
    const members = await weddingModels(connection)
      .WeddingMember.find({
        weddingId,
        status: 'ACTIVE',
        userId: { $in: ids },
      })
      .select('userId')
      .session(transaction)
      .lean();
    const users = await authModels(connection)
      .User.find({
        _id: { $in: members.map((member) => member.userId) },
        status: 'ACTIVE',
        emailVerifiedAt: { $ne: null },
      })
      .select('profile.displayName')
      .session(transaction)
      .lean();
    const names = new Map(
      users.map((user) => [String(user._id), user.profile.displayName]),
    );
    // Return saved outcomes only; never join task details or expose private receipts.
    return rows.map((row) => ({
      id: String(row._id),
      templateId: row.templateId,
      templateVersion: row.templateVersion,
      templateName: row.templateName,
      weddingDate: row.weddingDate,
      added: row.added,
      kept: row.kept,
      deleted: row.deleted,
      createdAt: row.createdAt.toISOString(),
      initiator: { name: names.get(String(row.createdBy)) || null },
    }));
  }
  async function checklistGenerations(userId, weddingId, raw = {}) {
    if (!validId(weddingId))
      throw new ApiError(
        404,
        'WEDDING_NOT_FOUND',
        'This wedding is not available.',
      );
    const { page, limit } = queryFor(checklistHistoryQuery, raw);
    const connection = await database.connect();
    let result;
    await connection.transaction(
      async (transaction) => {
        await authorize(connection, transaction, userId, weddingId);
        const { ChecklistGeneration } = checklistModels(connection);
        const total = await ChecklistGeneration.countDocuments({
          weddingId,
        }).session(transaction);
        const totalPages = Math.ceil(total / limit);
        const selectedPage = Math.min(page, Math.max(1, totalPages));
        const rows = await ChecklistGeneration.find({ weddingId })
          .select('-addedTaskIds')
          .sort({ createdAt: -1, _id: -1 })
          .skip((selectedPage - 1) * limit)
          .limit(limit)
          .session(transaction)
          .lean();
        result = {
          generations: await records(connection, transaction, weddingId, rows),
          pagination: { page: selectedPage, limit, total, totalPages },
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
    return result;
  }
  async function checklistGeneration(
    userId,
    weddingId,
    generationId,
    raw = {},
  ) {
    if (!validId(weddingId) || !validId(generationId)) throw missing();
    queryFor(noQuery, raw);
    const connection = await database.connect();
    let result;
    await connection.transaction(
      async (transaction) => {
        await authorize(connection, transaction, userId, weddingId);
        const row = await checklistModels(connection)
          .ChecklistGeneration.findOne({
            _id: generationId,
            weddingId,
          })
          .select('-addedTaskIds')
          .session(transaction)
          .lean();
        if (!row) throw missing();
        result = {
          generation: (
            await records(connection, transaction, weddingId, [row])
          )[0],
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
    return result;
  }
  return { checklistGenerations, checklistGeneration };
}
