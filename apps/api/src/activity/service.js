import { Types } from 'mongoose';
import { z } from 'zod';
import { authModels } from '../auth/models.js';
import { checklistModels } from '../checklist/models.js';
import { eventModels } from '../events/models.js';
import { ApiError } from '../lib/api-error.js';
import { memberRoles } from '../members/service.js';
import { taskModels } from '../tasks/models.js';
import { weddingModels } from '../weddings/models.js';

const activityQuery = z
  .object({
    page: z
      .string()
      .regex(/^[1-9]\d{0,5}$/)
      .transform(Number)
      .default(1),
    limit: z.enum(['3', '20']).transform(Number).default(20),
  })
  .strict();
const sharedActions = [
  'TASK_CREATED',
  'TASK_SERIES_CREATED',
  'TASK_UPDATED',
  'TASK_COMPLETED',
  'TASK_DELETED',
  'TASK_RESTORED',
  'EVENT_CREATED',
  'EVENT_UPDATED',
  'EVENT_DELETED',
  'EVENT_RESTORED',
  'CHECKLIST_GENERATED',
  'INVITATION_ACCEPT',
  'MEMBER_UPDATED',
  'MEMBER_REMOVED',
];
const snapshotLabel = (row) => row.displaySnapshot?.label || null;
const unavailable = () =>
  new ApiError(404, 'WEDDING_NOT_FOUND', 'This wedding is not available.');

