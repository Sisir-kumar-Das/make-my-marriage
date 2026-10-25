// Input must already have passed eventListSchema. Never accept Mongo operators.
export function eventListFilter(weddingId, { q, from, to }) {
  const filter = { weddingId, deletedAt: null };
  if (q) {
    const literal = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      'name',
      'venue.name',
      'venue.formattedAddress',
      'venue.city',
      'venue.state',
    ].map((field) => ({ [field]: { $regex: literal, $options: 'i' } }));
  }
  // Half-open intervals: a ceremony ending at midnight does not occupy the next day.
  if (from) filter.endAt = { $gt: new Date(`${from}T00:00:00+05:30`) };
  if (to)
    filter.startAt = {
      $lt: new Date(Date.parse(`${to}T00:00:00+05:30`) + 86400000),
    };
  return filter;
}
