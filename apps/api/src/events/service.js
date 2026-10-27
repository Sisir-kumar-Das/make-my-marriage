import { createHash } from 'node:crypto';
import { ApiError } from '../lib/api-error.js';
import { authModels } from '../auth/models.js';
import { weddingModels } from '../weddings/models.js';
import { eventModels } from './models.js';
import { taskModels } from '../tasks/models.js';
import { eventListFilter } from './list-filter.js';
import {
  activityDto,
  materializeActivities,
  activityChanges,
  activityTimingWarnings,
} from './activities.js';
import { Types } from 'mongoose';
import {
  createEventSchema,
  patchEventSchema,
  eventListSchema,
  eventKeySchema,
  eventVersion,
  createActivitySchema,
  patchActivitySchema,
  removeActivitySchema,
  activityLimit,
  eventLifecycleSchema,
  eventRecoveryListSchema,
} from './validation.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const validId = (value) =>
  typeof value === 'string' && /^[a-f\d]{24}$/.test(value);
const absent = () =>
  new ApiError(404, 'EVENT_NOT_FOUND', 'This event is not available.');
const conflict = () =>
  new ApiError(
    409,
    'VERSION_CONFLICT',
    'This event changed in another tab or by another member. Load its latest details before saving again.',
  );
const parse = (schema, raw) => {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Please check your event details.',
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
};
const dto = (value, detail = true) => ({
  id: String(value._id),
  weddingId: String(value.weddingId),
  name: value.name,
  type: value.type,
  description: value.description || '',
  activityCount: (value.activities || []).length,
  ...(detail
    ? {
        activities: (value.activities || [])
          .map(activityDto)
          .sort(
            (a, b) =>
              a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id),
          ),
      }
    : {}),
  startAt: value.startAt.toISOString(),
  endAt: value.endAt.toISOString(),
  venue: value.venue || null,
  status: value.status,
  deletedAt: value.deletedAt?.toISOString() || null,
  deletedBy: value.deletedBy ? String(value.deletedBy) : null,
  version: value.__v,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});

