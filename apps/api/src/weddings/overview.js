import { Types } from 'mongoose';
import { ApiError } from '../lib/api-error.js';
import { authModels } from '../auth/models.js';
import { weddingModels } from './models.js';
import { eventModels } from '../events/models.js';
import { taskModels } from '../tasks/models.js';
import { taskQueryFilter } from '../tasks/query.js';
import { invitationModels } from '../invitations/models.js';

// Counts only: never materialize directory, task, invitation or audit records.
export async function readWeddingOverview(
  { database, now },
  userId,
  weddingId,
) {
  const absent = () =>
    new ApiError(404, 'WEDDING_NOT_FOUND', 'This wedding is not available.');
  if (!/^[a-f\d]{24}$/.test(weddingId)) throw absent();
  const connection = await database.connect();
  const { User } = authModels(connection);
  const { Wedding, WeddingMember } = weddingModels(connection);
  const { Task } = taskModels(connection);
  const { Event } = eventModels(connection);
  let result;
  await connection.transaction(
    async (session) => {
      const user = await User.findOne({
        _id: userId,
        status: 'ACTIVE',
        emailVerifiedAt: { $ne: null },
      })
        .select('_id')
        .session(session)
        .lean();
      if (!user)
        throw new ApiError(
          401,
          'SESSION_EXPIRED',
          'Please sign in to continue.',
        );
      const roles = ['ADMIN', 'FAMILY_MEMBER', 'VIEWER'];
      const member = await WeddingMember.findOne({
        userId,
        weddingId,
        status: 'ACTIVE',
        role: { $in: roles },
      })
        .select('role')
        .session(session)
        .lean();
      const wedding =
        member &&
        (await Wedding.findOne({ _id: weddingId, deletedAt: null })
          .select('mainDate')
          .session(session)
          .lean());
      if (!wedding) throw absent();
      const instant = now();
      const [members = {}] = await WeddingMember.aggregate([
        {
          $match: {
            weddingId: new Types.ObjectId(weddingId),
            status: 'ACTIVE',
            role: { $in: roles },
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
        { $count: 'total' },
      ]).session(session);
      const [tasks = { total: 0, completed: 0 }] = await Task.aggregate([
        { $match: taskQueryFilter({}, weddingId, userId, false, instant) },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
            },
          },
        },
        { $project: { _id: 0, total: 1, completed: 1 } },
      ]).session(session);
      const ceremonies = await Event.countDocuments({
        weddingId,
        deletedAt: null,
        status: { $in: ['PLANNED', 'CONFIRMED'] },
        endAt: { $gte: instant },
      }).session(session);
      result = {
        role: member.role,
        collaborators: members.total || 0,
        ceremonies,
        tasks: {
          ...tasks,
          progress: tasks.total
            ? Math.round((tasks.completed / tasks.total) * 100)
            : 0,
        },
      };
      // Omit the field and skip the query entirely for Family Members and Viewers.
      if (member.role === 'ADMIN') {
        const { MemberInvitation } = invitationModels(connection);
        result.pendingInvites = await MemberInvitation.countDocuments({
          weddingId,
          status: 'PENDING',
          expiresAt: { $gt: instant },
        }).session(session);
      }
    },
    { readConcern: { level: 'snapshot' }, maxCommitTimeMS: 5000 },
  );
  return result;
}
