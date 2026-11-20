import { Types } from 'mongoose';
import { ApiError } from '../lib/api-error.js';
import { taskModels } from '../tasks/models.js';
import { eventModels } from '../events/models.js';
import { indiaToday } from '../tasks/recurrence.js';

export const removalLimits = { tasks: 1000, rules: 200 };
export function removalTaskFilter(weddingId, userId) {
  return {
    weddingId,
    assigneeIds: userId,
    status: { $in: ['TODO', 'IN_PROGRESS'] },
    deletedAt: null,
    recurrenceExcluded: { $ne: true },
  };
}
export function remainingAssignees(ids, departingId, replacementId = null) {
  return [
    ...new Set([
      ...ids.map(String).filter((id) => id !== departingId),
      ...(replacementId ? [replacementId] : []),
    ]),
  ].sort();
}
export async function inspectRemoval(
  connection,
  session,
  weddingId,
  member,
  instant,
) {
  const { Task, TaskSeries } = taskModels(connection);
  const taskFilter = removalTaskFilter(weddingId, member.userId);
  const ruleFilter = {
    weddingId,
    active: true,
    endDate: { $gte: indiaToday(instant) },
    $or: [
      { 'template.assigneeIds': member.userId },
      { updatedBy: member.userId },
    ],
  };
  const taskCount = await Task.countDocuments(taskFilter).session(session);
  const ruleCount =
    await TaskSeries.countDocuments(ruleFilter).session(session);
  const overdueCount = await Task.countDocuments({
    ...taskFilter,
    dueAt: { $lt: instant },
  }).session(session);
  const assignmentRuleCount = await TaskSeries.countDocuments({
    ...ruleFilter,
    'template.assigneeIds': member.userId,
  }).session(session);
  const tasks = await Task.find(taskFilter)
    .select('_id __v title priority assigneeIds seriesId dueAt dueDateOnly')
    .sort({ dueAt: 1, _id: 1 })
    .limit(removalLimits.tasks + 1)
    .session(session)
    .lean();
  const rules = await TaskSeries.find(ruleFilter)
    .sort({ _id: 1 })
    .limit(removalLimits.rules + 1)
    .session(session)
    .lean();
  const assignmentRules = rules.filter((r) =>
    r.template.assigneeIds.some((id) => String(id) === String(member.userId)),
  );
  const managedRules = rules.filter(
    (r) => String(r.updatedBy) === String(member.userId),
  );
  return {
    day: indiaToday(instant),
    taskCount,
    ruleCount,
    overdueCount,
    assignmentRuleCount,
    tasks,
    rules,
    assignmentRules,
    managedRules,
    tooLarge:
      taskCount > removalLimits.tasks || ruleCount > removalLimits.rules,
  };
}
export async function applyRemovalWork(
  connection,
  session,
  weddingId,
  userId,
  member,
  work,
  input,
  instant,
) {
  const { Task, TaskSeries } = taskModels(connection),
    { Activity } = eventModels(connection);
  const departingId = String(member.userId),
    replacementId =
      input.policy === 'REASSIGN' ? input.replacementUserId : null;
  if (work.tasks.length) {
    const changes = work.tasks.map((task) => ({
      updateOne: {
        filter: { _id: task._id, weddingId, __v: task.__v || 0 },
        update: {
          $set: {
            assigneeIds: remainingAssignees(
              task.assigneeIds,
              departingId,
              replacementId,
            ),
            updatedBy: userId,
            ...(task.seriesId ? { occurrenceEdited: true } : {}),
          },
          $inc: { __v: 1 },
        },
      },
    }));
    const saved = await Task.bulkWrite(changes, { session, ordered: true });
    if (saved.matchedCount !== work.tasks.length)
      throw new ApiError(
        409,
        'MEMBER_PREVIEW_STALE',
        'Affected tasks changed. Reload the removal preview.',
      );
    await Activity.insertMany(
      work.tasks.map((task) => ({
        weddingId,
        actorId: userId,
        action: 'TASK_ASSIGNEES_CHANGED',
        entityType: 'TASK',
        entityId: task._id,
        displaySnapshot: { label: task.title },
        createdAt: instant,
      })),
      { session, ordered: true },
    );
  }
  if (work.rules.length) {
    const changes = work.rules.map((rule) => {
      const assigned = rule.template.assigneeIds.some(
        (id) => String(id) === departingId,
      );
      const managed = String(rule.updatedBy) === departingId;
      const update = {
        ...(assigned
          ? {
              'template.assigneeIds': remainingAssignees(
                rule.template.assigneeIds,
                departingId,
                replacementId,
              ).map((id) => new Types.ObjectId(id)),
            }
          : {}),
        // Assignment policy does not silently transfer an unaffected manager.
        ...(managed ? { updatedBy: input.handoverToUserId } : {}),
        ...(managed && rule.generationIssue === 'OWNER_UNAVAILABLE'
          ? { generationIssue: null, retryAt: null }
          : {}),
      };
      return {
        updateOne: {
          filter: { _id: rule._id, weddingId, __v: rule.__v || 0 },
          update: { $set: update, $inc: { __v: 1 } },
        },
      };
    });
    const saved = await TaskSeries.bulkWrite(changes, {
      session,
      ordered: true,
    });
    if (saved.matchedCount !== work.rules.length)
      throw new ApiError(
        409,
        'MEMBER_PREVIEW_STALE',
        'Affected repeats changed. Reload the removal preview.',
      );
    await Activity.insertMany(
      work.rules.map((rule) => ({
        weddingId,
        actorId: userId,
        action: 'TASK_RECURRENCE_MEMBER_REMOVED',
        entityType: 'TASK_SERIES',
        entityId: rule._id,
        displaySnapshot: { label: rule.template.title },
        createdAt: instant,
      })),
      { session, ordered: true },
    );
  }
}
