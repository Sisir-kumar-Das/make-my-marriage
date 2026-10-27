import { createHash } from 'node:crypto';
import { ApiError } from '../lib/api-error.js';
import { eventModels } from '../events/models.js';
import { taskModels } from './models.js';
import {
  seriesPatchSchema,
  indiaToday,
  addDays,
  nextOccurrence,
  occurrenceDates,
  occurrenceDue,
  resolveRecurrence,
} from './recurrence.js';
import { taskKeySchema, taskVersion } from './validation.js';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const validId = (value) =>
  typeof value === 'string' && /^[a-f\d]{24}$/.test(value);
const absent = () =>
  new ApiError(
    404,
    'SERIES_NOT_FOUND',
    'This repeat pattern is not available.',
  );
function ruleFor(raw, wedding, instant) {
  try {
    return resolveRecurrence(raw, wedding, instant);
  } catch (error) {
    throw new ApiError(400, 'VALIDATION_ERROR', error.message, {
      fields: { ['recurrence.' + error.recurrenceField]: error.message },
    });
  }
}
export function createRecurrenceService({
  database,
  now,
  authorize,
  assigneeMembers,
}) {
  async function validateTemplate(
    connection,
    transaction,
    weddingId,
    template,
  ) {
    const ids = (template.assigneeIds || []).map(String);
    const selected = await assigneeMembers(
      connection,
      transaction,
      weddingId,
      ids,
      true,
    );
    if (selected.size !== ids.length)
      throw new ApiError(
        400,
        'ASSIGNEE_UNAVAILABLE',
        'A repeat assignee is unavailable. Remove or replace unavailable members.',
        {
          fields: { assigneeIds: 'Choose active members of this wedding.' },
          unavailableAssigneeIds: ids.filter((id) => !selected.has(id)),
        },
      );
    if (
      template.eventId &&
      !(await eventModels(connection)
        .Event.findOne({ _id: template.eventId, weddingId, deletedAt: null })
        .session(transaction)
        .lean())
    )
      throw new ApiError(
        400,
        'EVENT_UNAVAILABLE',
        'Choose an active ceremony for future repeats, or make them wedding-wide.',
        { fields: { eventId: 'Choose an available ceremony.' } },
      );
  }
  function fields(series, date, actor, source) {
    return {
      ...series.template,
      assigneeIds: series.template.assigneeIds.map(String),
      eventId: series.template.eventId || null,
      status: 'TODO',
      dueAt: occurrenceDue(date, series.time),
      dueDateOnly: !series.time,
      seriesId: series._id,
      occurrenceDate: date,
      occurrenceEdited: false,
      recurrenceExcluded: false,
      source: source?.type === 'CHECKLIST' ? source : { type: 'RECURRENCE' },
      weddingId: series.weddingId,
      createdBy: actor,
      updatedBy: actor,
    };
  }
  async function audit(
    connection,
    transaction,
    actor,
    weddingId,
    action,
    entityType,
    entityId,
    label,
    instant,
  ) {
    await eventModels(connection).Activity.create(
      [
        {
          weddingId,
          actorId: actor,
          action,
          entityType,
          entityId,
          displaySnapshot: { label },
          createdAt: instant,
        },
      ],
      { session: transaction },
    );
  }
  async function fill(
    connection,
    transaction,
    series,
    from,
    to,
    actor,
    instant,
  ) {
    const { Task, TaskSeries } = taskModels(connection);
    const dates = occurrenceDates(series, from, to, 100);
    const existing = dates.length
      ? await Task.find({
          seriesId: series._id,
          occurrenceDate: { $in: dates },
        })
          .session(transaction)
          .lean()
      : [];
    const byDate = new Map(existing.map((task) => [task.occurrenceDate, task]));
    const fresh = dates
      .filter((date) => !byDate.has(date))
      .reverse()
      .map((date) => fields(series, date, actor));
    const created = fresh.length
      ? await Task.insertMany(fresh, { session: transaction, ordered: true })
      : [];
    if (created.length)
      await eventModels(connection).Activity.insertMany(
        created.map((task) => ({
          weddingId: series.weddingId,
          actorId: actor,
          action: 'TASK_CREATED',
          entityType: 'TASK',
          entityId: task._id,
          displaySnapshot: { label: task.title },
          createdAt: instant,
        })),
        { session: transaction, ordered: true },
      );
    // Reactivation obeys the same old-deadline protection as normal future edits.
    // Neither a past retired copy nor a user-removed copy may be rewritten here.

    for (const old of existing.filter(
      (task) =>
        task.recurrenceExcluded &&
        !task.deletedAt &&
        !task.occurrenceEdited &&
        task.status !== 'COMPLETED' &&
        task.dueAt &&
        new Date(task.dueAt) >= instant,
    )) {
      const data = fields(series, old.occurrenceDate, actor, old.source);
      delete data.createdBy;
      await Task.updateOne(
        { _id: old._id, __v: old.__v },
        { $set: data, $inc: { __v: 1 } },
        { session: transaction },
      );
      await audit(
        connection,
        transaction,
        actor,
        series.weddingId,
        'TASK_RECURRENCE_RESCHEDULED',
        'TASK',
        old._id,
        data.title,
        instant,
      );
    }
    const last = dates.at(-1);
    let next = last
      ? last === '9999-12-31'
        ? null
        : nextOccurrence(series, addDays(last, 1))
      : nextOccurrence(series, from);
    if (next && next <= to && dates.length < 100) next = null;
    await TaskSeries.updateOne(
      { _id: series._id },
      {
        $set: {
          nextGenerationDate: next,
          generationIssue: null,
          retryAt: null,
        },
      },
      { session: transaction },
    );
    return { created: created.length, next, first: dates[0] || null };
  }
  async function dto(connection, transaction, series) {
    const template = {
      ...series.template,
      assigneeIds: series.template.assigneeIds.map(String),
      eventId: series.template.eventId ? String(series.template.eventId) : null,
    };
    const members = await assigneeMembers(
      connection,
      transaction,
      series.weddingId,
      template.assigneeIds,
    );
    const event = template.eventId
      ? await eventModels(connection)
          .Event.findOne({
            _id: template.eventId,
            weddingId: series.weddingId,
            deletedAt: null,
          })
          .select('name')
          .session(transaction)
          .lean()
      : null;
    return {
      id: String(series._id),
      version: series.__v,
      active: series.active,
      recurrence: {
        frequency: series.frequency,
        interval: series.interval,
        startDate: series.startDate,
        endDate: series.endDate,
        time: series.time,
      },
      template: {
        ...template,
        assignees: template.assigneeIds.map(
          (id) =>
            members.get(id) || { id, name: null, role: null, available: false },
        ),
        event: template.eventId
          ? {
              id: template.eventId,
              name: event?.name || null,
              available: !!event,
            }
          : null,
      },
      generationIssue: series.generationIssue,
      nextGenerationDate: series.nextGenerationDate,
    };
  }
  async function create(
    connection,
    transaction,
    userId,
    wedding,
    template,
    raw,
    current,
    version,
    instant,
  ) {
    if (current?.seriesId)
      throw new ApiError(
        400,
        'SERIES_ALREADY_EXISTS',
        'Use Future repeats to change this repeat pattern.',
      );
    if (current?.status === 'COMPLETED' || template.status !== 'TODO')
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'New repeats start as To Do. Reopen this task before enabling repeats.',
        { fields: { status: 'New repeating tasks must start as To Do.' } },
      );
    await validateTemplate(connection, transaction, wedding._id, template);
    const rule = ruleFor(raw, wedding, instant),
      today = indiaToday(instant),
      from = rule.startDate > today ? rule.startDate : today;
    const first = nextOccurrence(rule, from);
    if (!first)
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'These dates have no upcoming repeat. Choose a later end date.',
        {
          fields: {
            'recurrence.endDate':
              'Choose an end date that includes an upcoming repeat.',
          },
        },
      );
    const { Task, TaskSeries } = taskModels(connection);
    const [document] = await TaskSeries.create(
      [
        {
          weddingId: wedding._id,
          ...rule,
          template: {
            title: template.title,
            description: template.description,
            priority: template.priority,
            assigneeIds: template.assigneeIds,
            eventId: template.eventId,
          },
          nextGenerationDate: first,
          createdBy: userId,
          updatedBy: userId,
        },
      ],
      { session: transaction },
    );
    const series = document.toObject();
    if (current) {
      const data = {
        ...fields(series, first, userId, current.source),
        completedAt: null,
        completedBy: null,
      };
      delete data.createdBy;
      await Task.updateOne(
        { _id: current._id, __v: version },
        { $set: data, $inc: { __v: 1 } },
        { session: transaction },
      );
      await audit(
        connection,
        transaction,
        userId,
        wedding._id,
        'TASK_UPDATED',
        'TASK',
        current._id,
        data.title,
        instant,
      );
    }
    const generated = await fill(
      connection,
      transaction,
      series,
      first,
      addDays(first, 89),
      userId,
      instant,
    );
    await audit(
      connection,
      transaction,
      userId,
      wedding._id,
      'TASK_SERIES_CREATED',
      'TASK_SERIES',
      series._id,
      template.title,
      instant,
    );
    const task = await Task.findOne({
      seriesId: series._id,
      occurrenceDate: first,
    })
      .session(transaction)
      .lean();
    return { task, seriesId: series._id, generatedCount: generated.created };
  }
  async function read(userId, weddingId, taskId) {
    if (!validId(weddingId) || !validId(taskId)) throw absent();
    const connection = await database.connect();
    let result;
    await connection.transaction(
      async (transaction) => {
        await authorize(connection, transaction, userId, weddingId);
        const { Task, TaskSeries } = taskModels(connection);
        const task = await Task.findOne({
          _id: taskId,
          weddingId,
          deletedAt: null,
        })
          .session(transaction)
          .lean();
        const series = task?.seriesId
          ? await TaskSeries.findOne({ _id: task.seriesId, weddingId })
              .session(transaction)
              .lean()
          : null;
        if (!series) throw absent();
        result = {
          series: await dto(connection, transaction, series),
          effectiveFrom:
            task.occurrenceDate > indiaToday(now())
              ? task.occurrenceDate
              : indiaToday(now()),
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
    return result;
  }
  async function update(userId, weddingId, taskId, raw, key, ifMatch) {
    if (!validId(weddingId) || !validId(taskId)) throw absent();
    const parsed = seriesPatchSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Check the repeat settings.',
        {
          fields: Object.fromEntries(
            parsed.error.issues.map((issue) => [
              issue.path.join('.'),
              issue.message,
            ]),
          ),
        },
      );
    if (!taskKeySchema.safeParse(key).success)
      throw new ApiError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Retry with a repeat save key.',
      );
    const version = taskVersion(ifMatch);
    if (version === null)
      throw new ApiError(
        400,
        'VERSION_REQUIRED',
        'Load the current repeat pattern before saving.',
      );
    const input = parsed.data,
      requestHash = hash(
        JSON.stringify({ action: 'UPDATE_SERIES', taskId, version, input }),
      );
    const connection = await database.connect();
    let result;
    await connection.transaction(
      async (transaction) => {
        const wedding = await authorize(
            connection,
            transaction,
            userId,
            weddingId,
            true,
          ),
          instant = now();
        const { Task, TaskSeries, TaskWriteRequest } = taskModels(connection),
          identity = { weddingId, userId, keyHash: hash(key) };
        const origin = await Task.findOne({
          _id: taskId,
          weddingId,
          deletedAt: null,
        })
          .session(transaction)
          .lean();
        const current = origin?.seriesId
          ? await TaskSeries.findOne({ _id: origin.seriesId, weddingId })
              .session(transaction)
              .lean()
          : null;
        if (!current) throw absent();
        const receipt = await TaskWriteRequest.findOne({
          ...identity,
          expiresAt: { $gt: instant },
        })
          .session(transaction)
          .lean();
        if (receipt) {
          if (receipt.requestHash !== requestHash)
            throw new ApiError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'This repeat save key was used with different settings. Load the latest pattern.',
            );
          result = {
            series: await dto(connection, transaction, current),
            replayed: true,
          };
          return;
        }
        if (current.__v !== version)
          throw new ApiError(
            409,
            'VERSION_CONFLICT',
            'The repeat pattern changed. Load its latest settings before saving.',
          );
        const rule = ruleFor(input.recurrence, wedding, instant);
        if (input.active)
          await validateTemplate(
            connection,
            transaction,
            weddingId,
            input.template,
          );
        const today = indiaToday(instant),
          effective =
            origin.occurrenceDate > today ? origin.occurrenceDate : today;
        const updated = {
          ...current,
          ...rule,
          template: input.template,
          active: input.active,
          updatedBy: userId,
          __v: version + 1,
          generationIssue: null,
          retryAt: null,
        };
        const future = await Task.find({
          seriesId: current._id,
          deletedAt: null,
          occurrenceDate: { $gte: effective },
          dueAt: { $gte: instant },
        })
          .session(transaction)
          .lean();
        let changed = 0,
          retired = 0;
        const protectedCount = future.filter(
          (task) => task.status === 'COMPLETED' || task.occurrenceEdited,
        ).length;
        if (input.active)
          for (const task of future) {
            if (task.status === 'COMPLETED' || task.occurrenceEdited) continue;
            const matches =
              nextOccurrence(rule, task.occurrenceDate) === task.occurrenceDate;
            if (matches) {
              const data = fields(
                updated,
                task.occurrenceDate,
                userId,
                task.source,
              );
              delete data.createdBy;
              delete data.status;
              await Task.updateOne(
                { _id: task._id, __v: task.__v },
                { $set: data, $inc: { __v: 1 } },
                { session: transaction },
              );
              changed++;
            } else if (!task.recurrenceExcluded) {
              await Task.updateOne(
                { _id: task._id, __v: task.__v },
                {
                  $set: { recurrenceExcluded: true, updatedBy: userId },
                  $inc: { __v: 1 },
                },
                { session: transaction },
              );
              retired++;
            } else continue;
            await audit(
              connection,
              transaction,
              userId,
              weddingId,
              'TASK_RECURRENCE_RESCHEDULED',
              'TASK',
              task._id,
              input.template.title,
              instant,
            );
          }
        await TaskSeries.updateOne(
          { _id: current._id, __v: version },
          {
            $set: {
              ...rule,
              template: input.template,
              active: input.active,
              updatedBy: userId,
              generationIssue: null,
              retryAt: null,
              nextGenerationDate: input.active
                ? nextOccurrence(rule, effective)
                : null,
            },
            $inc: { __v: 1 },
          },
          { session: transaction },
        );
        let generated = { created: 0 };
        if (input.active)
          generated = await fill(
            connection,
            transaction,
            updated,
            effective,
            addDays(nextOccurrence(rule, effective) || effective, 89),
            userId,
            instant,
          );
        await audit(
          connection,
          transaction,
          userId,
          weddingId,
          input.active ? 'TASK_SERIES_UPDATED' : 'TASK_SERIES_STOPPED',
          'TASK_SERIES',
          current._id,
          input.template.title,
          instant,
        );
        await TaskWriteRequest.updateOne(
          identity,
          {
            $set: {
              requestHash,
              taskId: origin._id,
              seriesId: current._id,
              expiresAt: new Date(instant.getTime() + 86400000),
            },
          },
          { session: transaction, upsert: true },
        );
        result = {
          series: await dto(
            connection,
            transaction,
            await TaskSeries.findById(current._id).session(transaction).lean(),
          ),
          changed,
          retired,
          protectedCount,
          generatedCount: generated.created,
          replayed: false,
        };
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
    return result;
  }
  let running = null;
  function pump() {
    if (running) return running;
    running = (async () => {
      const connection = await database.connect(),
        { TaskSeries } = taskModels(connection),
        instant = now(),
        horizon = addDays(indiaToday(instant), 89);
      const due = await TaskSeries.find({
        active: true,
        nextGenerationDate: { $ne: null, $lte: horizon },
        $or: [{ retryAt: null }, { retryAt: { $lte: instant } }],
      })
        // Healthy/untried work (null retryAt) precedes eligible retries. Oldest
        // retries rotate as their retryAt advances, even when cursors cannot.
        .sort({ retryAt: 1, nextGenerationDate: 1, _id: 1 })
        .limit(5)
        .lean();
      let processed = 0;
      for (const item of due)
        try {
          await connection.transaction(
            async (transaction) => {
              const series = await TaskSeries.findOne({
                _id: item._id,
                active: true,
                nextGenerationDate: { $ne: null, $lte: horizon },
                $or: [{ retryAt: null }, { retryAt: { $lte: instant } }],
              })
                .session(transaction)
                .lean();
              if (!series) return;
              await authorize(
                connection,
                transaction,
                String(series.updatedBy),
                String(series.weddingId),
                true,
              );
              await validateTemplate(
                connection,
                transaction,
                series.weddingId,
                series.template,
              );
              await fill(
                connection,
                transaction,
                series,
                series.nextGenerationDate,
                horizon,
                series.updatedBy,
                instant,
              );
            },
            {
              readConcern: { level: 'snapshot' },
              writeConcern: { w: 'majority' },
            },
          );
          processed++;
        } catch (error) {
          if (
            [
              'FORBIDDEN',
              'SESSION_EXPIRED',
              'WEDDING_NOT_FOUND',
              'ASSIGNEE_UNAVAILABLE',
              'EVENT_UNAVAILABLE',
            ].includes(error.code)
          )
            await TaskSeries.updateOne(
              { _id: item._id, __v: item.__v, active: true },
              {
                $set: {
                  generationIssue: [
                    'ASSIGNEE_UNAVAILABLE',
                    'EVENT_UNAVAILABLE',
                  ].includes(error.code)
                    ? error.code
                    : 'OWNER_UNAVAILABLE',
                  retryAt: new Date(instant.getTime() + 15 * 60000),
                },
              },
            );
          else throw error;
        }
      return { processed };
    })().finally(() => {
      running = null;
    });
    return running;
  }
  return {
    create,
    read,
    update,
    pump,
    close: () => running || Promise.resolve(),
  };
}
