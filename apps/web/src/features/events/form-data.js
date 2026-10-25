import { z } from 'zod';
import {
  activityFormSchema,
  activityInput,
  activityLimit,
} from './activity-data.js';

export const eventTypes = [
  ['ENGAGEMENT', 'Engagement'],
  ['HALDI', 'Haldi'],
  ['MEHENDI', 'Mehendi'],
  ['SANGEET', 'Sangeet'],
  ['BARAJATRI', 'Barajatri'],
  ['WEDDING', 'Wedding'],
  ['RECEPTION', 'Reception'],
  ['CUSTOM', 'Custom Celebration'],
];
export const eventStatuses = [
  ['PLANNED', 'Planned'],
  ['CONFIRMED', 'Confirmed'],
  ['COMPLETED', 'Completed'],
  ['CANCELLED', 'Cancelled'],
];
const calendar = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.')
  .refine((value) => {
    const date = new Date(value + 'T12:00:00Z');
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, 'Choose a real calendar date.');
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Choose a time.');
export const eventFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter an event name.').max(160),
    type: z.enum(eventTypes.map(([key]) => key)),
    description: z.string().trim().max(2000),
    status: z.enum(eventStatuses.map(([key]) => key)),
    startDate: calendar,
    startTime: time,
    endDate: calendar,
    endTime: time,
    venueName: z.string().trim().max(200),
    address: z.string().trim().max(500),
    city: z.string().trim().max(100),
    state: z.string().trim().max(100),
    activities: z.array(activityFormSchema).max(activityLimit).default([]),
  })
  .refine(
    (value) =>
      `${value.endDate}T${value.endTime}` >
      `${value.startDate}T${value.startTime}`,
    {
      path: ['endTime'],
      message:
        'End must be after start. Choose the next date for an overnight ceremony.',
    },
  );
export const futureCompletionMessage =
  'A future ceremony cannot be marked Completed. Choose another status or correct its start time.';

export function eventStatusTiming(values, now = new Date()) {
  const today = indiaParts(now).date;
  const validStart = calendar.safeParse(values.startDate).success;
  const validEnd = calendar.safeParse(values.endDate).success;
  const future =
    validStart &&
    (values.startDate > today ||
      (values.startDate === today &&
        time.safeParse(values.startTime).success &&
        Date.parse(`${values.startDate}T${values.startTime}:00+05:30`) >
          Number(now)));
  const ended =
    validStart &&
    validEnd &&
    values.endDate >= values.startDate &&
    (values.endDate < today ||
      (values.endDate === today &&
        time.safeParse(values.endTime).success &&
        Date.parse(`${values.endDate}T${values.endTime}:00+05:30`) <=
          Number(now)));
  return {
    future: !!future,
    reviewStatus: !!ended && ['PLANNED', 'CONFIRMED'].includes(values.status),
  };
}

// Temporal validation is separate from serialization so unchanged attempted saves keep their retry identity.
export function eventFormValidation({
  now = () => new Date(),
  canRetry = () => false,
} = {}) {
  return eventFormSchema.refine(
    (values) =>
      values.status !== 'COMPLETED' ||
      !eventStatusTiming(values, now()).future ||
      canRetry(values),
    {
      path: ['status'],
      message: futureCompletionMessage,
      when: ({ value }) => eventFormSchema.safeParse(value).success,
    },
  );
}
export function nextDate(value) {
  if (!calendar.safeParse(value).success) return '';
  return new Date(Date.parse(value + 'T12:00:00Z') + 86400000)
    .toISOString()
    .slice(0, 10);
}
export function indiaParts(instant) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
export function initialEvent(wedding, event) {
  const start = event
    ? indiaParts(event.startAt)
    : { date: wedding.mainDate, time: '' };
  const end = event
    ? indiaParts(event.endAt)
    : { date: wedding.mainDate, time: '' };
  return {
    name: event?.name || '',
    type: event?.type || 'CUSTOM',
    description: event?.description || '',
    status: event?.status || 'PLANNED',
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    venueName: event?.venue?.name || '',
    address: event?.venue?.formattedAddress || '',
    city: event?.venue?.city || '',
    state: event?.venue?.state || '',
    activities: (event?.activities || []).map((row) => ({
      activityId: row.id,
      name: row.name,
      startDate: indiaParts(row.startAt).date,
      startTime: indiaParts(row.startAt).time,
      hasEnd: !!row.endAt,
      endDate: indiaParts(row.endAt || row.startAt).date,
      endTime: row.endAt ? indiaParts(row.endAt).time : '',
      description: row.description || '',
    })),
  };
}
export function eventInput(values) {
  const v = eventFormSchema.parse(values);
  const hasVenue = [v.venueName, v.address, v.city, v.state].some(Boolean);
  return {
    name: v.name,
    type: v.type,
    description: v.description,
    startAt: new Date(`${v.startDate}T${v.startTime}:00+05:30`).toISOString(),
    endAt: new Date(`${v.endDate}T${v.endTime}:00+05:30`).toISOString(),
    venue: hasVenue
      ? {
          source: 'MANUAL',
          name: v.venueName,
          formattedAddress: v.address,
          city: v.city,
          state: v.state,
        }
      : null,
    status: v.status,
    activities: v.activities.map(activityInput),
  };
}
export function mapsLink(venue) {
  const query = [
    venue?.name,
    venue?.formattedAddress,
    venue?.city,
    venue?.state,
  ]
    .filter(Boolean)
    .join(', ');
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null;
}
export function eventTime(instant) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(instant));
}
export function eventDate(
  instant,
  options = { day: 'numeric', month: 'short', year: 'numeric' },
) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    ...options,
  }).format(new Date(instant));
}
export function eventRange(event) {
  const start = indiaParts(event.startAt).date;
  const end = indiaParts(event.endAt).date;
  const endDate =
    start !== end
      ? eventDate(event.endAt, {
          day: 'numeric',
          month: 'short',
          year: start.slice(0, 4) !== end.slice(0, 4) ? 'numeric' : undefined,
        }) + ' · '
      : '';
  return `${eventTime(event.startAt)} – ${endDate}${eventTime(event.endAt)}`;
}
