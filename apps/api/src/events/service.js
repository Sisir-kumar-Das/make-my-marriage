import { createHash } from 'node:crypto';
import { ApiError } from '../lib/api-error.js';
import { authModels } from '../auth/models.js';
import { weddingModels } from '../weddings/models.js';
import { eventModels } from './models.js';
import {
  createEventSchema,
  patchEventSchema,
  eventListSchema,
  eventKeySchema,
  eventVersion,
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
const dto = (value) => ({
  id: String(value._id),
  weddingId: String(value.weddingId),
  name: value.name,
  type: value.type,
  description: value.description || '',
  startAt: value.startAt.toISOString(),
  endAt: value.endAt.toISOString(),
  venue: value.venue || null,
  status: value.status,
  version: value.__v,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});

export function createEventService({ database, now = () => new Date() }) {
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
    if (event.status === 'CANCELLED') return [];
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
          {
            code: 'EVENT_OVERLAP',
            message: `This ceremony overlaps ${count} other scheduled ${count === 1 ? 'event' : 'events'}. Overlaps are allowed.`,
            count,
          },
        ]
      : [];
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
    const { page, limit } = parse(eventListSchema, query);
    const connection = await database.connect();
    const { Event } = eventModels(connection);
    let result;
    await connection.transaction(
      async (transaction) => {
        await authorize(connection, transaction, userId, weddingId);
        const filter = { weddingId, deletedAt: null };
        const total = await Event.countDocuments(filter).session(transaction);
        const events = await Event.find(filter)
          .sort({ startAt: 1, _id: 1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .session(transaction)
          .lean();
        result = {
          events: events.map(dto),
          meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
    return result;
  }
  async function read(userId, weddingId, eventId) {
    if (!validId(weddingId) || !validId(eventId)) throw absent();
    const connection = await database.connect();
    const { Event } = eventModels(connection);
    let result;
    await connection.transaction(
      async (transaction) => {
        await authorize(connection, transaction, userId, weddingId);
        const event = await Event.findOne({
          _id: eventId,
          weddingId,
          deletedAt: null,
        })
          .session(transaction)
          .lean();
        if (!event) throw absent();
        result = {
          event: dto(event),
          warnings: await warnings(Event, transaction, event),
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
    return result;
  }
  async function write(userId, weddingId, eventId, raw, key, ifMatch) {
    if (!validId(weddingId) || (eventId && !validId(eventId))) throw absent();
    const input = parse(eventId ? patchEventSchema : createEventSchema, raw);
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
        JSON.stringify({ eventId: eventId || null, version, input }),
      );
    let result;
    await connection.transaction(
      async (transaction) => {
        await authorize(connection, transaction, userId, weddingId, true);
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
            deletedAt: null,
          })
            .session(transaction)
            .lean();
          if (!event) throw absent();
          result = {
            event: dto(event),
            warnings: await warnings(Event, transaction, event),
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
        let event;
        if (eventId) {
          const current = await Event.findOne({
            _id: eventId,
            weddingId,
            deletedAt: null,
          })
            .session(transaction)
            .lean();
          if (!current) throw absent();
          if (current.__v !== version) throw conflict();
          if (
            Date.parse(input.endAt || current.endAt) <=
            Date.parse(input.startAt || current.startAt)
          )
            throw new ApiError(
              400,
              'EVENT_TIME_INVALID',
              'End must be after the start. Choose the next date for an overnight ceremony.',
              { fields: { endAt: 'End must be after start.' } },
            );
          event = await Event.findOneAndUpdate(
            { _id: eventId, weddingId, deletedAt: null, __v: version },
            { $set: { ...input, updatedBy: userId }, $inc: { __v: 1 } },
            {
              session: transaction,
              returnDocument: 'after',
              runValidators: true,
            },
          ).lean();
          if (!event) throw conflict();
        } else {
          const [created] = await Event.create(
            [{ ...input, weddingId, createdBy: userId, updatedBy: userId }],
            { session: transaction },
          );
          event = created.toObject();
        }
        await Activity.create(
          [
            {
              weddingId,
              actorId: userId,
              action: eventId ? 'EVENT_UPDATED' : 'EVENT_CREATED',
              entityType: 'EVENT',
              entityId: event._id,
              displaySnapshot: { label: event.name },
              createdAt: now(),
            },
          ],
          { session: transaction },
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
          warnings: await warnings(Event, transaction, event),
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
    read,
    create: (userId, weddingId, raw, key) =>
      write(userId, weddingId, null, raw, key),
    update: (userId, weddingId, eventId, raw, key, ifMatch) =>
      write(userId, weddingId, eventId, raw, key, ifMatch),
  };
}
