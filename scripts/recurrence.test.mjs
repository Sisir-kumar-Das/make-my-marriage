import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recurrenceSchema,
  seriesPatchSchema,
  nextOccurrence,
  occurrenceDates,
  occurrenceDue,
  resolveRecurrence,
} from '../apps/api/src/tasks/recurrence.js';
import {
  nextOccurrence as previewNext,
  occurrenceDates as previewDates,
} from '../apps/web/src/features/tasks/recurrence-data.js';
import {
  initialTask,
  taskInput,
  taskFormSchema,
} from '../apps/web/src/features/tasks/form-data.js';
import {
  createTaskSchema,
  patchTaskSchema,
  taskListSchema,
} from '../apps/api/src/tasks/validation.js';
import { taskQueryFilter } from '../apps/api/src/tasks/query.js';
const base = {
  frequency: 'MONTHLY',
  interval: 1,
  startDate: '2027-01-31',
  endDate: '2027-05-31',
  time: null,
};
test('monthly schedules clamp each date to its own month without drifting away from the original anchor', () => {
  assert.deepEqual(occurrenceDates(base, base.startDate, base.endDate), [
    '2027-01-31',
    '2027-02-28',
    '2027-03-31',
    '2027-04-30',
    '2027-05-31',
  ]);
  assert.deepEqual(
    occurrenceDates(
      { ...base, startDate: '2028-01-31', endDate: '2028-03-31' },
      '2028-01-01',
      '2028-03-31',
    ),
    ['2028-01-31', '2028-02-29', '2028-03-31'],
  );
  assert.equal(
    nextOccurrence({ ...base, interval: 2 }, '2027-02-01'),
    '2027-03-31',
  );
  assert.equal(
    nextOccurrence(
      { ...base, startDate: '2026-12-31', endDate: '2027-03-31' },
      '2027-01-01',
    ),
    '2027-01-31',
  );
  assert.equal(nextOccurrence(base, '2027-05-31'), '2027-05-31');
  assert.equal(nextOccurrence(base, '2027-06-01'), null);
});
test('daily/weekly intervals and browser previews agree with server dates, bounds and India deadlines', () => {
  for (const frequency of ['DAILY', 'WEEKLY', 'MONTHLY'])
    for (const interval of [1, 2, 7, 12, 365]) {
      const rule = { ...base, frequency, interval, endDate: '2029-12-31' };
      for (const from of [
        '2027-01-01',
        '2027-02-01',
        '2028-02-29',
        '2029-12-31',
      ]) {
        assert.equal(previewNext(rule, from), nextOccurrence(rule, from));
        assert.deepEqual(
          previewDates(rule, from, '2029-12-31', 5),
          occurrenceDates(rule, from, '2029-12-31', 5),
        );
      }
    }
  assert.deepEqual(
    occurrenceDates(
      {
        ...base,
        frequency: 'WEEKLY',
        interval: 2,
        startDate: '2027-01-01',
        endDate: '2027-02-01',
      },
      '2027-01-01',
      '2027-02-01',
    ),
    ['2027-01-01', '2027-01-15', '2027-01-29'],
  );
  assert.equal(
    occurrenceDue('2027-01-31', null).toISOString(),
    '2027-01-31T18:29:59.999Z',
  );
  assert.equal(
    occurrenceDue('2027-01-31', '10:00').toISOString(),
    '2027-01-31T04:30:00.000Z',
  );
  assert.equal(
    occurrenceDates(
      {
        ...base,
        frequency: 'DAILY',
        startDate: '2027-01-01',
        endDate: '2029-01-01',
      },
      '2027-01-01',
      '2029-01-01',
    ).length,
    100,
  );
  assert.deepEqual(
    occurrenceDates(
      { ...base, startDate: '9999-12-31', endDate: '9999-12-31' },
      '9999-12-31',
      '9999-12-31',
    ),
    ['9999-12-31'],
  );
});
test('repeat contracts default to wedding boundary, require an explicit end for a past wedding, and serialize separately from one-copy edits', () => {
  const instant = new Date('2027-01-01T00:00:00Z');
  assert.equal(
    resolveRecurrence(
      { ...base, endDate: null },
      { mainDate: '2027-03-31' },
      instant,
    ).endDate,
    '2027-03-31',
  );
  assert.throws(
    () =>
      resolveRecurrence(
        { ...base, endDate: null },
        { mainDate: '2020-01-01' },
        instant,
      ),
    /Choose an end date/,
  );
  assert.equal(
    resolveRecurrence(base, { mainDate: '2020-01-01' }, instant).endDate,
    '2027-05-31',
  );
  for (const extra of [
    { frequency: 'YEARLY' },
    { interval: 0 },
    { interval: 366 },
    { interval: 1.5 },
    { startDate: '2027-02-29' },
    { endDate: '2027-01-01' },
    { time: '25:00' },
    { active: true },
  ])
    assert.equal(
      recurrenceSchema.safeParse({ ...base, ...extra }).success,
      false,
    );
  const values = {
    ...initialTask(),
    title: 'Recurring task',
    repeatEnabled: true,
    repeatFrequency: 'MONTHLY',
    repeatInterval: 1,
    repeatStartDate: base.startDate,
    repeatEndDate: base.endDate,
    dueTime: '10:00',
  };
  assert.equal(taskFormSchema.safeParse(values).success, true);
  const input = taskInput(values);
  assert.equal(createTaskSchema.safeParse(input).success, true);
  assert.equal(patchTaskSchema.safeParse(input).success, true);
  assert.equal(input.dueAt, null);
  assert.equal(input.recurrence.time, '10:00');
  assert.equal(
    taskFormSchema.safeParse({ ...values, repeatEndDate: '' }).success,
    false,
  );
  const template = {
    title: 'Task',
    description: '',
    priority: 'MEDIUM',
    assigneeIds: [],
    eventId: null,
  };
  assert.equal(
    seriesPatchSchema.safeParse({ active: false, recurrence: base, template })
      .success,
    true,
  );
  assert.equal(
    seriesPatchSchema.safeParse({
      active: true,
      recurrence: base,
      template: { ...template, source: { type: 'MANUAL' } },
    }).success,
    false,
  );
});
test('Has Recurrence is a tenant-scoped filter and cannot inject a series ID or override the My Tasks actor', () => {
  const weddingId = '111111111111111111111111',
    userId = '222222222222222222222222';
  const query = taskListSchema.parse({ recurring: 'true' });
  const match = taskQueryFilter(query, weddingId, userId, true, new Date());
  assert.equal(String(match.$and[0].weddingId), weddingId);
  assert.deepEqual(match.$and[0].recurrenceExcluded, { $ne: true });
  assert.deepEqual(
    match.$and.find((x) => x.seriesId),
    { seriesId: { $ne: null } },
  );
  assert.equal(taskListSchema.safeParse({ seriesId: userId }).success, false);
});
