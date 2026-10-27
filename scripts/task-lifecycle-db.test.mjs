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
  'Atlas task lifecycle: recoverable deletion, original-creator permissions and repeat safety',
  { skip: !config.mongodbUri && 'Set private MONGODB_URI for Atlas checks.' },
  async (t) => {
    const settings = {
      ...config,
      mongodbDbName: 'mmm_task_lifecycle_' + randomBytes(8).toString('hex'),
      jwtSecret: randomBytes(48).toString('base64url'),
    };
    const database = createAuthDatabase(settings);
    const connection = await database.connect();
    const { User } = authModels(connection),
      { Wedding, WeddingMember } = weddingModels(connection),
      { Task, TaskSeries, TaskWriteRequest } = taskModels(connection),
      { Activity, Event } = eventModels(connection);
    const auth = createAuthService({
        database,
        settings,
        sendVerification: async () => {},
      }),
      weddings = createWeddingService({ database }),
      events = createEventService({ database });
    let instant = new Date('2027-01-01T06:00:00Z');
    const tasks = createTaskService({ database, now: () => instant });
    const ids = [];
    const weddingInput = {
      name: 'Lifecycle fixture',
      brideName: 'Anya',
      groomName: 'Kabir',
      mainDate: '2028-02-20',
      tradition: 'ODIA',
      location: { city: 'Cuttack', state: 'Odisha', countryCode: 'IN' },
    };
    let admin, family, second, viewer, outsider, wid, other;
    const version = (task) => `"${task.version}"`;
    const create = async (user = family, body = {}) =>
      (
        await tasks.create(
          user,
          wid,
          { title: 'Lifecycle task', ...body },
          randomUUID(),
        )
      ).task;
    const remove = (user, task, key = randomUUID()) =>
      tasks.remove(user, wid, task.id, {}, key, version(task));
    const restore = (user, task, key = randomUUID()) =>
      tasks.restore(user, wid, task.id, {}, key, version(task));
    try {
      for (let i = 0; i < 5; i++) {
        await auth.register({
          name: 'Lifecycle fixture ' + i,
          email: `lifecycle-${i}@example.com`,
          password: 'Wedding123',
        });
        const u = await User.findOneAndUpdate(
          { emailNormalized: `lifecycle-${i}@example.com` },
          { $set: { emailVerifiedAt: new Date() } },
          { returnDocument: 'after' },
        );
        ids.push(String(u._id));
      }
      [admin, family, second, viewer, outsider] = ids;
      wid = (await weddings.create(admin, weddingInput, randomUUID())).wedding
        .id;
      other = (await weddings.create(outsider, weddingInput, randomUUID()))
        .wedding.id;
      for (const [userId, role] of [
        [family, 'FAMILY_MEMBER'],
        [second, 'FAMILY_MEMBER'],
        [viewer, 'VIEWER'],
      ])
        await WeddingMember.create({
          weddingId: wid,
          userId,
          role,
          status: 'ACTIVE',
          joinedAt: instant,
          createdBy: admin,
        });
      await t.test(
        'Family deletes shared tasks; normal reads/counts hide them and history/data survive',
        async () => {
          const task = await create(admin, {
            title: 'Completed task with notes',
            description: 'Keep these notes',
            status: 'COMPLETED',
            priority: 'URGENT',
            assigneeIds: [family],
            dueAt: '2026-12-31T18:29:59.999Z',
            dueDateOnly: true,
          });
          const before = (await tasks.my(family, wid)).meta.total;
          const removed = (await remove(family, task)).task;
          for (const field of [
            'id',
            'title',
            'description',
            'status',
            'priority',
            'dueAt',
            'dueDateOnly',
            'createdBy',
            'completedAt',
            'completedBy',
          ])
            assert.deepEqual(removed[field], task[field]);
          assert.equal(removed.deletedAt, instant.toISOString());
          assert.equal(removed.deletedBy, family);
          assert.equal(removed.version, task.version + 1);
          assert.equal((await tasks.my(family, wid)).meta.total, before - 1);
          await assert.rejects(tasks.read(admin, wid, task.id), {
            code: 'TASK_NOT_FOUND',
          });
          assert.equal(
            await Activity.countDocuments({
              entityId: task.id,
              action: 'TASK_DELETED',
            }),
            1,
          );
          assert.equal(
            (await tasks.listDeleted(admin, wid)).tasks[0].id,
            task.id,
          );
          assert.equal((await tasks.listDeleted(family, wid)).meta.total, 0);
          await assert.rejects(tasks.readDeleted(family, wid, task.id), {
            code: 'TASK_NOT_FOUND',
          });
          await assert.rejects(restore(family, removed), {
            code: 'TASK_NOT_FOUND',
          });
          const restored = (await restore(admin, removed)).task;
          assert.equal(restored.deletedAt, null);
          assert.equal(restored.completedAt, task.completedAt);
          assert.deepEqual(restored.assigneeIds, task.assigneeIds);
        },
      );
      await t.test(
        'Family restores only tasks originally created by them, including deletion by someone else',
        async () => {
          const own = await create(family),
            removed = (await remove(second, own)).task;
          assert.equal(
            (await tasks.readDeleted(family, wid, own.id)).task.id,
            own.id,
          );
          assert.equal((await tasks.listDeleted(second, wid)).meta.total, 0);
          await assert.rejects(restore(second, removed), {
            code: 'TASK_NOT_FOUND',
          });
          assert.equal((await restore(family, removed)).task.deletedAt, null);
        },
      );
      await t.test(
        'Viewers, other weddings and forged lifecycle input are denied before disclosure or mutation',
        async () => {
          const task = await create(),
            removed = (await remove(admin, task)).task;
          await assert.rejects(remove(viewer, task), { code: 'FORBIDDEN' });
          await assert.rejects(restore(viewer, removed), { code: 'FORBIDDEN' });
          await assert.rejects(tasks.listDeleted(viewer, wid), {
            code: 'FORBIDDEN',
          });
          await assert.rejects(tasks.readDeleted(viewer, wid, task.id), {
            code: 'FORBIDDEN',
          });
          await assert.rejects(tasks.listDeleted(outsider, wid), {
            code: 'WEDDING_NOT_FOUND',
          });
          await assert.rejects(
            tasks.restore(
              outsider,
              other,
              task.id,
              {},
              randomUUID(),
              version(removed),
            ),
            { code: 'TASK_NOT_FOUND' },
          );
          await assert.rejects(
            tasks.remove(
              family,
              wid,
              task.id,
              { deletedBy: admin },
              randomUUID(),
              version(removed),
            ),
            { code: 'VALIDATION_ERROR' },
          );
          for (const raw of [[], null, { title: 'Overwrite' }])
            await assert.rejects(
              tasks.restore(
                admin,
                wid,
                task.id,
                raw,
                randomUUID(),
                version(removed),
              ),
              { code: 'VALIDATION_ERROR' },
            );
          await assert.rejects(
            tasks.listDeleted(family, wid, { createdBy: admin }),
            { code: 'VALIDATION_ERROR' },
          );
          await assert.rejects(
            tasks.remove(admin, wid, task.id, {}, '', version(task)),
            { code: 'IDEMPOTENCY_KEY_REQUIRED' },
          );
          await assert.rejects(
            tasks.restore(admin, wid, task.id, {}, randomUUID(), ''),
            { code: 'VERSION_REQUIRED' },
          );
          await assert.rejects(restore(admin, task), {
            code: 'VERSION_CONFLICT',
          });
        },
      );
      await t.test(
        'concurrent exact retries write once; replay reports current state after an intervening action',
        async () => {
          const task = await create(),
            key = randomUUID();
          const replies = await Promise.all([
            remove(family, task, key),
            remove(family, task, key),
          ]);
          assert.deepEqual(replies.map((r) => r.replayed).sort(), [
            false,
            true,
          ]);
          assert.equal(
            await Activity.countDocuments({
              entityId: task.id,
              action: 'TASK_DELETED',
            }),
            1,
          );
          const deleted = replies[0].task,
            restoreKey = randomUUID();
          const restored = await restore(family, deleted, restoreKey);
          const lateDelete = await remove(family, task, key);
          assert.equal(lateDelete.replayed, true);
          assert.equal(lateDelete.task.deletedAt, null);
          const again = await remove(family, restored.task);
          const lateRestore = await restore(family, deleted, restoreKey);
          assert.equal(lateRestore.replayed, true);
          assert.ok(lateRestore.task.deletedAt);
          await assert.rejects(
            tasks.restore(family, wid, task.id, {}, key, version(again.task)),
            { code: 'IDEMPOTENCY_CONFLICT' },
          );
        },
      );
      await t.test(
        'concurrent edits/deletes and separate delete requests conflict instead of overwriting',
        async () => {
          const task = await create();
          const outcomes = await Promise.allSettled([
            remove(family, task),
            tasks.update(
              second,
              wid,
              task.id,
              { title: 'Concurrent update' },
              randomUUID(),
              version(task),
            ),
          ]);
          assert.equal(
            outcomes.filter((o) => o.status === 'fulfilled').length,
            1,
          );
          assert.ok(
            ['VERSION_CONFLICT', 'TASK_NOT_FOUND'].includes(
              outcomes.find((o) => o.status === 'rejected').reason.code,
            ),
          );
          const another = await create();
          const deletes = await Promise.allSettled([
            remove(family, another),
            remove(second, another),
          ]);
          assert.equal(
            deletes.filter((o) => o.status === 'fulfilled').length,
            1,
          );
          assert.equal(
            deletes.find((o) => o.status === 'rejected').reason.code,
            'VERSION_CONFLICT',
          );
        },
      );
      await t.test(
        'audit errors roll back both deletion/restoration and their receipts',
        async () => {
          const task = await create(),
            key = randomUUID(),
            original = Activity.create;
          Activity.create = async () => {
            throw new Error('Injected lifecycle history failure');
          };
          try {
            await assert.rejects(
              remove(family, task, key),
              /Injected lifecycle/,
            );
          } finally {
            Activity.create = original;
          }
          assert.equal(
            (await tasks.read(family, wid, task.id)).task.version,
            task.version,
          );
          const removed = (await remove(family, task, key)).task,
            restoreKey = randomUUID();
          const count = await TaskWriteRequest.countDocuments();
          Activity.create = async () => {
            throw new Error('Injected lifecycle history failure');
          };
          try {
            await assert.rejects(
              restore(family, removed, restoreKey),
              /Injected lifecycle/,
            );
          } finally {
            Activity.create = original;
          }
          assert.equal(await TaskWriteRequest.countDocuments(), count);
          assert.equal(
            (await tasks.readDeleted(family, wid, task.id)).task.version,
            removed.version,
          );
          assert.equal(
            (await restore(family, removed, restoreKey)).task.deletedAt,
            null,
          );
        },
      );
      await t.test(
        'restoration retains unavailable assignee/event references without leaking stale names',
        async () => {
          const ceremony = (
            await events.create(
              admin,
              wid,
              {
                name: 'Linked ceremony',
                type: 'CUSTOM',
                status: 'PLANNED',
                startAt: '2027-01-02T04:30:00Z',
                endAt: '2027-01-02T05:30:00Z',
              },
              randomUUID(),
            )
          ).event;
          const task = await create(family, {
              assigneeIds: [second],
              eventId: ceremony.id,
              description: 'Retained association',
            }),
            removed = (await remove(admin, task)).task;
          await Event.updateOne(
            { _id: ceremony.id },
            { $set: { deletedAt: instant } },
          );
          await WeddingMember.updateOne(
            { weddingId: wid, userId: second },
            { $set: { status: 'REMOVED' } },
          );
          const restored = (await restore(family, removed)).task;
          assert.equal(restored.description, task.description);
          assert.equal(restored.eventId, ceremony.id);
          assert.equal(restored.event.available, false);
          assert.equal(restored.event.name, null);
          assert.deepEqual(restored.assigneeIds, [second]);
          assert.equal(restored.assignees[0].available, false);
          assert.equal(restored.assignees[0].name, null);
          await WeddingMember.updateOne(
            { weddingId: wid, userId: second },
            { $set: { status: 'ACTIVE' } },
          );
        },
      );
      await t.test(
        'deleted recurring copies never regenerate; explicit restore preserves the copy without restarting a stopped pattern',
        async () => {
          const first = await create(family, {
            title: 'Daily ritual preparation',
            recurrence: {
              frequency: 'DAILY',
              interval: 1,
              startDate: '2027-01-02',
              endDate: '2027-01-05',
              time: null,
            },
          });
          const removed = (await remove(second, first)).task;
          await TaskSeries.updateOne(
            { _id: first.seriesId },
            { $set: { nextGenerationDate: first.occurrenceDate } },
          );
          await tasks.pumpRecurrence();
          assert.ok((await Task.findById(first.id)).deletedAt);
          assert.equal(
            await Task.countDocuments({
              seriesId: first.seriesId,
              occurrenceDate: first.occurrenceDate,
            }),
            1,
          );
          const original = await tasks.readSeries(
            admin,
            wid,
            (
              await Task.findOne({ seriesId: first.seriesId, deletedAt: null })
            )._id.toString(),
          );
          const input = {
            recurrence: {
              ...original.series.recurrence,
              startDate: '2027-01-03',
            },
            active: false,
            template: {
              title: 'Changed future title',
              description: '',
              priority: 'MEDIUM',
              assigneeIds: [],
              eventId: null,
            },
          };
          await tasks
            .updateSeries(
              admin,
              wid,
              first.id,
              input,
              randomUUID(),
              `"${original.series.version}"`,
            )
            .catch((error) => {
              assert.equal(error.code, 'SERIES_NOT_FOUND');
            });
          const survivor = await Task.findOne({
            seriesId: first.seriesId,
            deletedAt: null,
          }).lean();
          await tasks.updateSeries(
            admin,
            wid,
            String(survivor._id),
            input,
            randomUUID(),
            `"${original.series.version}"`,
          );
          await tasks.pumpRecurrence();
          assert.equal(
            await Task.countDocuments({
              seriesId: first.seriesId,
              occurrenceDate: first.occurrenceDate,
            }),
            1,
          );
          assert.ok((await Task.findById(first.id)).deletedAt);
          const restored = (await restore(family, removed)).task;
          assert.equal(restored.title, first.title);
          assert.equal(restored.dueAt, first.dueAt);
          assert.equal(restored.occurrenceEdited, true);
          assert.equal(restored.repeat.active, false);
          assert.equal(
            (await TaskSeries.findById(first.seriesId)).active,
            false,
          );
        },
      );
      await t.test(
        'recovery pagination is creator-scoped, clamps empty last pages and excludes pattern-retired dates',
        async () => {
          const a = await create(second),
            b = await create(second);
          await remove(admin, a);
          await remove(admin, b);
          const own = await tasks.listDeleted(second, wid, {
            page: 999,
            limit: 1,
          });
          assert.ok(own.meta.page <= own.meta.totalPages);
          assert.ok(own.tasks.every((row) => row.createdBy === second));
          const last = own.tasks[0];
          await restore(second, last);
          const clamped = await tasks.listDeleted(second, wid, {
            page: own.meta.page,
            limit: 1,
          });
          assert.equal(clamped.meta.total, own.meta.total - 1);
          assert.ok(clamped.meta.page <= Math.max(1, clamped.meta.totalPages));
          const retired = await create();
          await Task.updateOne(
            { _id: retired.id },
            { $set: { recurrenceExcluded: true } },
          );
          await assert.rejects(remove(admin, retired), {
            code: 'TASK_NOT_FOUND',
          });
          await assert.rejects(tasks.readDeleted(admin, wid, retired.id), {
            code: 'TASK_NOT_FOUND',
          });
          assert.ok(
            !(await tasks.listDeleted(admin, wid)).tasks.some(
              (row) => row.id === retired.id,
            ),
          );
        },
      );
      await t.test(
        'current permissions and account/wedding state are rechecked even for exact retries',
        async () => {
          const task = await create(),
            key = randomUUID(),
            deleted = (await remove(family, task, key)).task;
          await WeddingMember.updateOne(
            { weddingId: wid, userId: family },
            { $set: { role: 'VIEWER' } },
          );
          await assert.rejects(remove(family, task, key), {
            code: 'FORBIDDEN',
          });
          await assert.rejects(restore(family, deleted), { code: 'FORBIDDEN' });
          await assert.rejects(tasks.listDeleted(family, wid), {
            code: 'FORBIDDEN',
          });
          await WeddingMember.updateOne(
            { weddingId: wid, userId: family },
            { $set: { role: 'FAMILY_MEMBER', status: 'REMOVED' } },
          );
          await assert.rejects(restore(family, deleted), {
            code: 'WEDDING_NOT_FOUND',
          });
          await User.updateOne(
            { _id: second },
            { $set: { status: 'DISABLED' } },
          );
          await assert.rejects(tasks.listDeleted(second, wid), {
            code: 'SESSION_EXPIRED',
          });
          await Wedding.updateOne(
            { _id: wid },
            { $set: { deletedAt: instant } },
          );
          await assert.rejects(tasks.listDeleted(admin, wid), {
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
