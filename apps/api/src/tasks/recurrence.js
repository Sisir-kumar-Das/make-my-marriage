import { z } from 'zod';

export const recurrenceSchema = z
  .object({
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
    interval: z.number().int().min(1).max(365).default(1),
    startDate: z.iso.date().regex(/^[1-9]\d{3}-/),
    endDate: z.iso
      .date()
      .regex(/^[1-9]\d{3}-/)
      .nullable()
      .optional(),
    time: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .default(null),
  })
  .strict()
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'Repeat end must be on or after its start.',
  });
export const seriesPatchSchema = z
  .object({
    recurrence: recurrenceSchema,
    active: z.boolean(),
    template: z
      .object({
        title: z.string().trim().min(1).max(160),
        description: z.string().trim().max(2000),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
        assigneeIds: z
          .array(z.string().regex(/^[a-f\d]{24}$/))
          .max(100)
          .transform((v) => [...new Set(v)].sort())
          .refine((v) => v.length <= 50, 'Choose up to 50 assignees.'),
        eventId: z
          .string()
          .regex(/^[a-f\d]{24}$/)
          .nullable(),
      })
      .strict(),
  })
  .strict();
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
export function resolveRecurrence(raw, wedding, instant) {
  const rule = { ...raw, endDate: raw.endDate || wedding.mainDate };
  const today = indiaToday(instant);
  if (!raw.endDate && wedding.mainDate < today)
    throw Object.assign(
      new Error('Choose an end date because this wedding date has passed.'),
      { recurrenceField: 'endDate' },
    );
  if (rule.endDate < rule.startDate)
    throw Object.assign(
      new Error('Repeat end must be on or after its start.'),
      { recurrenceField: 'endDate' },
    );
  return rule;
}