export function visibleActivity(
  weddingId,
  role,
  { generations, tasks, series },
  ordered = true,
) {
  return [
    {
      $match: {
        weddingId,
        feedHidden: { $ne: true },
        action: {
          $in:
            role === 'ADMIN'
              ? [...sharedActions, 'INVITATION_CREATE']
              : sharedActions,
        },
      },
    },
    ...(ordered ? [{ $sort: { createdAt: -1, _id: -1 } }] : []),
    {
      // New writes classify creation at the source. Only older creation rows
      // need an ID lookup. The boolean sentinel cannot match an ObjectId.
      $set: {
        legacyTaskId: {
          $cond: [
            {
              $and: [
                { $eq: ['$action', 'TASK_CREATED'] },
                { $eq: [{ $type: '$feedHidden' }, 'missing'] },
              ],
            },
            '$entityId',
            false,
          ],
        },
      },
    },
    {
      $lookup: {
        from: generations,
        localField: 'legacyTaskId',
        foreignField: 'addedTaskIds',
        pipeline: [
          { $match: { weddingId } },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: 'generation',
      },
    },
    { $match: { 'generation.0': { $exists: false } } },
    {
      $lookup: {
        from: tasks,
        localField: 'legacyTaskId',
        foreignField: '_id',
        pipeline: [
          { $match: { weddingId, 'source.type': 'RECURRENCE' } },
          {
            $lookup: {
              from: series,
              localField: 'seriesId',
              foreignField: '_id',
              pipeline: [
                { $match: { weddingId } },
                { $project: { createdAt: 1 } },
              ],
              as: 'series',
            },
          },
          // A manually added task can later acquire a series. Its original
          // creation predates that series and remains visible.
          {
            $match: {
              'series.0.createdAt': { $exists: true },
              $expr: {
                $gte: [
                  '$createdAt',
                  { $arrayElemAt: ['$series.createdAt', 0] },
                ],
              },
            },
          },
          { $project: { _id: 1 } },
        ],
        as: 'generatedOccurrence',
      },
    },
    { $match: { 'generatedOccurrence.0': { $exists: false } } },
    {
      $project: {
        actorId: 1,
        action: 1,
        entityId: 1,
        entityType: 1,
        createdAt: 1,
        'displaySnapshot.label': 1,
        'displaySnapshot.role': 1,
        'memberChange.fromRole': 1,
        'memberChange.toRole': 1,
      },
    },
  ];
}

function activityCountPipeline(weddingId, role, collections) {
  const [base, ...classify] = visibleActivity(
    weddingId,
    role,
    collections,
    false,
  );
  const legacy = { action: 'TASK_CREATED', feedHidden: { $exists: false } };
  return [
    base,
    {
      $facet: {
        known: [{ $match: { $nor: [legacy] } }, { $count: 'total' }],
        legacy: [{ $match: legacy }, ...classify, { $count: 'total' }],
      },
    },
    {
      $project: {
        total: {
          $add: [
            { $ifNull: [{ $first: '$known.total' }, 0] },
            { $ifNull: [{ $first: '$legacy.total' }, 0] },
          ],
        },
      },
    },
  ];
}

export function activityRow(row, actors, links) {
  const memberUpdated = row.action === 'MEMBER_UPDATED';
  const role =
    memberUpdated && row.memberChange?.fromRole !== row.memberChange?.toRole
      ? row.memberChange?.toRole
      : row.action === 'INVITATION_ACCEPT'
        ? row.displaySnapshot?.role
        : null;
  const invitation = row.action.startsWith('INVITATION_');
  const label = snapshotLabel(row);
  return {
    id: String(row._id),
    actor: actors.get(String(row.actorId)) || 'Wedding team',
    action: row.action,
    label: invitation
      ? null
      : memberUpdated
        ? label?.replace(/^Member access updated: /, '')
        : row.action === 'MEMBER_REMOVED'
          ? label?.replace(/^Member access removed: /, '')
          : label,
    role: memberRoles.includes(role) ? role : null,
    createdAt: row.createdAt.toISOString(),
    href: row.action.endsWith('_DELETED')
      ? null
      : links.get(String(row.entityId)) || null,
  };
}

export function createActivityService({ database }) {
  return async function list(userId, weddingId, raw) {
    if (!/^[a-f\d]{24}$/.test(weddingId)) throw unavailable();
    const parsed = activityQuery.safeParse(raw);
    if (!parsed.success)
      throw new ApiError(400, 'VALIDATION_ERROR', 'Check the activity page.');

    const { page, limit } = parsed.data;
    const connection = await database.connect();
    const { Wedding, WeddingMember } = weddingModels(connection);
    const { User } = authModels(connection);
    const { Activity, Event } = eventModels(connection);
    const { Task, TaskSeries } = taskModels(connection);
    const { ChecklistGeneration } = checklistModels(connection);
    return connection.transaction(
      async (session) => {
        const user = await User.exists({
          _id: userId,
          status: 'ACTIVE',
          emailVerifiedAt: { $ne: null },
        }).session(session);
        if (!user)
          throw new ApiError(
            401,
            'SESSION_EXPIRED',
            'Please sign in to continue.',
          );
        const member = await WeddingMember.findOne({
          userId,
          weddingId,
          status: 'ACTIVE',
          role: { $in: memberRoles },
        })
          .select('role')
          .session(session)
          .lean();
        if (
          !member ||
          !(await Wedding.exists({ _id: weddingId, deletedAt: null }).session(
            session,
          ))
        )
          throw unavailable();

        const id = new Types.ObjectId(weddingId);
        const collections = {
          generations: ChecklistGeneration.collection.name,
          tasks: Task.collection.name,
          series: TaskSeries.collection.name,
        };
        const pipeline = visibleActivity(id, member.role, collections);
        const preview = limit === 3;
        let total = 0;
        if (!preview) {
          const [count] = await Activity.aggregate(
            activityCountPipeline(id, member.role, collections),
          ).session(session);
          total = count?.total || 0;
        }
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const selectedPage = preview ? 1 : Math.min(page, totalPages);
        const offset = (selectedPage - 1) * limit;
        const rows =
          preview || total
            ? await Activity.aggregate([
                ...pipeline,
                ...(preview ? [] : [{ $skip: offset }]),
                { $limit: limit },
              ]).session(session)
            : [];
        const names = await User.find({
          _id: { $in: rows.map((row) => row.actorId) },
        })
          .select('profile.displayName')
          .session(session)
          .lean();
        const actors = new Map(
          names.map((user) => [String(user._id), user.profile?.displayName]),
        );
        const links = new Map();
        for (const [entityType, model, path] of [
          ['TASK', Task, '/tasks?task='],
          ['EVENT', Event, '/events?event='],
        ]) {
          const ids = rows
            .filter(
              (row) =>
                row.entityType === entityType &&
                !row.action.endsWith('_DELETED'),
            )
            .map((row) => row.entityId);
          if (!ids.length) continue;
          const active = await model
            .find({
              _id: { $in: ids },
              weddingId,
              deletedAt: null,
              ...(entityType === 'TASK'
                ? { recurrenceExcluded: { $ne: true } }
                : {}),
            })
            .select('_id')
            .session(session)
            .lean();
          for (const { _id } of active) links.set(String(_id), path + _id);
        }
        return {
          items: rows.map((row) => activityRow(row, actors, links)),
          ...(!preview && {
            page: selectedPage,
            totalPages,
            total,
            from: rows.length ? offset + 1 : 0,
            to: offset + rows.length,
          }),
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
  };
}
