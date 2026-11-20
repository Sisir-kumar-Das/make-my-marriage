import { Types } from 'mongoose';
import { ApiError } from '../lib/api-error.js';

export function activityDto(row) {
  return {
    id: String(row._id),
    name: row.name,
    startAt: new Date(row.startAt).toISOString(),
    endAt: row.endAt ? new Date(row.endAt).toISOString() : null,
    description: row.description || '',
  };
}
export function materializeActivities(rows, previous = []) {
  const owned = new Set(previous.map((row) => String(row._id)));
  return rows.map(({ id, ...row }) => {
    if (id && !owned.has(id))
      throw new ApiError(
        400,
        'ACTIVITY_INVALID',
        'An activity does not belong to this ceremony. Reload its latest details.',
      );
    return { ...row, _id: id ? new Types.ObjectId(id) : new Types.ObjectId() };
  });
}
export function activityChanges(previous, next) {
  const before = new Map(previous.map((row) => [String(row._id), row]));
  const after = new Map(next.map((row) => [String(row._id), row]));
  const changes = [];
  for (const [id, row] of after) {
    const old = before.get(id);
    if (!old) changes.push({ action: 'EVENT_ACTIVITY_CREATED', row });
    else if (
      JSON.stringify(activityDto(old)) !== JSON.stringify(activityDto(row))
    )
      changes.push({ action: 'EVENT_ACTIVITY_UPDATED', row });
  }
  for (const [id, row] of before)
    if (!after.has(id)) changes.push({ action: 'EVENT_ACTIVITY_REMOVED', row });
  return changes;
}
// At most four summaries, even at the activity cap. Missing ends never imply a duration.
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
