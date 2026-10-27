import { z } from 'zod';
// Advisory calendar preview only. Express independently validates schedules and owns generation.
export const repeatDate = z.union([
  z.literal(''),
  z.iso.date().regex(/^[1-9]\d{3}-/),
]);
export const repeatFields = {
  repeatEnabled: z.boolean().default(false),
  repeatFrequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).default('WEEKLY'),
  repeatInterval: z.number().int().min(1).max(365).default(1),
  repeatStartDate: repeatDate.default(''),
  repeatEndDate: repeatDate.default(''),
};
export function validRepeat(value) {
  return (
    !value.repeatEnabled ||
    (!!value.repeatStartDate &&
      !!value.repeatEndDate &&
      value.repeatEndDate >= value.repeatStartDate)
  );
}
export function repeatInput(value) {
  return {
    frequency: value.repeatFrequency,
    interval: value.repeatInterval,
    startDate: value.repeatStartDate,
    endDate: value.repeatEndDate,
    time: value.dueTime || null,
  };
}
const dayMs = 86400000;
export const indiaToday = (instant = new Date()) =>
  new Date(instant.getTime() + 19800000).toISOString().slice(0, 10);
export function addDays(date, days) {
  return new Date(
    Math.min(
      Date.parse('9999-12-31T00:00:00Z'),
      Date.parse(date + 'T00:00:00Z') + days * dayMs,
    ),
  )
    .toISOString()
    .slice(0, 10);
}
export function nextOccurrence(rule, from) {
  const start = rule.startDate,
    lower = from > start ? from : start;
  if (lower > rule.endDate) return null;
  let result;
  if (rule.frequency !== 'MONTHLY') {
    const step = rule.interval * (rule.frequency === 'WEEKLY' ? 7 : 1);
    const n = Math.max(
      0,
      Math.ceil(
        (Date.parse(lower + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) /
          (step * dayMs),
      ),
    );
    const value = Date.parse(start + 'T00:00:00Z') + n * step * dayMs;
    if (value > Date.parse('9999-12-31T00:00:00Z')) return null;
    result = new Date(value).toISOString().slice(0, 10);
  } else {
    const [sy, sm, sd] = start.split('-').map(Number),
      [ly, lm] = lower.split('-').map(Number);
    let n = Math.max(0, Math.floor(((ly - sy) * 12 + lm - sm) / rule.interval));
    for (let attempt = 0; attempt < 2; attempt++, n++) {
      const month = sy * 12 + sm - 1 + n * rule.interval,
        year = Math.floor(month / 12),
        m = month % 12;
      if (year > 9999) return null;
      const last = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      result = `${String(year).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(Math.min(sd, last)).padStart(2, '0')}`;
      if (result >= lower) break;
    }
  }
  return result >= lower && result <= rule.endDate ? result : null;
}
export function occurrenceDates(rule, from, to, limit = 100) {
  const dates = [];
  let cursor = nextOccurrence(rule, from);
  while (cursor && cursor <= to && dates.length < limit) {
    dates.push(cursor);
    if (cursor === '9999-12-31') break;
    cursor = nextOccurrence(rule, addDays(cursor, 1));
  }
  return dates;
}
export const occurrenceDue = (date, time) =>
  new Date(`${date}T${time ? time + ':00.000' : '23:59:59.999'}+05:30`);

export function repeatPreview(value, effectiveFrom = '') {
  if (
    !value.repeatEnabled ||
    !validRepeat(value) ||
    !Number.isInteger(value.repeatInterval) ||
    value.repeatInterval < 1 ||
    value.repeatInterval > 365
  )
    return [];
  if (
    !value.repeatStartDate ||
    !value.repeatEndDate ||
    !repeatDate.safeParse(value.repeatStartDate).success ||
    !repeatDate.safeParse(value.repeatEndDate).success ||
    !['DAILY', 'WEEKLY', 'MONTHLY'].includes(value.repeatFrequency)
  )
    return [];
  const rule = repeatInput(value),
    today = indiaToday();
  const from = [today, rule.startDate, effectiveFrom].sort().at(-1),
    first = nextOccurrence(rule, from);
  return first ? occurrenceDates(rule, first, addDays(first, 89), 5) : [];
}
export const seriesFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a task title.').max(160),
    description: z.string().trim().max(2000),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    assigneeIds: z.array(z.string().regex(/^[a-f\d]{24}$/)).max(50),
    eventId: z.union([z.literal(''), z.string().regex(/^[a-f\d]{24}$/)]),
    dueTime: z.union([
      z.literal(''),
      z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    ]),
    ...repeatFields,
  })
  .refine((v) => !v.repeatEnabled || validRepeat(v), {
    path: ['repeatEndDate'],
    message: 'Choose start/end dates with end on or after start.',
  });
