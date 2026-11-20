import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import {
  activityRow,
  createActivityService,
  visibleActivity,
} from '../apps/api/src/activity/service.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { eventModels } from '../apps/api/src/events/models.js';
import { taskModels } from '../apps/api/src/tasks/models.js';
import { taskActivityAction } from '../apps/api/src/tasks/service.js';
import { weddingModels } from '../apps/api/src/weddings/models.js';
import {
  activityGroups,
  activityTime,
} from '../apps/web/src/features/dashboard/activity-dates.js';

const weddingId = 'a'.repeat(24);
const userId = 'b'.repeat(24);
const taskId = 'c'.repeat(24);
const when = new Date('2026-11-07T18:30:00.000Z');

test('activity filters invitation writes by role and excludes checklist task creation before counting', () => {
  for (const role of ['ADMIN', 'FAMILY_MEMBER', 'VIEWER']) {
    const pipeline = visibleActivity(weddingId, role, {
      generations: 'checklistGenerations',
      tasks: 'tasks',
      series: 'taskSeries',
    });
    assert.equal(pipeline[0].$match.weddingId, weddingId);
    const actions = pipeline[0].$match.action.$in;
    assert.equal(actions.includes('INVITATION_CREATE'), role === 'ADMIN');
    assert.equal(actions.includes('INVITATION_DECLINE'), false);
    assert.equal(actions.includes('INVITATION_ACCEPT'), true);
    assert.equal(actions.includes('CHECKLIST_GENERATED'), true);
    assert.deepEqual(pipeline[1].$sort, { createdAt: -1, _id: -1 });
    assert.equal(actions.includes('TASK_SERIES_CREATED'), true);
    assert.deepEqual(pipeline[0].$match.feedHidden, { $ne: true });
    assert.equal(pipeline[2].$set.legacyTaskId.$cond[2], false);
    assert.equal(pipeline[3].$lookup.localField, 'legacyTaskId');
    assert.equal(pipeline[3].$lookup.foreignField, 'addedTaskIds');
    assert.equal(pipeline[5].$lookup.localField, 'legacyTaskId');
  }
});

function fixture(
  t,
  { member = { role: 'VIEWER' }, rows = [], total = 0 } = {},
) {
  const connection = mongoose.createConnection();
  t.after(() => connection.close());
  t.mock.method(connection, 'transaction', async (read) => read({}));
  const { User } = authModels(connection);
  const { Wedding, WeddingMember } = weddingModels(connection);
  const { Activity } = eventModels(connection);
  const { Task } = taskModels(connection);
  function query(result) {
    return {
      select: () => query(result),
      session: () => query(result),
      lean: async () => result,
    };
  }
  t.mock.method(User, 'exists', () => ({ session: async () => true }));
  t.mock.method(User, 'find', () =>
    query([{ _id: userId, profile: { displayName: 'Priya' } }]),
  );
  t.mock.method(Wedding, 'exists', () => ({ session: async () => true }));
  t.mock.method(WeddingMember, 'findOne', () => query(member));
  t.mock.method(Task, 'find', () => query([{ _id: taskId }]));
  const pipelines = [];
  t.mock.method(Activity, 'aggregate', (pipeline) => {
    pipelines.push(pipeline);
    return {
      session: async () =>
        pipeline.some((stage) => '$facet' in stage) ? [{ total }] : rows,
    };
  });
  return {
    list: createActivityService({
      database: { connect: async () => connection },
    }),
    pipelines,
  };
}

test('activity denies nonmembers before reading history and validates query bounds', async (t) => {
  const { list, pipelines } = fixture(t, { member: null });
  await assert.rejects(list(userId, weddingId, { limit: '100' }), {
    status: 400,
  });
  await assert.rejects(list(userId, weddingId, {}), { status: 404 });
  assert.equal(pipelines.length, 0);
});

test('activity clamps the final page, projects public summaries and leaves deleted rows unlinked', async (t) => {
  const rows = ['TASK_RESTORED', 'TASK_DELETED', 'INVITATION_ACCEPT'].map(
    (action, index) => ({
      _id: index,
      actorId: userId,
      action,
      entityId: action.startsWith('TASK') ? taskId : weddingId,
      entityType: action.startsWith('TASK') ? 'TASK' : 'MEMBER_INVITATION',
      displaySnapshot: {
        label: action.startsWith('TASK')
          ? 'Book photographer'
          : 'private@example.test',
        role: 'FAMILY_MEMBER',
      },
      createdAt: when,
    }),
  );
  const { list, pipelines } = fixture(t, { rows, total: 23 });
  const result = await list(userId, weddingId, { page: '99' });
  assert.deepEqual(
    { ...result, items: undefined },
    {
      page: 2,
      totalPages: 2,
      total: 23,
      from: 21,
      to: 23,
      items: undefined,
    },
  );
  const count = pipelines[0].find((stage) => '$facet' in stage).$facet;
  assert.equal(
    count.known.some((stage) => '$lookup' in stage),
    false,
  );
  assert.equal(count.legacy[0].$match.action, 'TASK_CREATED');
  assert.deepEqual(pipelines[1].slice(-2), [{ $skip: 20 }, { $limit: 20 }]);
  assert.equal(result.items[0].href, '/tasks?task=' + taskId);
  assert.equal(result.items[1].href, null);
  assert.equal(result.items[1].label, 'Book photographer');
  assert.equal(result.items[2].role, 'FAMILY_MEMBER');
  assert.equal(result.items[2].actor, 'Priya');
  assert.equal(result.items[2].label, null);
  assert.equal(JSON.stringify(result).includes('private@example.test'), false);
});

test('dashboard activity requests just three entries and skips the total count', async (t) => {
  const { list, pipelines } = fixture(t);
  assert.deepEqual(await list(userId, weddingId, { page: '99', limit: '3' }), {
    items: [],
  });
  assert.equal(pipelines.length, 1);
  assert.deepEqual(pipelines[0].at(-1), { $limit: 3 });
  assert.equal(
    pipelines[0].some(
      (stage) => '$skip' in stage || '$count' in stage || '$facet' in stage,
    ),
    false,
  );
});

test('member removal uses the saved name without the old audit prefix', () => {
  const row = {
    _id: 1,
    actorId: userId,
    action: 'MEMBER_REMOVED',
    displaySnapshot: { label: 'Member access removed: Ravi' },
    createdAt: when,
  };
  assert.equal(activityRow(row, new Map(), new Map()).label, 'Ravi');
});

test('completion audit requires an existing task to transition into Completed', () => {
  const completed = { status: 'COMPLETED' };
  const todo = { status: 'TODO' };
  assert.equal(taskActivityAction(undefined, completed), 'TASK_CREATED');
  assert.equal(taskActivityAction(todo, completed), 'TASK_COMPLETED');
  assert.equal(taskActivityAction(completed, completed), 'TASK_UPDATED');
  assert.equal(taskActivityAction(completed, todo), 'TASK_UPDATED');
});

test('activity groups both sides of India midnight independently of the browser timezone', () => {
  const now = when.getTime();
  const today = { createdAt: when.toISOString() };
  const yesterday = { createdAt: new Date(now - 1).toISOString() };
  assert.deepEqual(
    activityGroups([today, yesterday], now).map(({ title }) => title),
    ['Today — 8 Nov 2026', 'Yesterday — 7 Nov 2026'],
  );
  assert.match(activityTime(today.createdAt, now), /^Today, 12:00.*IST$/);
});