export function createEventService({ database, now = () => new Date() }) {
  function validateStatusTiming(event) {
    if (
      event.status === 'COMPLETED' &&
      new Date(event.startAt).getTime() > now().getTime()
    )
      throw new ApiError(
        400,
        'EVENT_STATUS_INVALID',
        'A future ceremony cannot be marked Completed. Choose another status or correct its start time.',
        {
          fields: {
            status: 'Completed is available once the ceremony has started.',
          },
        },
      );
  }
  async function authorize(
    connection,
    transaction,
    userId,
    weddingId,
    write = false,
    adminOnly = false,
  ) {
    const { User } = authModels(connection);
    const { Wedding, WeddingMember } = weddingModels(connection);
    const eligible = {
      _id: userId,
      status: 'ACTIVE',
      emailVerifiedAt: { $ne: null },
    };
    if (write) {
      if (
        (
          await User.updateOne(
            eligible,
            { $inc: { __v: 1 } },
            { session: transaction },
          )
        ).matchedCount !== 1
      )
        throw new ApiError(
          401,
          'SESSION_EXPIRED',
          'Please sign in to continue.',
        );
    } else if (!(await User.findOne(eligible).session(transaction).lean()))
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
    if (adminOnly && member.role !== 'ADMIN')
      throw new ApiError(
        403,
        'ADMIN_REQUIRED',
        'Only an Admin can remove, restore or view removed events.',
      );
    if (write) {
      if (!['ADMIN', 'FAMILY_MEMBER'].includes(member.role))
        throw new ApiError(
          403,
          'FORBIDDEN',
          'Only an Admin or Family Member can create or edit events.',
        );
      await WeddingMember.updateOne(
        { _id: member._id, status: 'ACTIVE', role: member.role },
        { $inc: { __v: 1 } },
        { session: transaction },
      );
      // Serialize event writes and wedding deletion without changing the cover/settings version.
      await Wedding.updateOne(
        { _id: weddingId, deletedAt: null },
        { $inc: { eventRevision: 1 } },
        { session: transaction },
      );
    }
  }
  async function warnings(Event, transaction, event) {
    const timing = activityTimingWarnings(event);
    if (event.status === 'CANCELLED') return timing;
    const count = await Event.countDocuments({
      weddingId: event.weddingId,
      deletedAt: null,
      _id: { $ne: event._id },
      status: { $ne: 'CANCELLED' },
      startAt: { $lt: event.endAt },
      endAt: { $gt: event.startAt },
    }).session(transaction);
    return count
      ? [
          ...timing,
          {
            code: 'EVENT_OVERLAP',
            message: `This ceremony overlaps ${count} other scheduled ${count === 1 ? 'event' : 'events'}. Overlaps are allowed.`,
            count,
          },
        ]
      : timing;
  }
  async function schedulePosition(Event, transaction, event) {
    return Event.countDocuments({
      weddingId: event.weddingId,
      deletedAt: null,
      $or: [
        { startAt: { $lt: event.startAt } },
        { startAt: event.startAt, _id: { $lte: event._id } },
      ],
    }).session(transaction);
  }
  async function list(userId, weddingId, query = {}) {
    if (!validId(weddingId))
      throw new ApiError(
        404,
        'WEDDING_NOT_FOUND',
        'This wedding is not available.',
      );
    const filters = parse(eventListSchema, query);
    const { page, limit, status, locate } = filters;
    const connection = await database.connect();
    const { Event } = eventModels(connection);
    let result;
    await connection.transaction(
      async (transaction) => {
        await authorize(connection, transaction, userId, weddingId);
        const base = eventListFilter(new Types.ObjectId(weddingId), filters);
        const counts = {
          ALL: 0,
          PLANNED: 0,
          CONFIRMED: 0,
          COMPLETED: 0,
          CANCELLED: 0,
        };
        const grouped = await Event.aggregate([
          { $match: base },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]).session(transaction);
        for (const group of grouped) {
          counts.ALL += group.count;
          if (Object.hasOwn(counts, group._id)) counts[group._id] = group.count;
        }
        const filter = { ...base, ...(status ? { status } : {}) };
        const total = status ? counts[status] : counts.ALL;
        const totalPages = Math.ceil(total / limit);
        let selectedPage = Math.min(page, Math.max(1, totalPages));
        let located = false;
        if (locate) {
          const target = await Event.findOne({ ...filter, _id: locate })
            .session(transaction)
            .lean();
          if (target) {
            const position = await Event.countDocuments({
              $and: [
                filter,
                {
                  $or: [
                    { startAt: { $lt: target.startAt } },
                    { startAt: target.startAt, _id: { $lte: target._id } },
                  ],
                },
              ],
            }).session(transaction);
            selectedPage = Math.ceil(position / limit);
            located = true;
          }
        }
        const events = await Event.find(filter)
          .select(
            '-activities.name -activities.description -activities.startAt -activities.endAt',
          )
          .sort({ startAt: 1, _id: 1 })
          .skip((selectedPage - 1) * limit)
          .limit(limit)
          .session(transaction)
          .lean();
        const linked = events.length
          ? await taskModels(connection)
              .Task.aggregate([
                {
                  $match: {
                    weddingId: new Types.ObjectId(weddingId),
                    eventId: { $in: events.map((event) => event._id) },
                    deletedAt: null,
                    recurrenceExcluded: { $ne: true },
                  },
                },
                { $group: { _id: '$eventId', total: { $sum: 1 } } },
              ])
              .session(transaction)
          : [];
        const taskCounts = new Map(
          linked.map((row) => [String(row._id), row.total]),
        );
        result = {
          events: events.map((event) => ({
            ...dto(event, false),
            taskCount: taskCounts.get(String(event._id)) || 0,
          })),
          meta: {
            page: selectedPage,
            limit,
            total,
            totalPages,
            statusCounts: counts,
            ...(locate ? { located } : {}),
          },
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
    return result;
  }
  async function removalActor(connection, transaction, event) {
    if (!event.deletedBy) return null;
    const user = await authModels(connection)
      .User.findById(event.deletedBy)
      .select('profile.displayName')
      .session(transaction)
      .lean();
    return user?.profile?.displayName || 'Wedding Admin';
  }
  async function listDeleted(userId, weddingId, query = {}) {
    if (!validId(weddingId)) throw absent();
    const { page, limit } = parse(eventRecoveryListSchema, query);
    const connection = await database.connect(),
      { Event } = eventModels(connection);
    let result;
    await connection.transaction(
      async (transaction) => {
        await authorize(
          connection,
          transaction,
          userId,
          weddingId,
          false,
          true,
        );
        const filter = { weddingId, deletedAt: { $ne: null } };
        const total = await Event.countDocuments(filter).session(transaction);
        const totalPages = Math.ceil(total / limit),
          selectedPage = Math.min(page, Math.max(1, totalPages));
        const rows = await Event.find(filter)
          .select(
            '-activities.name -activities.description -activities.startAt -activities.endAt',
          )
          .sort({ deletedAt: -1, _id: -1 })
          .skip((selectedPage - 1) * limit)
          .limit(limit)
          .session(transaction)
          .lean();
        const ids = [
          ...new Set(
            rows.flatMap((row) =>
              row.deletedBy ? [String(row.deletedBy)] : [],
            ),
          ),
        ];
        const actors = await authModels(connection)
          .User.find({ _id: { $in: ids } })
          .select('profile.displayName')
          .session(transaction)
          .lean();
        const names = new Map(
          actors.map((actor) => [
            String(actor._id),
            actor.profile?.displayName || 'Wedding Admin',
          ]),
        );
        result = {
          events: rows.map((row) => ({
            ...dto(row, false),
            deletedByName: names.get(String(row.deletedBy)) || 'Wedding Admin',
          })),
          meta: { page: selectedPage, limit, total, totalPages },
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
    return result;
  }
  async function read(userId, weddingId, eventId, recovery = false) {
    if (!validId(weddingId) || !validId(eventId)) throw absent();
    const connection = await database.connect();
    const { Event } = eventModels(connection);
    let result;
    await connection.transaction(
      async (transaction) => {
        await authorize(
          connection,
          transaction,
          userId,
          weddingId,
          false,
          recovery,
        );
        const event = await Event.findOne({
          _id: eventId,
          weddingId,
          ...(!recovery && { deletedAt: null }),
        })
          .session(transaction)
          .lean();
        if (!event) throw absent();
        result = {
          event: {
            ...dto(event),
            ...(recovery && {
              deletedByName: await removalActor(connection, transaction, event),
            }),
          },
          warnings: event.deletedAt
            ? []
            : await warnings(Event, transaction, event),
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
    return result;
  }
  async function write(
    userId,
    weddingId,
    eventId,
    raw,
    key,
    ifMatch,
    operation = null,
    activityId = null,
  ) {
    const lifecycle = ['DELETE_EVENT', 'RESTORE_EVENT'].includes(operation);
    if (!validId(weddingId) || (eventId && !validId(eventId))) throw absent();
    if (activityId && !validId(activityId))
      throw new ApiError(
        404,
        'ACTIVITY_NOT_FOUND',
        'This activity is not available.',
      );
    const input = parse(
      lifecycle
        ? eventLifecycleSchema
        : operation
          ? {
              ADD: createActivitySchema,
              EDIT: patchActivitySchema,
              REMOVE: removeActivitySchema,
            }[operation]
          : eventId
            ? patchEventSchema
            : createEventSchema,
      raw,
    );
    if (!eventKeySchema.safeParse(key).success)
      throw new ApiError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Please retry saving this event.',
      );
    const version = eventId ? eventVersion(ifMatch) : null;
    if (eventId && version === null)
      throw new ApiError(
        400,
        'VERSION_REQUIRED',
        'Load the current event before editing.',
      );
    const connection = await database.connect();
    const { Event, EventWriteRequest, Activity } = eventModels(connection);
    const keyHash = hash(key),
      requestHash = hash(
        JSON.stringify({
          eventId: eventId || null,
          version,
          input,
          ...(operation ? { operation, activityId } : {}),
        }),
      );
    let result;
    await connection.transaction(
      async (transaction) => {
        await authorize(
          connection,
          transaction,
          userId,
          weddingId,
          true,
          lifecycle,
        );
        const identity = { weddingId, userId, keyHash };
        const previous = await EventWriteRequest.findOne({
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
              'This save key was already used with different event details. Reload the schedule before submitting again.',
            );
          const event = await Event.findOne({
            _id: previous.eventId,
            weddingId,
            ...(!lifecycle && { deletedAt: null }),
          })
            .session(transaction)
            .lean();
          if (!event) throw absent();
          result = {
            event: dto(event),
            warnings: event.deletedAt
              ? []
              : await warnings(Event, transaction, event),
            replayed: true,
            ...(!eventId && {
              schedulePosition: await schedulePosition(
                Event,
                transaction,
                event,
              ),
            }),
          };
          return;
        }
        let event,
          changes = [];
        if (eventId) {
          const current = await Event.findOne({
            _id: eventId,
            weddingId,
            ...(!lifecycle && { deletedAt: null }),
          })
            .session(transaction)
            .lean();
          if (!current) throw absent();
          if (current.__v !== version) throw conflict();
          if (lifecycle) {
            const removing = operation === 'DELETE_EVENT';
            if (removing === !!current.deletedAt)
              throw new ApiError(
                409,
                'EVENT_STATE_CHANGED',
                removing
                  ? 'This event is already removed. Reload its current state.'
                  : 'This event is already active. Reload its current state.',
              );
            event = await Event.findOneAndUpdate(
              { _id: eventId, weddingId, __v: version },
              {
                $set: {
                  deletedAt: removing ? now() : null,
                  deletedBy: removing ? userId : null,
                  updatedBy: userId,
                },
                $inc: { __v: 1 },
              },
              {
                session: transaction,
                returnDocument: 'after',
                runValidators: true,
              },
            ).lean();
            if (!event) throw conflict();
          } else {
            const previousActivities = current.activities || [];
            let patch = { ...input };
            if (operation) {
              let next = [...previousActivities];
              const index = next.findIndex(
                (row) => String(row._id) === activityId,
              );
              if (operation === 'ADD') {
                if (next.length >= activityLimit)
                  throw new ApiError(
                    400,
                    'ACTIVITY_LIMIT',
                    `A ceremony can have up to ${activityLimit} activities.`,
                  );
                next.push({ ...input, _id: new Types.ObjectId() });
              } else {
                if (index < 0)
                  throw new ApiError(
                    404,
                    'ACTIVITY_NOT_FOUND',
                    'This activity is not available.',
                  );
                if (operation === 'REMOVE') next.splice(index, 1);
                else {
                  const merged = { ...next[index], ...input };
                  if (
                    merged.endAt &&
                    +new Date(merged.endAt) <= +new Date(merged.startAt)
                  )
                    throw new ApiError(
                      400,
                      'ACTIVITY_TIME_INVALID',
                      'Activity end must be after its start.',
                      { fields: { endAt: 'End must be after start.' } },
                    );
                  next[index] = merged;
                }
              }
              patch = { activities: next };
            } else if (input.activities)
              patch.activities = materializeActivities(
                input.activities,
                previousActivities,
              );
            changes = activityChanges(
              previousActivities,
              patch.activities || previousActivities,
            );
            validateStatusTiming({ ...current, ...patch });
            if (
              Date.parse(patch.endAt || current.endAt) <=
              Date.parse(patch.startAt || current.startAt)
            )
              throw new ApiError(
                400,
                'EVENT_TIME_INVALID',
                'End must be after the start. Choose the next date for an overnight ceremony.',
                { fields: { endAt: 'End must be after start.' } },
              );
            event = await Event.findOneAndUpdate(
              { _id: eventId, weddingId, deletedAt: null, __v: version },
              { $set: { ...patch, updatedBy: userId }, $inc: { __v: 1 } },
              {
                session: transaction,
                returnDocument: 'after',
                runValidators: true,
              },
            ).lean();
            if (!event) throw conflict();
          }
        } else {
          validateStatusTiming(input);
          const activities = materializeActivities(input.activities || []);
          changes = activityChanges([], activities);
          const [created] = await Event.create(
            [
              {
                ...input,
                activities,
                weddingId,
                createdBy: userId,
                updatedBy: userId,
              },
            ],
            { session: transaction },
          );
          event = created.toObject();
        }
        await Activity.create(
          [
            {
              weddingId,
              actorId: userId,
              action: lifecycle
                ? operation === 'DELETE_EVENT'
                  ? 'EVENT_DELETED'
                  : 'EVENT_RESTORED'
                : eventId
                  ? 'EVENT_UPDATED'
                  : 'EVENT_CREATED',
              entityType: 'EVENT',
              entityId: event._id,
              displaySnapshot: { label: event.name },
              createdAt: now(),
            },
            ...changes.map(({ action, row }) => ({
              weddingId,
              actorId: userId,
              action,
              entityType: 'EVENT_ACTIVITY',
              entityId: row._id,
              parentEventId: event._id,
              displaySnapshot: { label: row.name },
              createdAt: now(),
            })),
          ],
          { session: transaction, ordered: true },
        );
        await EventWriteRequest.updateOne(
          identity,
          {
            $set: {
              requestHash,
              eventId: event._id,
              expiresAt: new Date(now().getTime() + 86400000),
            },
          },
          { session: transaction, upsert: true },
        );
        result = {
          event: dto(event),
          warnings: event.deletedAt
            ? []
            : await warnings(Event, transaction, event),
          replayed: false,
          ...(!eventId && {
            schedulePosition: await schedulePosition(Event, transaction, event),
          }),
        };
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
    return result;
  }
  return {
    list,
    listDeleted,
    read,
    readRecovery: (userId, weddingId, eventId) =>
      read(userId, weddingId, eventId, true),
    changeLifecycle: (
      operation,
      userId,
      weddingId,
      eventId,
      raw,
      key,
      ifMatch,
    ) => write(userId, weddingId, eventId, raw, key, ifMatch, operation),
    create: (userId, weddingId, raw, key) =>
      write(userId, weddingId, null, raw, key),
    update: (userId, weddingId, eventId, raw, key, ifMatch) =>
      write(userId, weddingId, eventId, raw, key, ifMatch),
    changeActivity: (
      operation,
      userId,
      weddingId,
      eventId,
      activityId,
      raw,
      key,
      ifMatch,
    ) =>
      write(
        userId,
        weddingId,
        eventId,
        raw,
        key,
        ifMatch,
        operation,
        activityId,
      ),
  };
}
