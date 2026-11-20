import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { config } from '../apps/api/src/config.js';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { createAuthService } from '../apps/api/src/auth/service.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';
import { weddingModels } from '../apps/api/src/weddings/models.js';
import { createEventService } from '../apps/api/src/events/service.js';
import { eventModels } from '../apps/api/src/events/models.js';
import { createTaskService } from '../apps/api/src/tasks/service.js';
import { taskModels } from '../apps/api/src/tasks/models.js';

test(
  'Atlas Tasks Step 1: authorization, deadlines, history, retries, links and collaborative edits',
  { skip: !config.mongodbUri && 'Set private MONGODB_URI for Atlas checks.' },
  async (t) => {
    const settings = {
      ...config,
      mongodbDbName: 'mmm_tasks_test_' + randomBytes(8).toString('hex'),
      jwtSecret: randomBytes(48).toString('base64url'),
      emailProvider: 'resend',
      resendApiKey: 'test-only',
      emailFrom: 'test@example.com',
    };
    const database = createAuthDatabase(settings),
      weddings = createWeddingService({ database }),
      events = createEventService({ database });
    let instant = new Date('2027-01-01T12:00:00Z');
    const tasks = createTaskService({ database, now: () => instant });
    const auth = createAuthService({
      settings,
      database,
      sendVerification: async () => {},
    });
    const connection = await database.connect();
    const { User } = authModels(connection),
      { Wedding, WeddingMember } = weddingModels(connection),
      { Activity, Event } = eventModels(connection),
      { Task, TaskWriteRequest } = taskModels(connection);
    let sequence = 0;
    async function account() {
      const email = `tasks-${++sequence}@example.com`;
      await auth.register({
        name: 'Task Fixture',
        email,
        password: 'Wedding123',
      });
      const user = await User.findOneAndUpdate(
        { emailNormalized: email },
        { $set: { emailVerifiedAt: new Date() } },
        { returnDocument: 'after' },
      );
      return String(user._id);
    }
    const input = {
      title: 'Confirm the photographer',
      description: 'Entered family notes',
      priority: 'HIGH',
      dueAt: '2020-02-20T18:29:59.999Z',
      dueDateOnly: true,
    };
    const weddingInput = {
      name: 'Task Test Wedding',
      brideName: 'Anya',
      groomName: 'Kabir',
      mainDate: '2028-02-20',
      tradition: 'ODIA',
      location: { city: 'Cuttack', state: 'Odisha', countryCode: 'IN' },
    };
    let admin, family, viewer, outsider, wid, otherWid, first;
    try {
      admin = await account();
      family = await account();
      viewer = await account();
      outsider = await account();
      wid = (await weddings.create(admin, weddingInput, randomUUID())).wedding
        .id;
      otherWid = (await weddings.create(outsider, weddingInput, randomUUID()))
        .wedding.id;
      for (const [userId, role] of [
        [family, 'FAMILY_MEMBER'],
        [viewer, 'VIEWER'],
      ])
        await WeddingMember.create({
          weddingId: wid,
          userId,
          role,
          status: 'ACTIVE',
          joinedAt: new Date(),
          createdBy: admin,
        });
      await t.test(
        'empty list has genuine zero counts; Family Member creates an unassigned, historical task with one audit entry',
        async () => {
          assert.deepEqual((await tasks.list(viewer, wid)).meta.counts, {
            total: 0,
            completed: 0,
            inProgress: 0,
            overdue: 0,
          });
          const result = await tasks.create(family, wid, input, randomUUID());
          first = result.task;
          assert.equal(first.dueAt, input.dueAt);
          assert.equal(first.overdue, true);
          assert.deepEqual(first.assigneeIds, []);
          assert.deepEqual(first.source, { type: 'MANUAL' });
          assert.equal(result.warnings[0].code, 'PAST_DUE_DATE');
          const history = await Activity.findOne({ entityId: first.id }).lean();
          assert.equal(history.action, 'TASK_CREATED');
          assert.equal(history.displaySnapshot.label, input.title);
          assert.equal(
            (await tasks.read(viewer, wid, first.id)).task.id,
            first.id,
          );
        },
      );
      await t.test(
        'Viewer cannot mutate and foreign wedding/task/event IDs cannot be accessed or injected',
        async () => {
          await assert.rejects(tasks.create(viewer, wid, input, randomUUID()), {
            code: 'FORBIDDEN',
          });
          await assert.rejects(
            tasks.update(
              viewer,
              wid,
              first.id,
              { title: 'Denied' },
              randomUUID(),
              '"0"',
            ),
            { code: 'FORBIDDEN' },
          );
          await assert.rejects(tasks.read(outsider, wid, first.id), {
            code: 'WEDDING_NOT_FOUND',
          });
          await assert.rejects(tasks.read(outsider, otherWid, first.id), {
            code: 'TASK_NOT_FOUND',
          });
          const foreign = (
            await events.create(
              outsider,
              otherWid,
              {
                name: 'Foreign',
                type: 'CUSTOM',
                startAt: '2028-02-20T03:00:00Z',
                endAt: '2028-02-20T04:00:00Z',
              },
              randomUUID(),
            )
          ).event;
          await assert.rejects(
            tasks.create(
              admin,
              wid,
              { ...input, eventId: foreign.id },
              randomUUID(),
            ),
            { code: 'EVENT_UNAVAILABLE' },
          );
          assert.equal(await Task.countDocuments({ title: 'Denied' }), 0);
        },
      );
      await t.test(
        'same-key concurrent creation commits one task, one audit and one receipt; payload changes conflict',
        async () => {
          const key = randomUUID(),
            body = { ...input, title: 'Concurrent task' };
          const results = await Promise.all([
            tasks.create(admin, wid, body, key),
            tasks.create(admin, wid, body, key),
            tasks.create(admin, wid, body, key),
          ]);
          assert.equal(new Set(results.map((r) => r.task.id)).size, 1);
          assert.equal(await Task.countDocuments({ title: body.title }), 1);
          assert.equal(
            await Activity.countDocuments({ entityId: results[0].task.id }),
            1,
          );
          assert.equal(
            await TaskWriteRequest.countDocuments({
              taskId: results[0].task.id,
            }),
            1,
          );
          await assert.rejects(
            tasks.create(admin, wid, { ...body, title: 'Changed' }, key),
            { code: 'IDEMPOTENCY_CONFLICT' },
          );
        },
      );
      await t.test(
        'task, history, receipt and wedding revisions roll back together on an audit failure',
        async () => {
          const before = (await Wedding.findById(wid).lean()).taskRevision;
          const original = Activity.create;
          Activity.create = async () => {
            throw new Error('Injected task history failure');
          };
          try {
            await assert.rejects(
              tasks.create(
                admin,
                wid,
                { title: 'Rollback task' },
                randomUUID(),
              ),
              /Injected task history failure/,
            );
          } finally {
            Activity.create = original;
          }
          assert.equal(
            await Task.countDocuments({ title: 'Rollback task' }),
            0,
          );
          assert.equal(
            (await Wedding.findById(wid).lean()).taskRevision,
            before,
          );
        },
      );
      await t.test(
        'completion records its actor/time, retains them on notes edits and clears on reopening; stale versions never overwrite',
        async () => {
          const completed = await tasks.update(
            family,
            wid,
            first.id,
            { status: 'COMPLETED' },
            randomUUID(),
            '"0"',
          );
          assert.equal(completed.task.completedAt, instant.toISOString());
          assert.equal(completed.task.completedBy, family);
          assert.equal(completed.task.overdue, false);
          instant = new Date('2027-01-02T12:00:00Z');
          const edited = await tasks.update(
            admin,
            wid,
            first.id,
            { description: 'More notes' },
            randomUUID(),
            '"1"',
          );
          assert.equal(edited.task.completedAt, completed.task.completedAt);
          await assert.rejects(
            tasks.update(
              admin,
              wid,
              first.id,
              { title: 'Stale' },
              randomUUID(),
              '"0"',
            ),
            { code: 'VERSION_CONFLICT' },
          );
          const reopened = await tasks.update(
            family,
            wid,
            first.id,
            { status: 'IN_PROGRESS' },
            randomUUID(),
            '"2"',
          );
          assert.equal(reopened.task.completedAt, null);
          assert.equal(reopened.task.completedBy, null);
          assert.equal(reopened.task.overdue, true);
        },
      );
      await t.test(
        'lost update responses replay the current record without repeating completion after a later reopening',
        async () => {
          const item = (
            await tasks.create(
              admin,
              wid,
              { title: 'Retry completion' },
              randomUUID(),
            )
          ).task;
          const key = randomUUID();
          await tasks.update(
            admin,
            wid,
            item.id,
            { status: 'COMPLETED' },
            key,
            '"0"',
          );
          await tasks.update(
            family,
            wid,
            item.id,
            { status: 'TODO' },
            randomUUID(),
            '"1"',
          );
          const replay = await tasks.update(
            admin,
            wid,
            item.id,
            { status: 'COMPLETED' },
            key,
            '"0"',
          );
          assert.equal(replay.replayed, true);
          assert.equal(replay.task.status, 'TODO');
          assert.equal(replay.task.version, 2);
          assert.equal(await Activity.countDocuments({ entityId: item.id }), 3);
        },
      );
      await t.test(
        'active ceremony links work; removed ceremonies do not expose names or delete tasks, and unchanged historical links remain editable',
        async () => {
          const ceremony = (
            await events.create(
              admin,
              wid,
              {
                name: 'Family ceremony',
                type: 'HALDI',
                startAt: '2028-02-20T03:00:00Z',
                endAt: '2028-02-20T04:00:00Z',
              },
              randomUUID(),
            )
          ).event;
          const item = (
            await tasks.create(
              family,
              wid,
              { ...input, title: 'Linked task', eventId: ceremony.id },
              randomUUID(),
            )
          ).task;
          assert.equal(item.event.name, ceremony.name);
          const removed = await events.changeLifecycle(
            'DELETE_EVENT',
            admin,
            wid,
            ceremony.id,
            {},
            randomUUID(),
            '"0"',
          );
          const unavailable = (await tasks.read(viewer, wid, item.id)).task;
          assert.equal(unavailable.event.available, false);
          assert.equal(unavailable.event.name, null);
          assert.equal(unavailable.eventId, ceremony.id);
          await tasks.update(
            family,
            wid,
            item.id,
            { description: 'Still usable' },
            randomUUID(),
            '"0"',
          );
          await assert.rejects(
            tasks.create(
              admin,
              wid,
              { ...input, eventId: ceremony.id },
              randomUUID(),
            ),
            { code: 'EVENT_UNAVAILABLE' },
          );
          await events.changeLifecycle(
            'RESTORE_EVENT',
            admin,
            wid,
            ceremony.id,
            {},
            randomUUID(),
            `"${removed.event.version}"`,
          );
          assert.equal(
            (await tasks.read(viewer, wid, item.id)).task.event.name,
            ceremony.name,
          );
          const cleared = await tasks.update(
            family,
            wid,
            item.id,
            { eventId: null },
            randomUUID(),
            '"1"',
          );
          assert.equal(cleared.task.event, null);
          assert.equal(await Event.countDocuments({ _id: ceremony.id }), 1);
        },
      );
      await t.test(
        'deadline clears safely, date-only mismatches reject, after-wedding dates warn without blocking',
        async () => {
          const item = (await tasks.create(admin, wid, input, randomUUID()))
            .task;
          await assert.rejects(
            tasks.update(
              admin,
              wid,
              item.id,
              { dueAt: null },
              randomUUID(),
              '"0"',
            ),
            { code: 'VALIDATION_ERROR' },
          );
          const cleared = await tasks.update(
            admin,
            wid,
            item.id,
            { dueAt: null, dueDateOnly: false },
            randomUUID(),
            '"0"',
          );
          assert.equal(cleared.task.dueAt, null);
          assert.equal(cleared.task.overdue, false);
          const after = await tasks.create(
            admin,
            wid,
            { title: 'After wedding', dueAt: '2028-02-21T10:00:00Z' },
            randomUUID(),
          );
          assert.equal(after.warnings[0].code, 'AFTER_WEDDING_DATE');
        },
      );
      await t.test(
        'pagination/counts are genuine, clamped and exclude soft-deleted and other-wedding tasks',
        async () => {
          for (let i = 0; i < 22; i++)
            await Task.create({
              title: `Page ${i}`,
              weddingId: wid,
              status: i === 0 ? 'COMPLETED' : 'TODO',
              priority: 'MEDIUM',
              createdBy: admin,
              updatedBy: admin,
              source: { type: 'MANUAL' },
            });
          await Task.create({
            title: 'Hidden',
            weddingId: wid,
            deletedAt: new Date(),
            createdBy: admin,
            updatedBy: admin,
            source: { type: 'MANUAL' },
          });
          await tasks.create(
            outsider,
            otherWid,
            { title: 'Other wedding task' },
            randomUUID(),
          );
          const a = await tasks.list(viewer, wid, { page: 1 }),
            b = await tasks.list(viewer, wid, { page: 2 });
          assert.equal(a.tasks.length, 20);
          assert.ok(!a.tasks.some((x) => b.tasks.some((y) => x.id === y.id)));
          assert.equal(
            a.meta.total,
            await Task.countDocuments({ weddingId: wid, deletedAt: null }),
          );
          assert.equal(
            a.meta.counts.completed,
            await Task.countDocuments({
              weddingId: wid,
              deletedAt: null,
              status: 'COMPLETED',
            }),
          );
          assert.equal(
            a.meta.counts.overdue,
            await Task.countDocuments({
              weddingId: wid,
              deletedAt: null,
              status: { $ne: 'COMPLETED' },
              dueAt: { $lt: instant, $ne: null },
            }),
          );
          const last = await tasks.list(admin, wid, { page: 10000 });
          assert.equal(last.meta.page, last.meta.totalPages);
        },
      );
      await t.test(
        'competing versioned edits produce one success and one conflict; expired receipts can be replaced',
        async () => {
          const item = (
            await tasks.create(
              admin,
              wid,
              { title: 'Competing task' },
              randomUUID(),
            )
          ).task;
          const results = await Promise.allSettled([
            tasks.update(
              admin,
              wid,
              item.id,
              { title: 'A' },
              randomUUID(),
              '"0"',
            ),
            tasks.update(
              family,
              wid,
              item.id,
              { title: 'B' },
              randomUUID(),
              '"0"',
            ),
          ]);
          assert.equal(
            results.filter((r) => r.status === 'fulfilled').length,
            1,
          );
          assert.equal(
            results.find((r) => r.status === 'rejected').reason.code,
            'VERSION_CONFLICT',
          );
          const key = randomUUID(),
            first = await tasks.create(
              admin,
              wid,
              { title: 'Expired receipt' },
              key,
            );
          await TaskWriteRequest.updateOne(
            { taskId: first.task.id },
            { $set: { expiresAt: new Date(0) } },
          );
          const second = await tasks.create(
            admin,
            wid,
            { title: 'After expiry' },
            key,
          );
          assert.notEqual(first.task.id, second.task.id);
        },
      );
      await t.test(
        'multiple assignees are deduplicated, Family can assign Viewer, and My Tasks/counts use the current actor only',
        async () => {
          const item = (
            await tasks.create(
              family,
              wid,
              {
                title: 'Shared assignments',
                assigneeIds: [viewer, admin, viewer],
              },
              randomUUID(),
            )
          ).task;
          assert.deepEqual(item.assigneeIds, [viewer, admin].sort());
          assert.equal(item.assignees.length, 2);
          assert.ok(
            item.assignees.every(
              (m) => m.available && m.name === 'Task Fixture',
            ),
          );
          const mine = await tasks.my(viewer, wid, { limit: 1, page: 1000 });
          assert.equal(mine.meta.myTotal, 1);
          assert.equal(mine.meta.total, 1);
          assert.ok(
            mine.tasks.every((task) => task.assigneeIds.includes(viewer)),
          );
          assert.ok(mine.meta.allTotal > mine.meta.total);
          assert.equal((await tasks.my(family, wid)).meta.total, 0);
          await assert.rejects(tasks.my(outsider, wid), {
            code: 'WEDDING_NOT_FOUND',
          });
          await assert.rejects(tasks.my(admin, wid, { userId: viewer }), {
            code: 'VALIDATION_ERROR',
          });
          const changed = (
            await tasks.update(
              family,
              wid,
              item.id,
              { assigneeIds: [family] },
              randomUUID(),
              '"0"',
            )
          ).task;
          assert.equal(changed.version, 1);
          assert.equal((await tasks.my(viewer, wid)).meta.total, 0);
          assert.equal((await tasks.my(family, wid)).meta.total, 1);
          await assert.rejects(
            tasks.update(
              admin,
              wid,
              item.id,
              { assigneeIds: [admin] },
              randomUUID(),
              '"0"',
            ),
            { code: 'VERSION_CONFLICT' },
          );
          await tasks.update(
            admin,
            wid,
            item.id,
            { assigneeIds: [] },
            randomUUID(),
            '"1"',
          );
          assert.equal((await tasks.my(family, wid)).meta.total, 0);
          assert.equal(await Activity.countDocuments({ entityId: item.id }), 3);
        },
      );
      await t.test(
        'foreign, nonexistent, disabled, unverified and removed members cannot be assigned; read results hide unavailable profiles',
        async () => {
          await assert.rejects(
            tasks.create(
              admin,
              wid,
              { title: 'Foreign assignee', assigneeIds: [outsider] },
              randomUUID(),
            ),
            { code: 'ASSIGNEE_UNAVAILABLE' },
          );
          await assert.rejects(
            tasks.create(
              admin,
              wid,
              {
                title: 'Missing assignee',
                assigneeIds: ['000000000000000000000000'],
              },
              randomUUID(),
            ),
            { code: 'ASSIGNEE_UNAVAILABLE' },
          );
          const item = (
            await tasks.create(
              admin,
              wid,
              { title: 'Membership lifecycle', assigneeIds: [family] },
              randomUUID(),
            )
          ).task;
          for (const mode of ['disabled', 'unverified', 'removed']) {
            if (mode === 'removed')
              await WeddingMember.updateOne(
                { weddingId: wid, userId: family },
                { $set: { status: 'REMOVED' } },
              );
            else
              await User.updateOne(
                { _id: family },
                {
                  $set:
                    mode === 'disabled'
                      ? { status: 'DISABLED' }
                      : { emailVerifiedAt: null },
                },
              );
            assert.ok(
              !(await tasks.assignees(admin, wid, { limit: 100 })).members.some(
                (m) => m.id === family,
              ),
            );
            const read = (await tasks.read(admin, wid, item.id)).task;
            assert.deepEqual(read.assignees, [
              { id: family, name: null, role: null, available: false },
            ]);
            await assert.rejects(
              tasks.update(
                admin,
                wid,
                item.id,
                { title: 'Retain invalid assignee' },
                randomUUID(),
                '"0"',
              ),
              (error) => {
                assert.equal(error.code, 'ASSIGNEE_UNAVAILABLE');
                assert.deepEqual(error.details.unavailableAssigneeIds, [
                  family,
                ]);
                return true;
              },
            );
            await User.updateOne(
              { _id: family },
              { $set: { status: 'ACTIVE', emailVerifiedAt: new Date() } },
            );
            await WeddingMember.updateOne(
              { weddingId: wid, userId: family },
              { $set: { status: 'ACTIVE' } },
            );
          }
          await WeddingMember.updateOne(
            { weddingId: wid, userId: family },
            { $set: { status: 'REMOVED' } },
          );
          const cleared = (
            await tasks.update(
              admin,
              wid,
              item.id,
              { assigneeIds: [] },
              randomUUID(),
              '"0"',
            )
          ).task;
          assert.deepEqual(cleared.assignees, []);
          await WeddingMember.updateOne(
            { weddingId: wid, userId: family },
            { $set: { status: 'ACTIVE' } },
          );
          assert.equal(
            await Task.countDocuments({ title: 'Foreign assignee' }),
            0,
          );
        },
      );
      await t.test(
        'assignment retries and transactional rollback do not duplicate history or reapply superseded assignees',
        async () => {
          const key = randomUUID(),
            body = { title: 'Assigned retry', assigneeIds: [family, admin] };
          const a = await tasks.create(admin, wid, body, key);
          const b = await tasks.create(
            admin,
            wid,
            { ...body, assigneeIds: [admin, family, family] },
            key,
          );
          assert.equal(a.task.id, b.task.id);
          assert.equal(b.replayed, true);
          await tasks.update(
            family,
            wid,
            a.task.id,
            { assigneeIds: [viewer] },
            randomUUID(),
            '"0"',
          );
          const again = await tasks.create(admin, wid, body, key);
          assert.deepEqual(again.task.assigneeIds, [viewer]);
          assert.equal(
            await Activity.countDocuments({ entityId: a.task.id }),
            2,
          );
          const original = Activity.create;
          Activity.create = async () => {
            throw new Error('Assignment audit failure');
          };
          try {
            await assert.rejects(
              tasks.update(
                admin,
                wid,
                a.task.id,
                { assigneeIds: [family] },
                randomUUID(),
                '"1"',
              ),
              /Assignment audit failure/,
            );
          } finally {
            Activity.create = original;
          }
          assert.deepEqual(
            (await tasks.read(admin, wid, a.task.id)).task.assigneeIds,
            [viewer],
          );
        },
      );
      await t.test(
        'member picker paginates without profile/email leakage and My Tasks paginates only matching active tasks',
        async () => {
          const one = await tasks.assignees(viewer, wid, { limit: 1, page: 1 });
          const two = await tasks.assignees(viewer, wid, { limit: 1, page: 2 });
          assert.equal(one.meta.total, 3);
          assert.equal(one.members.length, 1);
          assert.notEqual(one.members[0].id, two.members[0].id);
          assert.deepEqual(Object.keys(one.members[0]).sort(), [
            'available',
            'id',
            'name',
            'role',
          ]);
          await assert.rejects(tasks.assignees(outsider, wid), {
            code: 'WEDDING_NOT_FOUND',
          });
          for (let i = 0; i < 3; i++)
            await tasks.create(
              admin,
              wid,
              { title: 'Mine page ' + i, assigneeIds: [viewer] },
              randomUUID(),
            );
          await Task.create({
            title: 'Hidden assigned',
            weddingId: wid,
            assigneeIds: [viewer],
            deletedAt: new Date(),
            createdBy: admin,
            updatedBy: admin,
            source: { type: 'MANUAL' },
          });
          const a = await tasks.my(viewer, wid, { limit: 2 }),
            b = await tasks.my(viewer, wid, { limit: 2, page: 2 });
          assert.equal(a.tasks.length, 2);
          assert.equal(a.meta.total, 4);
          assert.equal(a.meta.counts.total, 4);
          assert.equal(b.tasks.length, 2);
          assert.ok(
            a.tasks.every(
              (task) => !b.tasks.some((other) => other.id === task.id),
            ),
          );
          assert.ok(
            !a.tasks
              .concat(b.tasks)
              .some((task) => task.title === 'Hidden assigned'),
          );
        },
      );
      await t.test(
        'a concurrent membership removal forces assignment validation to retry rather than commit an invalid assignee',
        async () => {
          const member = await WeddingMember.findOne({
            weddingId: wid,
            userId: family,
          }).lean();
          const original = WeddingMember.updateOne;
          let injected = false;
          WeddingMember.updateOne = function (filter, update, options) {
            if (!injected && String(filter._id) === String(member._id)) {
              injected = true;
              return (async () => {
                await original.call(
                  this,
                  { _id: member._id },
                  { $set: { status: 'REMOVED' } },
                );
                return original.call(this, filter, update, options);
              })();
            }
            return original.call(this, filter, update, options);
          };
          try {
            await assert.rejects(
              tasks.create(
                admin,
                wid,
                {
                  title: 'Concurrent invalid assignment',
                  assigneeIds: [family],
                },
                randomUUID(),
              ),
              { code: 'ASSIGNEE_UNAVAILABLE' },
            );
          } finally {
            WeddingMember.updateOne = original;
            await WeddingMember.updateOne(
              { _id: member._id },
              { $set: { status: 'ACTIVE' } },
            );
          }
          assert.equal(injected, true);
          assert.equal(
            await Task.countDocuments({
              title: 'Concurrent invalid assignment',
            }),
            0,
          );
        },
      );
      let filterEvent, filterRows;
      await t.test(
        'task search is literal across title/notes and India date bounds include exactly the requested day',
        async () => {
          filterEvent = (
            await events.create(
              admin,
              wid,
              {
                name: 'Filter Ceremony',
                type: 'CUSTOM',
                startAt: '2028-02-20T03:00:00Z',
                endAt: '2028-02-20T04:00:00Z',
              },
              randomUUID(),
            )
          ).event.id;
          const row = (title, dueAt, extra = {}) => ({
            weddingId: wid,
            title: 'FilterCase ' + title,
            description: 'ordinary notes',
            status: 'TODO',
            priority: 'HIGH',
            eventId: filterEvent,
            assigneeIds: [family, viewer],
            dueAt,
            createdBy: admin,
            updatedBy: admin,
            source: { type: 'MANUAL' },
            ...extra,
          });
          filterRows = await Task.create([
            row('Lower', '2027-01-01T18:30:00.000Z'),
            row('Last millisecond', '2027-01-02T18:29:59.999Z', {
              dueDateOnly: true,
            }),
            row('Before lower', '2027-01-01T18:29:59.999Z'),
            row('After upper', '2027-01-02T18:30:00.000Z'),
            row('Completed', '2027-01-02T03:00:00.000Z', {
              status: 'COMPLETED',
            }),
            row('No deadline', null, { assigneeIds: [], eventId: null }),
            row('Notes match', '2027-01-02T04:00:00.000Z', {
              description: 'literal [ritual].* and FLOWERS',
              priority: 'LOW',
              assigneeIds: [family],
              eventId: null,
            }),
            row('At current instant', instant, { status: 'IN_PROGRESS' }),
            row('Deleted', '2027-01-02T01:00:00.000Z', {
              deletedAt: new Date(),
            }),
          ]);
          const range = await tasks.list(viewer, wid, {
            q: 'filtercase',
            from: '2027-01-02',
            to: '2027-01-02',
            limit: 100,
          });
          assert.deepEqual(
            new Set(range.tasks.map((x) => x.title)),
            new Set(
              [
                'Lower',
                'Last millisecond',
                'Completed',
                'Notes match',
                'At current instant',
              ].map((x) => 'FilterCase ' + x),
            ),
          );
          assert.equal(
            (await tasks.list(admin, wid, { q: '[ritual].*' })).meta.total,
            1,
          );
          assert.equal(
            (await tasks.list(admin, wid, { q: 'flowers' })).tasks[0].title,
            'FilterCase Notes match',
          );
          assert.equal(
            (
              await tasks.list(admin, wid, {
                q: 'FilterCase',
                from: '2027-01-03',
              })
            ).meta.total,
            1,
          );
          assert.equal(
            (
              await tasks.list(admin, wid, {
                q: 'FilterCase',
                to: '2027-01-01',
              })
            ).meta.total,
            1,
          );
          assert.equal(
            (await tasks.list(admin, wid, { q: '.*' })).meta.total,
            1,
          );
          assert.equal(
            (
              await tasks.list(admin, wid, {
                q: 'FilterCase',
                from: '9999-12-31',
                to: '9999-12-31',
              })
            ).meta.total,
            0,
          );
        },
      );
      await t.test(
        'all task filters intersect before scoped counts/pagination and never override My Tasks or tenant conditions',
        async () => {
          const query = {
            q: 'FilterCase',
            status: 'TODO',
            priority: 'HIGH',
            assigneeId: family,
            eventId: filterEvent,
            from: '2027-01-02',
            to: '2027-01-02',
            overdue: 'true',
            limit: 1,
          };
          const result = await tasks.my(viewer, wid, query);
          assert.equal(result.meta.total, 1);
          assert.equal(result.tasks[0].title, 'FilterCase Lower');
          assert.deepEqual(result.meta.counts, {
            total: 1,
            completed: 0,
            inProgress: 0,
            overdue: 1,
          });
          assert.equal(result.meta.allTotal, 1);
          assert.equal(result.meta.myTotal, 1);
          assert.equal((await tasks.my(admin, wid, query)).meta.total, 0);
          assert.equal(
            (
              await tasks.my(viewer, wid, {
                q: 'FilterCase',
                assigneeId: 'unassigned',
              })
            ).meta.total,
            0,
          );
          assert.equal(
            (
              await tasks.list(viewer, wid, {
                q: 'FilterCase',
                assigneeId: 'unassigned',
              })
            ).tasks[0].title,
            'FilterCase No deadline',
          );
          assert.equal(
            (
              await tasks.list(viewer, wid, {
                q: 'FilterCase',
                eventId: 'none',
              })
            ).meta.total,
            2,
          );
          assert.equal(
            (
              await tasks.list(viewer, wid, {
                q: 'FilterCase',
                status: 'COMPLETED',
                overdue: 'true',
              })
            ).meta.total,
            0,
          );
          assert.equal(
            (
              await tasks.list(viewer, wid, {
                q: 'FilterCase',
                priority: 'LOW',
              })
            ).meta.total,
            1,
          );
          assert.equal(
            (
              await tasks.list(viewer, wid, {
                q: 'FilterCase',
                overdue: 'true',
              })
            ).meta.total,
            3,
          );
          assert.equal(
            (
              await tasks.list(viewer, wid, {
                q: 'FilterCase',
                overdue: 'false',
              })
            ).meta.total,
            5,
          );
          assert.equal(
            (
              await tasks.list(admin, wid, {
                q: 'FilterCase',
                assigneeId: outsider,
              })
            ).meta.total,
            0,
          );
          assert.equal(
            (
              await tasks.list(outsider, otherWid, {
                q: 'FilterCase',
                eventId: filterEvent,
              })
            ).meta.total,
            0,
          );
          await assert.rejects(tasks.list(outsider, wid, query), {
            code: 'WEDDING_NOT_FOUND',
          });
        },
      );
      await t.test(
        'filtered pagination has stable ties, bounded empty pages, and updates counts after a matching task is edited',
        async () => {
          const firstPage = await tasks.list(family, wid, {
            q: 'FilterCase',
            limit: 2,
            page: 1,
          });
          const secondPage = await tasks.list(family, wid, {
            q: 'FilterCase',
            limit: 2,
            page: 2,
          });
          assert.equal(firstPage.tasks.length, 2);
          assert.equal(secondPage.tasks.length, 2);
          assert.ok(
            firstPage.tasks.every(
              (x) => !secondPage.tasks.some((y) => x.id === y.id),
            ),
          );
          assert.equal(firstPage.meta.total, 8);
          assert.deepEqual(
            (
              await tasks.list(family, wid, {
                q: 'FilterCase',
                limit: 2,
                page: 1,
              })
            ).tasks.map((x) => x.id),
            firstPage.tasks.map((x) => x.id),
          );
          const tail = await tasks.list(family, wid, {
            q: 'FilterCase',
            page: 999,
            limit: 2,
          });
          assert.equal(tail.meta.page, 4);
          const empty = await tasks.list(family, wid, {
            q: 'not a matching task',
            page: 999,
          });
          assert.equal(empty.meta.page, 1);
          assert.equal(empty.meta.totalPages, 0);
          const matched = (
            await tasks.list(family, wid, {
              q: 'FilterCase Lower',
              status: 'TODO',
            })
          ).tasks[0];
          await tasks.update(
            family,
            wid,
            matched.id,
            { status: 'COMPLETED' },
            randomUUID(),
            `"${matched.version}"`,
          );
          assert.equal(
            (
              await tasks.list(family, wid, {
                q: 'FilterCase Lower',
                status: 'TODO',
              })
            ).meta.total,
            0,
          );
          assert.equal(
            (
              await tasks.list(family, wid, {
                q: 'FilterCase Lower',
                status: 'COMPLETED',
              })
            ).meta.total,
            1,
          );
          // Read-only filtering must not mutate audit history or task revisions.
          assert.equal(
            await Activity.countDocuments({ entityId: filterRows[0]._id }),
            1,
          );
        },
      );
      await t.test(
        'ceremony task counts and filtered previews include completed tasks but exclude removed, retired and foreign rows',
        async () => {
          const ceremony = (
            await events.create(
              admin,
              wid,
              {
                name: 'Linked task integration ceremony',
                type: 'RECEPTION',
                startAt: '2028-02-21T10:00:00Z',
                endAt: '2028-02-21T12:00:00Z',
              },
              randomUUID(),
            )
          ).event;
          const saved = [];
          for (const [title, status] of [
            ['Visible todo', 'TODO'],
            ['Visible completed', 'COMPLETED'],
            ['Removed copy', 'TODO'],
            ['Retired copy', 'TODO'],
          ]) {
            saved.push(
              (
                await tasks.create(
                  family,
                  wid,
                  { title, status, eventId: ceremony.id },
                  randomUUID(),
                )
              ).task,
            );
          }
          await tasks.remove(
            family,
            wid,
            saved[2].id,
            {},
            randomUUID(),
            `"${saved[2].version}"`,
          );
          await Task.updateOne(
            { _id: saved[3].id },
            { $set: { recurrenceExcluded: true } },
          );
          const foreign = (
            await tasks.create(
              outsider,
              otherWid,
              { title: 'Foreign fixture' },
              randomUUID(),
            )
          ).task;
          // Deliberately malformed fixture verifies the aggregate's tenant predicate.
          await Task.updateOne(
            { _id: foreign.id },
            { $set: { eventId: ceremony.id } },
          );
          const preview = await tasks.list(viewer, wid, {
            eventId: ceremony.id,
            limit: 3,
          });
          assert.equal(preview.meta.total, 2);
          assert.deepEqual(
            preview.tasks.map((row) => row.id).sort(),
            saved
              .slice(0, 2)
              .map((row) => row.id)
              .sort(),
          );
          const list = await events.list(viewer, wid, {
            q: 'Linked task integration ceremony',
          });
          assert.equal(list.events[0].taskCount, 2);
          assert.equal(list.events[0].activityCount, 0);
          await tasks.update(
            family,
            wid,
            saved[0].id,
            { eventId: null },
            randomUUID(),
            `"${saved[0].version}"`,
          );
          assert.equal(
            (
              await events.list(admin, wid, {
                q: 'Linked task integration ceremony',
              })
            ).events[0].taskCount,
            1,
          );
          assert.equal(
            (await tasks.list(viewer, wid, { eventId: ceremony.id })).meta
              .total,
            1,
          );
          await assert.rejects(events.read(outsider, otherWid, ceremony.id), {
            code: 'EVENT_NOT_FOUND',
          });
        },
      );
      await t.test(
        'current member/account/wedding removal takes effect on reads and matching retries',
        async () => {
          const key = randomUUID();
          await tasks.create(family, wid, { title: 'Membership retry' }, key);
          await WeddingMember.updateOne(
            { weddingId: wid, userId: family },
            { $set: { status: 'REMOVED' } },
          );
          await assert.rejects(
            tasks.create(family, wid, { title: 'Membership retry' }, key),
            { code: 'WEDDING_NOT_FOUND' },
          );
          await User.updateOne(
            { _id: viewer },
            { $set: { status: 'DISABLED' } },
          );
          await assert.rejects(tasks.list(viewer, wid), {
            code: 'SESSION_EXPIRED',
          });
          await Wedding.updateOne(
            { _id: wid },
            { $set: { deletedAt: new Date() } },
          );
          await assert.rejects(tasks.read(admin, wid, first.id), {
            code: 'WEDDING_NOT_FOUND',
          });
        },
      );
    } finally {
      await connection.dropDatabase();
      await database.close();
    }
  },
);
