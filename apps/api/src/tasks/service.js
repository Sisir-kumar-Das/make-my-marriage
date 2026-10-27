import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { ApiError } from '../lib/api-error.js';
import { authModels } from '../auth/models.js';
import { weddingModels } from '../weddings/models.js';
import { eventModels } from '../events/models.js';
import { taskModels } from './models.js';
import { taskQueryFilter } from './query.js';
import { createRecurrenceService } from './recurrence-service.js';
import { createTaskLifecycle } from './lifecycle-service.js';
import {
  createTaskSchema,
  patchTaskSchema,
  taskFieldsSchema,
  taskListSchema,
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
function parse(schema, raw) {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Please check your task details.',
      {
        fields: Object.fromEntries(
          result.error.issues.map((issue) => [
            issue.path.join('.'),
            issue.message,
          ]),
        ),
      },
    );
  return result.data;
}
export function createTaskService({ database, now = () => new Date() }) {
  async function authorize(
    connection,
    transaction,
    userId,
    weddingId,
    write = false,
  ) {
    const { User } = authModels(connection);
    const { Wedding, WeddingMember } = weddingModels(connection);
    const eligible = {
      _id: userId,
      status: 'ACTIVE',
      emailVerifiedAt: { $ne: null },
    };
    const user = write
      ? (
          await User.updateOne(
            eligible,
            { $inc: { __v: 1 } },
            { session: transaction },
          )
        ).matchedCount === 1
      : await User.findOne(eligible).session(transaction).lean();
    if (!user)
      throw new ApiError(401, 'SESSION_EXPIRED', 'Please sign in to continue.');
    const member = await WeddingMember.findOne({
      weddingId,
      userId,
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
    if (write) {
      if (!['ADMIN', 'FAMILY_MEMBER'].includes(member.role))
        throw new ApiError(
          403,
          'FORBIDDEN',
          'Only an Admin or Family Member can manage tasks.',
        );
      await WeddingMember.updateOne(
        { _id: member._id, status: 'ACTIVE', role: member.role },
        { $inc: { __v: 1 } },
        { session: transaction },
      );
      await Wedding.updateOne(
        { _id: weddingId, deletedAt: null },
        { $inc: { taskRevision: 1 } },
        { session: transaction },
      );
    }
    return wedding;
  }
  async function assigneeMembers(
    connection,
    transaction,
    weddingId,
    ids,
    lock = false,
  ) {
    const { WeddingMember } = weddingModels(connection);
    const { User } = authModels(connection);
    const members = await WeddingMember.find({
      weddingId,
      status: 'ACTIVE',
      userId: { $in: ids },
    })
      .sort({ userId: 1 })
      .session(transaction)
      .lean();
    const users = await User.find({
      _id: { $in: members.map((m) => m.userId) },
      status: 'ACTIVE',
      emailVerifiedAt: { $ne: null },
    })
      .select('profile.displayName')
      .session(transaction)
      .lean();
    const names = new Map(
      users.map((u) => [String(u._id), u.profile.displayName]),
    );
    const eligible = members.filter((m) => names.has(String(m.userId)));
    if (lock) {
      // Share write locks with future membership removal/account disable operations.
      for (const member of eligible) {
        await WeddingMember.updateOne(
          { _id: member._id },
          { $inc: { __v: 1 } },
          { session: transaction },
        );
        await User.updateOne(
          { _id: member.userId },
          { $inc: { __v: 1 } },
          { session: transaction },
        );
      }
    }
    return new Map(
      eligible.map((m) => [
        String(m.userId),
        {
          id: String(m.userId),
          name: names.get(String(m.userId)),
          role: m.role,
          available: true,
        },
      ]),
    );
  }
  async function assignees(userId, weddingId, raw = {}) {
    if (!validId(weddingId)) throw absent();
    const { page, limit } = parse(taskPageSchema, raw);
    const connection = await database.connect();
    let result;
    await connection.transaction(
      async (transaction) => {
        await authorize(connection, transaction, userId, weddingId);
        const { WeddingMember } = weddingModels(connection);
        const { User } = authModels(connection);
        const pipeline = [
          {
            $match: {
              weddingId: new Types.ObjectId(weddingId),
              status: 'ACTIVE',
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
          { $sort: { 'account.profile.displayName': 1, userId: 1 } },
          {
            $facet: {
              total: [{ $count: 'count' }],
              members: [
                { $skip: (page - 1) * limit },
                { $limit: limit },
                {
                  $project: {
                    _id: 0,
                    id: { $toString: '$userId' },
                    name: '$account.profile.displayName',
                    role: 1,
                    available: { $literal: true },
                  },
                },
              ],
            },
          },
        ];
        const [data] =
          await WeddingMember.aggregate(pipeline).session(transaction);
        const total = data.total[0]?.count || 0;
        result = {
          members: data.members,
          meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
    return result;
  }
  async function dtos(connection, transaction, weddingId, rows, instant) {
    const ids = rows.flatMap((row) => (row.eventId ? [row.eventId] : []));
    const related = ids.length
      ? await eventModels(connection)
          .Event.find({ _id: { $in: ids }, weddingId, deletedAt: null })
          .select('name')
          .session(transaction)
          .lean()
      : [];
    const names = new Map(
      related.map((event) => [String(event._id), event.name]),
    );
    const collaborators = await assigneeMembers(
      connection,
      transaction,
      weddingId,
      rows.flatMap((row) => row.assigneeIds || []),
    );
    const removers = await assigneeMembers(
      connection,
      transaction,
      weddingId,
      rows.flatMap((row) => (row.deletedBy ? [row.deletedBy] : [])),
    );
    const seriesRows = await taskModels(connection)
      .TaskSeries.find({
        _id: {
          $in: rows.flatMap((row) => (row.seriesId ? [row.seriesId] : [])),
        },
        weddingId,
      })
      .select(
        'frequency interval startDate endDate time active generationIssue __v',
      )
      .session(transaction)
      .lean();
    const seriesById = new Map(
      seriesRows.map((item) => [String(item._id), item]),
    );
    return rows.map((row) => ({
      id: String(row._id),
      weddingId: String(row.weddingId),
      title: row.title,
      description: row.description || '',
      status: row.status,
      priority: row.priority,
      dueAt: row.dueAt?.toISOString() || null,
      dueDateOnly: !!row.dueDateOnly,
      overdue: row.status !== 'COMPLETED' && !!row.dueAt && row.dueAt < instant,
      eventId: row.eventId ? String(row.eventId) : null,
      event: row.eventId
        ? {
            id: String(row.eventId),
            name: names.get(String(row.eventId)) || null,
            available: names.has(String(row.eventId)),
          }
        : null,
      assigneeIds: (row.assigneeIds || []).map(String),
      assignees: (row.assigneeIds || []).map(
        (id) =>
          collaborators.get(String(id)) || {
            id: String(id),
            name: null,
            role: null,
            available: false,
          },
      ),
      seriesId: row.seriesId ? String(row.seriesId) : null,
      occurrenceDate: row.occurrenceDate || null,
      occurrenceEdited: !!row.occurrenceEdited,
      recurrenceExcluded: !!row.recurrenceExcluded,
      repeat:
        row.seriesId && seriesById.has(String(row.seriesId))
          ? (() => {
              const item = seriesById.get(String(row.seriesId));
              return {
                frequency: item.frequency,
                interval: item.interval,
                startDate: item.startDate,
                endDate: item.endDate,
                time: item.time,
                active: item.active,
                generationIssue: item.generationIssue,
                version: item.__v,
              };
            })()
          : null,
      source: row.source,
      createdBy: String(row.createdBy),
      deletedAt: row.deletedAt?.toISOString() || null,
      deletedBy: row.deletedBy ? String(row.deletedBy) : null,
      deletedByName: row.deletedBy
        ? removers.get(String(row.deletedBy))?.name || 'Former wedding member'
        : null,
      completedAt: row.completedAt?.toISOString() || null,
      completedBy: row.completedBy ? String(row.completedBy) : null,
      version: row.__v,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
  async function list(userId, weddingId, raw = {}, mine = false) {
    if (!validId(weddingId))
      throw new ApiError(
        404,
        'WEDDING_NOT_FOUND',
        'This wedding is not available.',
      );
    const query = parse(taskListSchema, raw);
    const { page, limit } = query;
    const connection = await database.connect(),
      { Task } = taskModels(connection);
    let result;
    await connection.transaction(
      async (transaction) => {
        await authorize(connection, transaction, userId, weddingId);
        const instant = now();
        const allFilter = taskQueryFilter(
          query,
          weddingId,
          userId,
          false,
          instant,
        );
        const myFilter = taskQueryFilter(
          query,
          weddingId,
          userId,
          true,
          instant,
        );
        const filter = mine ? myFilter : allFilter;
        const allTotal =
          await Task.countDocuments(allFilter).session(transaction);
        const myTotal =
          await Task.countDocuments(myFilter).session(transaction);
        const grouped = await Task.aggregate([
          { $match: filter },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              completed: {
                $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
              },
              inProgress: {
                $sum: { $cond: [{ $eq: ['$status', 'IN_PROGRESS'] }, 1, 0] },
              },
              overdue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ['$status', 'COMPLETED'] },
                        { $ne: ['$dueAt', null] },
                        { $lt: ['$dueAt', instant] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]).session(transaction);
        const {
          total = 0,
          completed = 0,
          inProgress = 0,
          overdue = 0,
        } = grouped[0] || {};
        const totalPages = Math.ceil(total / limit),
          selectedPage = Math.min(page, Math.max(1, totalPages));
        const rows = await Task.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((selectedPage - 1) * limit)
          .limit(limit)
          .session(transaction)
          .lean();
        result = {
          tasks: await dtos(connection, transaction, weddingId, rows, instant),
          meta: {
            page: selectedPage,
            limit,
            total,
            totalPages,
            counts: { total, completed, inProgress, overdue },
            allTotal,
            myTotal,
          },
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
    return result;
  }
  async function read(userId, weddingId, taskId) {
    if (!validId(weddingId) || !validId(taskId)) throw absent();
    const connection = await database.connect(),
      { Task } = taskModels(connection);
    let result;
    await connection.transaction(
      async (transaction) => {
        const wedding = await authorize(
          connection,
          transaction,
          userId,
          weddingId,
        );
        const task = await Task.findOne({
          _id: taskId,
          weddingId,
          deletedAt: null,
        })
          .session(transaction)
          .lean();
        if (!task || task.recurrenceExcluded) throw absent();
        const instant = now();
        result = {
          task: (
            await dtos(connection, transaction, weddingId, [task], instant)
          )[0],
          warnings: taskWarnings(task, wedding, instant),
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
    return result;
  }
  async function write(userId, weddingId, taskId, raw, key, ifMatch) {
    if (!validId(weddingId) || (taskId && !validId(taskId))) throw absent();
    const input = parse(taskId ? patchTaskSchema : createTaskSchema, raw);
    if (!taskKeySchema.safeParse(key).success)
      throw new ApiError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Please retry saving this task.',
      );
    const version = taskId ? taskVersion(ifMatch) : null;
    if (taskId && version === null)
      throw new ApiError(
        400,
        'VERSION_REQUIRED',
        'Load the current task before editing.',
      );
    const requestHash = hash(
      JSON.stringify({ taskId: taskId || null, version, input }),
    );
    const connection = await database.connect(),
      { Task, TaskWriteRequest } = taskModels(connection),
      { Activity, Event } = eventModels(connection);
    let result;
    await connection.transaction(
      async (transaction) => {
        const wedding = await authorize(
          connection,
          transaction,
          userId,
          weddingId,
          true,
        );
        const identity = { weddingId, userId, keyHash: hash(key) };
        const previous = await TaskWriteRequest.findOne({
          ...identity,
          expiresAt: { $gt: now() },
        })
          .session(transaction)
          .lean();
        if (previous) {
          if (previous.requestHash !== requestHash)
            throw new ApiError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'This save key was used with different task details. Load the latest task before trying again.',
            );
          const task = await Task.findOne({
            _id: previous.taskId,
            weddingId,
            deletedAt: null,
          })
            .session(transaction)
            .lean();
          if (!task) throw absent();
          const instant = now();
          result = {
            task: (
              await dtos(connection, transaction, weddingId, [task], instant)
            )[0],
            warnings: taskWarnings(task, wedding, instant),
            replayed: true,
          };
          return;
        }
        const current = taskId
          ? await Task.findOne({ _id: taskId, weddingId, deletedAt: null })
              .session(transaction)
              .lean()
          : null;
        if (taskId && (!current || current.recurrenceExcluded)) throw absent();
        if (taskId && current.__v !== version)
          throw new ApiError(
            409,
            'VERSION_CONFLICT',
            'This task changed in another tab or by another member. Load the latest task before saving again.',
          );
        const merged = parse(taskFieldsSchema, {
          assigneeIds: (current?.assigneeIds || []).map(String),
          title: current?.title,
          description: current?.description || '',
          status: current?.status,
          priority: current?.priority,
          eventId: current?.eventId ? String(current.eventId) : null,
          dueAt: current?.dueAt?.toISOString() || null,
          dueDateOnly: !!current?.dueDateOnly,
          ...Object.fromEntries(
            Object.entries(input).filter(([key]) => key !== 'recurrence'),
          ),
        });
        if (merged.eventId) {
          const linked = await Event.findOne({
            _id: merged.eventId,
            weddingId,
            deletedAt: null,
          })
            .session(transaction)
            .lean();
          if (
            !linked &&
            merged.eventId !==
              (current?.eventId ? String(current.eventId) : null)
          )
            throw new ApiError(
              400,
              'EVENT_UNAVAILABLE',
              'The selected ceremony is no longer available. Choose another ceremony or leave this task wedding-wide.',
              { fields: { eventId: 'Choose an available ceremony.' } },
            );
        }
        const selected = await assigneeMembers(
          connection,
          transaction,
          weddingId,
          merged.assigneeIds,
          true,
        );
        if (selected.size !== merged.assigneeIds.length)
          throw new ApiError(
            400,
            'ASSIGNEE_UNAVAILABLE',
            'An assignee is no longer available. Refresh members and remove or replace unavailable selections before saving.',
            {
              fields: {
                assigneeIds: 'Choose only active members of this wedding.',
              },
              unavailableAssigneeIds: merged.assigneeIds.filter(
                (id) => !selected.has(id),
              ),
            },
          );
        const instant = now();
        const completion =
          merged.status === 'COMPLETED'
            ? {
                completedAt:
                  current?.status === 'COMPLETED'
                    ? current.completedAt
                    : instant,
                completedBy:
                  current?.status === 'COMPLETED'
                    ? current.completedBy
                    : userId,
              }
            : { completedAt: null, completedBy: null };
        let task;
        let generatedCount;
        if (input.recurrence) {
          const created = await recurrence.create(
            connection,
            transaction,
            userId,
            wedding,
            merged,
            input.recurrence,
            current,
            version,
            instant,
          );
          task = created.task;
          generatedCount = created.generatedCount;
        } else if (taskId) {
          task = await Task.findOneAndUpdate(
            { _id: taskId, weddingId, deletedAt: null, __v: version },
            {
              $set: {
                ...merged,
                ...completion,
                updatedBy: userId,
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
          if (!task)
            throw new ApiError(
              409,
              'VERSION_CONFLICT',
              'This task changed. Load its latest details.',
            );
        } else {
          const [created] = await Task.create(
            [
              {
                ...merged,
                ...completion,
                weddingId,
                createdBy: userId,
                updatedBy: userId,
                source: { type: 'MANUAL' },
              },
            ],
            { session: transaction },
          );
          task = created.toObject();
        }
        if (!input.recurrence)
          await Activity.create(
            [
              {
                weddingId,
                actorId: userId,
                action: taskId ? 'TASK_UPDATED' : 'TASK_CREATED',
                entityType: 'TASK',
                entityId: task._id,
                displaySnapshot: { label: task.title },
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
              taskId: task._id,
              seriesId: task.seriesId || null,
              expiresAt: new Date(instant.getTime() + 86400000),
            },
          },
          { session: transaction, upsert: true },
        );
        result = {
          task: (
            await dtos(connection, transaction, weddingId, [task], instant)
          )[0],
          warnings: [
            ...taskWarnings(task, wedding, instant),
            ...(input.recurrence?.endDate > wedding.mainDate
              ? [
                  {
                    code: 'REPEAT_AFTER_WEDDING_DATE',
                    message:
                      'This repeat pattern continues after your wedding date. You can save the explicit end date you chose.',
                  },
                ]
              : []),
          ],
          replayed: false,
          ...(generatedCount !== undefined && { generatedCount }),
        };
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
    return result;
  }
  const recurrence = createRecurrenceService({
    database,
    now,
    authorize,
    assigneeMembers,
  });
  const lifecycle = createTaskLifecycle({ database, now, authorize, dtos });
  return {
    ...lifecycle,
    readSeries: recurrence.read,
    updateSeries: recurrence.update,
    pumpRecurrence: recurrence.pump,
    close: recurrence.close,
    list,
    my: (userId, weddingId, raw) => list(userId, weddingId, raw, true),
    assignees,
    read,
    create: (userId, weddingId, raw, key) =>
      write(userId, weddingId, null, raw, key),
    update: (userId, weddingId, taskId, raw, key, ifMatch) =>
      write(userId, weddingId, taskId, raw, key, ifMatch),
  };
}
