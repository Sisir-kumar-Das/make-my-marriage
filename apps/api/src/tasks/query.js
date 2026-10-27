import { Types } from 'mongoose';

// Call only after taskListSchema validation. Every condition is ANDed with the tenant.
export function taskQueryFilter(query, weddingId, userId, mine, instant) {
  const terms = [
    {
      weddingId: new Types.ObjectId(weddingId),
      deletedAt: null,
      recurrenceExcluded: { $ne: true },
    },
  ];
  if (mine) terms.push({ assigneeIds: new Types.ObjectId(userId) });
  if (query.q) {
    const literal = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    terms.push({
      $or: ['title', 'description'].map((field) => ({
        [field]: { $regex: literal, $options: 'i' },
      })),
    });
  }
  if (query.recurring)
    terms.push({ seriesId: query.recurring === 'true' ? { $ne: null } : null });
  if (query.status) terms.push({ status: query.status });
  if (query.priority) terms.push({ priority: query.priority });
  if (query.assigneeId)
    terms.push(
      query.assigneeId === 'unassigned'
        ? { assigneeIds: { $size: 0 } }
        : { assigneeIds: new Types.ObjectId(query.assigneeId) },
    );
  if (query.eventId)
    terms.push({
      eventId:
        query.eventId === 'none' ? null : new Types.ObjectId(query.eventId),
    });
  if (query.from || query.to) {
    const dueAt = { $ne: null };
    if (query.from) dueAt.$gte = new Date(`${query.from}T00:00:00+05:30`);
    if (query.to)
      dueAt.$lt = new Date(Date.parse(`${query.to}T00:00:00+05:30`) + 86400000);
    terms.push({ dueAt });
  }
  if (query.overdue === 'true')
    terms.push({
      status: { $ne: 'COMPLETED' },
      dueAt: { $ne: null, $lt: instant },
    });
  if (query.overdue === 'false')
    terms.push({
      $or: [
        { status: 'COMPLETED' },
        { dueAt: null },
        { dueAt: { $gte: instant } },
      ],
    });
  return { $and: terms };
}
