import { Types } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '../lib/api-error.js';
import { authModels } from '../auth/models.js';
import { weddingModels } from '../weddings/models.js';
import { taskModels } from '../tasks/models.js';

export const memberRoles = ['ADMIN', 'FAMILY_MEMBER', 'VIEWER'];
const positive = (max) =>
  z
    .string()
    .regex(/^[1-9]\d{0,5}$/)
    .transform(Number)
    .pipe(z.number().max(max));
export const memberListQuery = z
  .object({
    role: z.enum(memberRoles).optional(),
    page: positive(100000).default(1),
    limit: positive(100).default(20),
  })
  .strict();
const validId = (value) =>
  typeof value === 'string' && /^[a-f\d]{24}$/.test(value);
const unavailable = () =>
  new ApiError(404, 'WEDDING_NOT_FOUND', 'This wedding is not available.');

export function memberDirectoryRow(
  row,
  { viewerId, viewerRole, creatorId },
  openTaskCount = 0,
) {
  const isYou = String(row.userId) === String(viewerId);
  const isCreator = String(row.userId) === String(creatorId);
  return {
    id: String(row._id),
    userId: String(row.userId),
    name: row.name,
    role: row.role,
    isYou,
    isCreator,
    relationship: isCreator ? null : row.relationship?.trim() || null,
    openTaskCount,
    ...(viewerRole === 'ADMIN' || isYou ? { email: row.email } : {}),
  };
}

export function createMemberService({ database }) {
  async function list(userId, weddingId, raw = {}) {
    if (!validId(weddingId)) throw unavailable();
    const parsed = memberListQuery.safeParse(raw);
    if (!parsed.success)
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Check the member filters and page.',
      );
    const { role, page, limit } = parsed.data;
    const connection = await database.connect();
    const { User } = authModels(connection);
    const { Wedding, WeddingMember } = weddingModels(connection);
    let result;
    await connection.transaction(
      async (transaction) => {
        const user = await User.findOne({
          _id: userId,
          status: 'ACTIVE',
          emailVerifiedAt: { $ne: null },
        })
          .select('_id')
          .session(transaction)
          .lean();
        if (!user)
          throw new ApiError(
            401,
            'SESSION_EXPIRED',
            'Please sign in to continue.',
          );
        const viewer = await WeddingMember.findOne({
          weddingId,
          userId,
          status: 'ACTIVE',
          role: { $in: memberRoles },
        })
          .select('role')
          .session(transaction)
          .lean();
        const wedding =
          viewer &&
          (await Wedding.findOne({ _id: weddingId, deletedAt: null })
            .select('createdBy')
            .session(transaction)
            .lean());
        if (!wedding) throw unavailable();
        const base = [
          {
            $match: {
              weddingId: new Types.ObjectId(weddingId),
              status: 'ACTIVE',
              role: { $in: memberRoles },
            },
          },
          {
            $lookup: {
              from: User.collection.name,
              localField: 'userId',
              foreignField: '_id',
              as: 'account',
            },
          },
          { $unwind: '$account' },
          {
            $match: {
              'account.status': 'ACTIVE',
              'account.emailVerifiedAt': { $ne: null },
            },
          },
        ];
        const grouped = await WeddingMember.aggregate([
          ...base,
          { $group: { _id: '$role', count: { $sum: 1 } } },
        ]).session(transaction);
        const counts = { ALL: 0, ADMIN: 0, FAMILY_MEMBER: 0, VIEWER: 0 };
        for (const item of grouped) {
          counts[item._id] = item.count;
          counts.ALL += item.count;
        }
        const total = counts[role || 'ALL'];
        const totalPages = Math.ceil(total / limit);
        const selectedPage = Math.min(page, Math.max(1, totalPages));
        const rows = await WeddingMember.aggregate([
          ...base,
          ...(role ? [{ $match: { role } }] : []),
          { $sort: { 'account.profile.displayName': 1, userId: 1 } },
          { $skip: (selectedPage - 1) * limit },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              userId: 1,
              role: 1,
              relationship: 1,
              name: '$account.profile.displayName',
              email:
                viewer.role === 'ADMIN'
                  ? '$account.email'
                  : {
                      $cond: [
                        {
                          $eq: ['$userId', new Types.ObjectId(String(userId))],
                        },
                        '$account.email',
                        '$$REMOVE',
                      ],
                    },
            },
          },
        ]).session(transaction);
        // One bounded aggregate for the visible page, never one task query per member.
        const ids = rows.map((row) => row.userId);
        const taskCounts = ids.length
          ? await taskModels(connection)
              .Task.aggregate([
                {
                  $match: {
                    weddingId: new Types.ObjectId(weddingId),
                    deletedAt: null,
                    recurrenceExcluded: { $ne: true },
                    status: { $in: ['TODO', 'IN_PROGRESS'] },
                    assigneeIds: { $in: ids },
                  },
                },
                {
                  $project: {
                    assignees: { $setIntersection: ['$assigneeIds', ids] },
                  },
                },
                { $unwind: '$assignees' },
                { $group: { _id: '$assignees', count: { $sum: 1 } } },
              ])
              .session(transaction)
          : [];
        const open = new Map(
          taskCounts.map((item) => [String(item._id), item.count]),
        );
        const context = {
          viewerId: userId,
          viewerRole: viewer.role,
          creatorId: wedding.createdBy,
        };
        result = {
          members: rows.map((row) =>
            memberDirectoryRow(row, context, open.get(String(row.userId)) || 0),
          ),
          counts,
          pagination: { page: selectedPage, limit, total, totalPages },
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
    return result;
  }
  return { list };
}
