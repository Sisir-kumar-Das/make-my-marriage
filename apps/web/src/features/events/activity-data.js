import { z } from 'zod';

export const activityLimit = 50;
const date = z.iso.date();
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const activityFormSchema = z
  .object({
    activityId: z
      .union([z.literal(''), z.string().regex(/^[a-f\d]{24}$/)])
      .default(''),
    name: z.string().trim().min(1, 'Enter an activity name.').max(160),
    startDate: date,
    startTime: time,
    hasEnd: z.boolean(),
    endDate: z.string(),
    endTime: z.string(),
    description: z.string().trim().max(1000),
  })
  .superRefine((value, ctx) => {
    if (!value.hasEnd) return;
    if (!date.safeParse(value.endDate).success)
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'Choose an end date.',
      });
    if (!time.safeParse(value.endTime).success)
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'Choose an end time.',
      });
    if (
      date.safeParse(value.endDate).success &&
      time.safeParse(value.endTime).success &&
      `${value.endDate}T${value.endTime}` <=
        `${value.startDate}T${value.startTime}`
    )
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message:
          'Activity end must be after start. Choose the next date for overnight activities.',
      });
  });
export function newActivity(parent) {
  return {
    activityId: '',
    name: '',
    startDate: parent.startDate || '',
    startTime: parent.startTime || '',
    hasEnd: false,
    endDate: parent.startDate || '',
    endTime: '',
    description: '',
  };
}
export function activityEditValues(activity, parent) {
  if (!activity) return newActivity(parent);
  const parts = (instant) =>
    new Date(Date.parse(instant) + 330 * 60000).toISOString();
  const start = parts(activity.startAt),
    end = activity.endAt ? parts(activity.endAt) : null;
  return {
    activityId: activity.id,
    name: activity.name,
    startDate: start.slice(0, 10),
    startTime: start.slice(11, 16),
    hasEnd: !!end,
    endDate: end?.slice(0, 10) || start.slice(0, 10),
    endTime: end?.slice(11, 16) || '',
    description: activity.description || '',
  };
}
// The activity endpoint accepts fields only; the saved ID belongs in the route.
export function activityWriteBody(values) {
  const row = activityInput(values);
  return {
    name: row.name,
    startAt: row.startAt,
    endAt: row.endAt,
    description: row.description,
  };
}
export function activityInput(value) {
  const row = activityFormSchema.parse(value);
  return {
    ...(row.activityId ? { id: row.activityId } : {}),
    name: row.name,
    startAt: new Date(
      `${row.startDate}T${row.startTime}:00+05:30`,
    ).toISOString(),
    endAt: row.hasEnd
      ? new Date(`${row.endDate}T${row.endTime}:00+05:30`).toISOString()
      : null,
    description: row.description,
  };
}
export function activityDuration({ startAt, endAt }) {
  if (!endAt) return null;
  const minutes = (Date.parse(endAt) - Date.parse(startAt)) / 60000;
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  const short = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
  return [hours ? `${hours} hr` : '', rest ? `${short.format(rest)} min` : '']
    .filter(Boolean)
    .join(' ');
}

// Preview only; Express recomputes authoritative warnings when reading/saving.
export function activityTimingWarnings(event) {
  const rows = event.activities || [];
  const groups = new Map();
  function add(code, ids) {
    const group = groups.get(code) || { count: 0, ids: new Set() };
    group.count++;
    ids.forEach((id) => group.ids.add(String(id)));
    groups.set(code, group);
  }
  for (const row of rows) {
    const start = +new Date(row.startAt),
      end = row.endAt ? +new Date(row.endAt) : null;
    if (
      start < +new Date(event.startAt) ||
      start >= +new Date(event.endAt) ||
      (end !== null && end > +new Date(event.endAt))
    )
      add('ACTIVITY_OUTSIDE_EVENT', [row._id]);
  }
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i],
        b = rows[j],
        x = +new Date(a.startAt),
        y = +new Date(b.startAt);
      const endA = a.endAt ? +new Date(a.endAt) : null,
        endB = b.endAt ? +new Date(b.endAt) : null;
      if (endA !== null && endB !== null) {
        if (x < endB && y < endA) add('ACTIVITY_OVERLAP', [a._id, b._id]);
      } else if (x === y) add('ACTIVITY_SAME_START', [a._id, b._id]);
      else if (
        (endA !== null && y > x && y < endA) ||
        (endB !== null && x > y && x < endB)
      )
        add('ACTIVITY_START_DURING', [a._id, b._id]);
    }
  const messages = {
    ACTIVITY_OUTSIDE_EVENT: 'Outside ceremony timing',
    ACTIVITY_OVERLAP: 'Overlapping activity intervals',
    ACTIVITY_SAME_START:
      'Activities with the same start; missing ends mean duration overlap is unknown',
    ACTIVITY_START_DURING:
      'Starts inside another activity’s interval; full duration overlap is unknown',
  };
  return [...groups].map(([code, { count, ids }]) => ({
    code,
    count,
    activityIds: [...ids],
    message: `${messages[code]} (${count}). Review the highlighted activities; saving is allowed.`,
  }));
}

export function activityDraftWarnings(values) {
  if (
    !date.safeParse(values.startDate).success ||
    !time.safeParse(values.startTime).success ||
    !date.safeParse(values.endDate).success ||
    !time.safeParse(values.endTime).success
  )
    return [];
  const activities = (values.activities || []).flatMap((row, index) => {
    const valid = activityFormSchema.safeParse(row);
    return valid.success
      ? [
          {
            ...activityInput(valid.data),
            _id: valid.data.activityId || `draft-${index}`,
          },
        ]
      : [];
  });
  return activityTimingWarnings({
    startAt: `${values.startDate}T${values.startTime}:00+05:30`,
    endAt: `${values.endDate}T${values.endTime}:00+05:30`,
    activities,
  });
}
