import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { config } from '../apps/api/src/config.js';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { createAuthService } from '../apps/api/src/auth/service.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';
import { weddingModels } from '../apps/api/src/weddings/models.js';
import { eventModels } from '../apps/api/src/events/models.js';
import { createTaskService } from '../apps/api/src/tasks/service.js';
import { taskModels } from '../apps/api/src/tasks/models.js';

test(
  'Atlas recurrence: bounded generation, future editing, protected copies, roles, retries and automatic extension',
  { skip: !config.mongodbUri && 'Set private MONGODB_URI for Atlas checks.' },
  async (t) => {
    const settings = {
      ...config,
      mongodbDbName: 'mmm_recurrence_test_' + randomBytes(8).toString('hex'),
      jwtSecret: randomBytes(48).toString('base64url'),
    };
    const database = createAuthDatabase(settings),
      weddings = createWeddingService({ database });
    let instant = new Date('2027-01-30T06:00:00Z');
    const tasks = createTaskService({ database, now: () => instant });
    const auth = createAuthService({
      database,
      settings,
      sendVerification: async () => {},
    });
    const connection = await database.connect(),
      { User } = authModels(connection),
      { Wedding, WeddingMember } = weddingModels(connection),
      { Task, TaskSeries, TaskWriteRequest } = taskModels(connection),
      { Activity } = eventModels(connection);
    const ids = [];
    let wid, otherWid, monthly, editable;
    const rule = {
      frequency: 'MONTHLY',
      interval: 1,
      startDate: '2027-01-31',
      endDate: '2027-07-31',
      time: '10:00',
    };
    const body = {
      title: 'Review wedding plans',
      priority: 'HIGH',
      recurrence: rule,
    };
    function edit(data, changes = {}) {
      const s = data.series;
      return {
        active: s.active,
        recurrence: s.recurrence,
        template: {
          title: s.template.title,
          description: s.template.description,
          priority: s.template.priority,
          assigneeIds: s.template.assigneeIds,
          eventId: s.template.eventId,
        },
        ...changes,
      };
    }
    const weddingInput = {
      name: 'Recurrence fixture',
      brideName: 'Anya',
      groomName: 'Kabir',
      mainDate: '2028-02-20',
      tradition: 'ODIA',
      location: { city: 'Cuttack', state: 'Odisha', countryCode: 'IN' },
    };
    try {
      for (let i = 0; i < 4; i++) {
        await auth.register({
          name: 'Repeat fixture ' + i,
          email: `repeat-${i}@example.com`,
          password: 'Wedding123',
        });
        const u = await User.findOneAndUpdate(
          { emailNormalized: `repeat-${i}@example.com` },
          { $set: { emailVerifiedAt: new Date() } },
          { returnDocument: 'after' },
        );
        ids.push(String(u._id));
      }
      const [admin, family, viewer, outsider] = ids;
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
        'monthly creation clamps dates independently, stores separate tasks/history and stops at a bounded horizon',
        async () => {
          const result = await tasks.create(
            family,
            wid,
            { ...body, assigneeIds: [family, viewer] },
            randomUUID(),
          );
          monthly = result.task;
          assert.equal(monthly.source.type, 'RECURRENCE');
          assert.equal(monthly.occurrenceDate, '2027-01-31');
          assert.equal(monthly.repeat.interval, 1);
          const copies = await Task.find({ seriesId: monthly.seriesId })
            .sort({ occurrenceDate: 1 })
            .lean();
          assert.deepEqual(
            copies.map((row) => row.occurrenceDate),
            ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'],
          );
          assert.ok(
            copies.every(
              (row) =>
                row.status === 'TODO' &&
                row.completedAt === null &&
                !row.occurrenceEdited,
            ),
          );
          assert.equal(
            (await TaskSeries.findById(monthly.seriesId).lean())
              .nextGenerationDate,
            '2027-05-31',
          );
          assert.equal(
            await Activity.countDocuments({
              entityId: { $in: copies.map((row) => row._id) },
            }),
            4,
          );
          assert.equal(
            (await tasks.my(viewer, wid, { recurring: 'true' })).meta.total,
            4,
          );
        },
      );
      await t.test(
        'daily/weekly copies have independent completion and task retries do not repeat series creation',
        async () => {
          const key = randomUUID(),
            input = {
              title: 'Weekly check',
              recurrence: {
                frequency: 'WEEKLY',
                interval: 2,
                startDate: '2027-02-01',
                endDate: '2027-03-01',
                time: null,
              },
            };
          const results = await Promise.all([
            tasks.create(admin, wid, input, key),
            tasks.create(admin, wid, input, key),
          ]);
          assert.equal(results[0].task.seriesId, results[1].task.seriesId);
          const copies = await Task.find({ seriesId: results[0].task.seriesId })
            .sort({ occurrenceDate: 1 })
            .lean();
          assert.deepEqual(
            copies.map((row) => row.occurrenceDate),
            ['2027-02-01', '2027-02-15', '2027-03-01'],
          );
          assert.equal(
            copies[0].dueAt.toISOString(),
            '2027-02-01T18:29:59.999Z',
          );
          await tasks.update(
            admin,
            wid,
            String(copies[0]._id),
            { status: 'COMPLETED' },
            randomUUID(),
            '"0"',
          );
          assert.equal(
            await Task.countDocuments({
              seriesId: results[0].task.seriesId,
              status: 'COMPLETED',
            }),
            1,
          );
          assert.equal(
            (await tasks.create(admin, wid, input, key)).task.status,
            'COMPLETED',
          );
          assert.equal(
            await TaskSeries.countDocuments({ _id: results[0].task.seriesId }),
            1,
          );
        },
      );
      await t.test(
        'Viewer cannot create/update patterns; other weddings and forged sources are denied',
        async () => {
          await assert.rejects(tasks.create(viewer, wid, body, randomUUID()), {
            code: 'FORBIDDEN',
          });
          await assert.rejects(tasks.readSeries(outsider, wid, monthly.id), {
            code: 'WEDDING_NOT_FOUND',
          });
          await assert.rejects(
            tasks.readSeries(outsider, otherWid, monthly.id),
            { code: 'SERIES_NOT_FOUND' },
          );
          const data = await tasks.readSeries(admin, wid, monthly.id);
          await assert.rejects(
            tasks.updateSeries(
              viewer,
              wid,
              monthly.id,
              edit(data),
              randomUUID(),
              '"0"',
            ),
            { code: 'FORBIDDEN' },
          );
          await assert.rejects(
            tasks.create(
              admin,
              wid,
              { ...body, seriesId: monthly.seriesId },
              randomUUID(),
            ),
            { code: 'VALIDATION_ERROR' },
          );
        },
      );
      await t.test(
        'past starts anchor upcoming schedules without backfilling before creation; past weddings need explicit ends',
        async () => {
          const past = await tasks.create(
            admin,
            wid,
            {
              title: 'Past anchor',
              recurrence: { ...rule, startDate: '2020-01-31' },
            },
            randomUUID(),
          );
          assert.equal(past.task.occurrenceDate, '2027-01-31');
          await Wedding.updateOne(
            { _id: wid },
            { $set: { mainDate: '2020-01-01' } },
          );
          try {
            await assert.rejects(
              tasks.create(
                admin,
                wid,
                {
                  title: 'Needs end',
                  recurrence: {
                    frequency: 'DAILY',
                    interval: 1,
                    startDate: '2027-02-01',
                  },
                },
                randomUUID(),
              ),
              { code: 'VALIDATION_ERROR' },
            );
            const explicit = await tasks.create(
              admin,
              wid,
              {
                title: 'Explicit later end',
                recurrence: {
                  frequency: 'DAILY',
                  interval: 1,
                  startDate: '2027-02-01',
                  endDate: '2027-02-02',
                },
              },
              randomUUID(),
            );
            assert.ok(explicit.task.seriesId);
          } finally {
            await Wedding.updateOne(
              { _id: wid },
              { $set: { mainDate: weddingInput.mainDate } },
            );
          }
          await assert.rejects(
            tasks.create(
              admin,
              wid,
              {
                title: 'No upcoming',
                recurrence: {
                  ...rule,
                  startDate: '2020-01-31',
                  endDate: '2020-03-31',
                },
              },
              randomUUID(),
            ),
            { code: 'VALIDATION_ERROR' },
          );
        },
      );
      await t.test(
        'converting a manual task is atomic, preserves its ID and requires reopening completed records first',
        async () => {
          const original = (
            await tasks.create(
              admin,
              wid,
              { title: 'Make me repeat' },
              randomUUID(),
            )
          ).task;
          const converted = await tasks.update(
            admin,
            wid,
            original.id,
            { recurrence: { ...rule, endDate: '2027-02-28' } },
            randomUUID(),
            '"0"',
          );
          assert.equal(converted.task.id, original.id);
          assert.equal(converted.task.version, 1);
          assert.equal(converted.task.occurrenceDate, '2027-01-31');
          const done = (
            await tasks.create(
              admin,
              wid,
              { title: 'Finished', status: 'COMPLETED' },
              randomUUID(),
            )
          ).task;
          await assert.rejects(
            tasks.update(
              admin,
              wid,
              done.id,
              { status: 'TODO', recurrence: rule },
              randomUUID(),
              '"0"',
            ),
            { code: 'VALIDATION_ERROR' },
          );
        },
      );
      await t.test(
        'future pattern edits preserve completed/customized copies and retire only untouched obsolete dates',
        async () => {
          editable = (
            await tasks.create(
              admin,
              wid,
              {
                title: 'Daily original',
                recurrence: {
                  frequency: 'DAILY',
                  interval: 1,
                  startDate: '2027-02-01',
                  endDate: '2027-02-05',
                  time: '10:00',
                },
              },
              randomUUID(),
            )
          ).task;
          const rows = await Task.find({ seriesId: editable.seriesId })
            .sort({ occurrenceDate: 1 })
            .lean();
          await tasks.update(
            family,
            wid,
            String(rows[0]._id),
            { status: 'COMPLETED' },
            randomUUID(),
            '"0"',
          );
          await tasks.update(
            family,
            wid,
            String(rows[1]._id),
            { title: 'My custom copy' },
            randomUUID(),
            '"0"',
          );
          const before = await tasks.readSeries(admin, wid, editable.id);
          const result = await tasks.updateSeries(
            admin,
            wid,
            editable.id,
            edit(before, {
              recurrence: { ...before.series.recurrence, interval: 2 },
              template: {
                ...edit(before).template,
                title: 'Future template',
                priority: 'URGENT',
              },
            }),
            randomUUID(),
            '"0"',
          );
          assert.equal(result.protectedCount, 2);
          assert.equal(result.retired, 1);
          assert.equal(result.changed, 2);
          assert.equal(
            (await Task.findById(rows[0]._id).lean()).title,
            'Daily original',
          );
          assert.equal(
            (await Task.findById(rows[1]._id).lean()).title,
            'My custom copy',
          );
          assert.equal(
            (await Task.findById(rows[2]._id).lean()).title,
            'Future template',
          );
          assert.equal(
            (await Task.findById(rows[3]._id).lean()).recurrenceExcluded,
            true,
          );
          await assert.rejects(tasks.read(viewer, wid, String(rows[3]._id)), {
            code: 'TASK_NOT_FOUND',
          });
          assert.equal(
            (await tasks.list(viewer, wid, { q: 'Daily original' })).meta.total,
            1,
          );
          const latest = await tasks.readSeries(admin, wid, editable.id);
          await tasks.updateSeries(
            admin,
            wid,
            editable.id,
            edit(latest, {
              recurrence: { ...latest.series.recurrence, interval: 1 },
            }),
            randomUUID(),
            '"1"',
          );
          assert.equal(
            (await Task.findById(rows[3]._id).lean()).recurrenceExcluded,
            false,
          );
          assert.equal(
            await Task.countDocuments({ seriesId: editable.seriesId }),
            5,
          );
        },
      );
      await t.test(
        'stale series edits conflict; matching retries return current pattern without undoing a later stop; stopping keeps copies',
        async () => {
          const before = await tasks.readSeries(admin, wid, editable.id),
            payload = edit(before),
            key = randomUUID();
          const saved = await tasks.updateSeries(
            family,
            wid,
            editable.id,
            payload,
            key,
            `"${before.series.version}"`,
          );
          await assert.rejects(
            tasks.updateSeries(
              admin,
              wid,
              editable.id,
              payload,
              randomUUID(),
              `"${before.series.version}"`,
            ),
            { code: 'VERSION_CONFLICT' },
          );
          const count = await Task.countDocuments({
            seriesId: editable.seriesId,
            recurrenceExcluded: false,
            deletedAt: null,
          });
          await tasks.updateSeries(
            admin,
            wid,
            editable.id,
            edit({ series: saved.series }, { active: false }),
            randomUUID(),
            `"${saved.series.version}"`,
          );
          assert.equal(
            await Task.countDocuments({
              seriesId: editable.seriesId,
              recurrenceExcluded: false,
              deletedAt: null,
            }),
            count,
          );
          const replay = await tasks.updateSeries(
            family,
            wid,
            editable.id,
            payload,
            key,
            `"${before.series.version}"`,
          );
          assert.equal(replay.replayed, true);
          assert.equal(replay.series.active, false);
        },
      );
      await t.test(
        'history failures roll back pattern/copy/receipt creation and future updates together',
        async () => {
          const beforeSeries = await TaskSeries.countDocuments(),
            beforeTasks = await Task.countDocuments();
          const original = Activity.create;
          Activity.create = async () => {
            throw new Error('Injected recurrence history failure');
          };
          try {
            await assert.rejects(
              tasks.create(
                admin,
                wid,
                { ...body, title: 'Rollback recurrence' },
                randomUUID(),
              ),
              /Injected recurrence history failure/,
            );
          } finally {
            Activity.create = original;
          }
          assert.equal(await TaskSeries.countDocuments(), beforeSeries);
          assert.equal(await Task.countDocuments(), beforeTasks);
          const data = await tasks.readSeries(admin, wid, monthly.id),
            version = data.series.version;
          Activity.create = async () => {
            throw new Error('Injected future history failure');
          };
          try {
            await assert.rejects(
              tasks.updateSeries(
                admin,
                wid,
                monthly.id,
                edit(data, {
                  template: { ...edit(data).template, title: 'Must roll back' },
                }),
                randomUUID(),
                `"${version}"`,
              ),
              /Injected future history failure/,
            );
          } finally {
            Activity.create = original;
          }
          assert.equal(
            (await tasks.readSeries(admin, wid, monthly.id)).series.version,
            version,
          );
          assert.equal(
            await Task.countDocuments({ title: 'Must roll back' }),
            0,
          );
          assert.equal(
            await TaskWriteRequest.countDocuments({ requestHash: null }),
            0,
          );
        },
      );
      await t.test(
        'automatic extension catches up safely, is duplicate-free, and does not change the editable pattern version',
        async () => {
          instant = new Date('2027-05-01T06:00:00Z');
          const before = await tasks.readSeries(admin, wid, monthly.id);
          await Promise.all([tasks.pumpRecurrence(), tasks.pumpRecurrence()]);
          const rows = await Task.find({ seriesId: monthly.seriesId })
            .sort({ occurrenceDate: 1 })
            .lean();
          assert.ok(rows.some((row) => row.occurrenceDate === '2027-05-31'));
          assert.ok(rows.some((row) => row.occurrenceDate === '2027-06-30'));
          assert.equal(
            new Set(rows.map((row) => row.occurrenceDate)).size,
            rows.length,
          );
          assert.equal(
            (await tasks.readSeries(admin, wid, monthly.id)).series.version,
            before.series.version,
          );
          const count = rows.length;
          await tasks.pumpRecurrence();
          assert.equal(
            await Task.countDocuments({ seriesId: monthly.seriesId }),
            count,
          );
        },
      );
      await t.test(
        'unavailable assignees block generation visibly; stopping remains possible and an Admin can repair/resume',
        async () => {
          const item = (
            await tasks.create(
              admin,
              wid,
              {
                title: 'Blocked series',
                assigneeIds: [family],
                recurrence: {
                  frequency: 'DAILY',
                  interval: 1,
                  startDate: '2027-05-01',
                  endDate: '2027-12-31',
                },
              },
              randomUUID(),
            )
          ).task;
          await WeddingMember.updateOne(
            { weddingId: wid, userId: family },
            { $set: { status: 'REMOVED' } },
          );
          instant = new Date('2027-08-01T06:00:00Z');
          const before = await Task.countDocuments({ seriesId: item.seriesId });
          await tasks.pumpRecurrence();
          const data = await tasks.readSeries(admin, wid, item.id);
          assert.equal(data.series.generationIssue, 'ASSIGNEE_UNAVAILABLE');
          assert.equal(
            await Task.countDocuments({ seriesId: item.seriesId }),
            before,
          );
          const stopped = await tasks.updateSeries(
            admin,
            wid,
            item.id,
            edit(data, { active: false }),
            randomUUID(),
            `"${data.series.version}"`,
          );
          assert.equal(stopped.series.active, false);
          const resumed = await tasks.updateSeries(
            admin,
            wid,
            item.id,
            edit(
              { series: stopped.series },
              {
                active: true,
                template: {
                  ...edit({ series: stopped.series }).template,
                  assigneeIds: [],
                },
              },
            ),
            randomUUID(),
            `"${stopped.series.version}"`,
          );
          assert.equal(resumed.series.generationIssue, null);
          assert.equal(resumed.series.active, true);
          await WeddingMember.updateOne(
            { weddingId: wid, userId: family },
            { $set: { status: 'ACTIVE' } },
          );
        },
      );
      await t.test(
        'sparse intervals still create a first visible copy beyond the immediate ninety-day horizon',
        async () => {
          const sparse = await tasks.create(
            admin,
            wid,
            {
              title: 'Annual month interval',
              recurrence: {
                frequency: 'MONTHLY',
                interval: 12,
                startDate: '2020-01-31',
                endDate: '2029-01-31',
              },
            },
            randomUUID(),
          );
          assert.equal(sparse.task.occurrenceDate, '2028-01-31');
          assert.equal(sparse.generatedCount, 1);
        },
      );
      await t.test(
        'concurrent individual/future edits cannot overwrite a customized copy, and removed dates never regenerate',
        async () => {
          const created = (
            await tasks.create(
              admin,
              wid,
              {
                title: 'Concurrency pattern',
                recurrence: {
                  frequency: 'DAILY',
                  interval: 1,
                  startDate: '2027-08-02',
                  endDate: '2027-08-04',
                },
              },
              randomUUID(),
            )
          ).task;
          const rows = await Task.find({ seriesId: created.seriesId })
              .sort({ occurrenceDate: 1 })
              .lean(),
            data = await tasks.readSeries(admin, wid, created.id);
          const result = await Promise.allSettled([
            tasks.update(
              family,
              wid,
              String(rows[1]._id),
              { title: 'Protected concurrent copy' },
              randomUUID(),
              '"0"',
            ),
            tasks.updateSeries(
              admin,
              wid,
              created.id,
              edit(data, {
                template: {
                  ...edit(data).template,
                  title: 'Concurrent future title',
                },
              }),
              randomUUID(),
              '"0"',
            ),
          ]);
          assert.equal(result[1].status, 'fulfilled');
          const current = await Task.findById(rows[1]._id).lean();
          if (result[0].status === 'fulfilled') {
            assert.equal(current.title, 'Protected concurrent copy');
            assert.equal(current.occurrenceEdited, true);
          } else assert.equal(result[0].reason.code, 'VERSION_CONFLICT');
          await Task.updateOne(
            { _id: rows[2]._id },
            { $set: { deletedAt: new Date(), deletedBy: admin } },
          );
          const latest = await tasks.readSeries(admin, wid, created.id);
          await tasks.updateSeries(
            admin,
            wid,
            created.id,
            edit(latest),
            randomUUID(),
            `"${latest.series.version}"`,
          );
          assert.ok((await Task.findById(rows[2]._id).lean()).deletedAt);
          assert.equal(
            await Task.countDocuments({ seriesId: created.seriesId }),
            3,
          );
          await assert.rejects(
            Task.create({
              weddingId: wid,
              seriesId: created.seriesId,
              occurrenceDate: '2027-08-02',
              title: 'Duplicate',
              createdBy: admin,
              updatedBy: admin,
              source: { type: 'RECURRENCE' },
            }),
            { code: 11000 },
          );
        },
      );
      await t.test(
        'generation pauses after its last editor loses write access and an Admin can resume ownership',
        async () => {
          const created = (
            await tasks.create(
              family,
              wid,
              {
                title: 'Writer access changes',
                recurrence: {
                  frequency: 'DAILY',
                  interval: 1,
                  startDate: '2027-08-02',
                  endDate: '2027-12-31',
                },
              },
              randomUUID(),
            )
          ).task;
          await WeddingMember.updateOne(
            { weddingId: wid, userId: family },
            { $set: { role: 'VIEWER' } },
          );
          instant = new Date('2027-11-01T06:00:00Z');
          await tasks.pumpRecurrence();
          const before = await tasks.readSeries(admin, wid, created.id);
          assert.equal(before.series.generationIssue, 'OWNER_UNAVAILABLE');
          const resumed = await tasks.updateSeries(
            admin,
            wid,
            created.id,
            edit(before),
            randomUUID(),
            `"${before.series.version}"`,
          );
          assert.equal(resumed.series.generationIssue, null);
          await WeddingMember.updateOne(
            { weddingId: wid, userId: family },
            { $set: { role: 'FAMILY_MEMBER' } },
          );
        },
      );
      await t.test(
        'reactivating retired dates preserves an expired copy but still restores a future copy',
        async () => {
          const savedInstant = instant;
          try {
            instant = new Date('2027-11-02T03:00:00Z'); // 08:30 IST
            const created = await tasks.create(
              admin,
              wid,
              {
                title: 'Original ten oclock task',
                recurrence: {
                  frequency: 'DAILY',
                  interval: 1,
                  startDate: '2027-11-02',
                  endDate: '2027-11-05',
                  time: '10:00',
                },
              },
              randomUUID(),
            );
            const first = created.task;
            const before = await tasks.readSeries(admin, wid, first.id);
            instant = new Date('2027-11-03T03:00:00Z');
            await tasks.updateSeries(
              admin,
              wid,
              first.id,
              edit(before, {
                recurrence: { ...before.series.recurrence, interval: 2 },
              }),
              randomUUID(),
              `"${before.series.version}"`,
            );
            const past = await Task.findOne({
              seriesId: first.seriesId,
              occurrenceDate: '2027-11-03',
            }).lean();
            const future = await Task.findOne({
              seriesId: first.seriesId,
              occurrenceDate: '2027-11-05',
            }).lean();
            assert.equal(past.recurrenceExcluded, true);
            assert.equal(future.recurrenceExcluded, true);
            const auditCount = await Activity.countDocuments({
              entityId: past._id,
            });
            instant = new Date('2027-11-03T06:00:00Z'); // 11:30 IST, after the old deadline
            const current = await tasks.readSeries(admin, wid, first.id);
            await tasks.updateSeries(
              admin,
              wid,
              first.id,
              edit(current, {
                recurrence: {
                  ...current.series.recurrence,
                  interval: 1,
                  time: '12:00',
                },
                template: {
                  ...edit(current).template,
                  title: 'Changed noon task',
                },
              }),
              randomUUID(),
              `"${current.series.version}"`,
            );
            assert.deepEqual(await Task.findById(past._id).lean(), past);
            assert.equal(
              await Activity.countDocuments({ entityId: past._id }),
              auditCount,
            );
            const revived = await Task.findById(future._id).lean();
            assert.equal(revived.recurrenceExcluded, false);
            assert.equal(revived.title, 'Changed noon task');
            assert.equal(
              revived.dueAt.toISOString(),
              '2027-11-05T06:30:00.000Z',
            );
            // A later worker catch-up must apply the same old-deadline protection.
            await TaskSeries.updateOne(
              { _id: first.seriesId },
              { $set: { nextGenerationDate: '2027-11-03' } },
            );
            await tasks.pumpRecurrence();
            assert.deepEqual(await Task.findById(past._id).lean(), past);
            assert.equal(
              await Task.countDocuments({
                seriesId: first.seriesId,
                occurrenceDate: '2027-11-03',
              }),
              1,
            );
          } finally {
            instant = savedInstant;
          }
        },
      );
      await t.test(
        'five paused editors cannot starve a healthy sixth pattern across scheduled passes',
        async () => {
          const savedInstant = instant;
          try {
            // Isolate this queue inside the owned test database from earlier fixtures.
            await TaskSeries.updateMany({}, { $set: { active: false } });
            instant = new Date('2030-01-02T03:00:00Z');
            const template = {
              title: 'Queue fairness fixture',
              description: '',
              priority: 'MEDIUM',
              assigneeIds: [],
              eventId: null,
            };
            const [healthy, ...blocked] = await TaskSeries.insertMany([
              {
                weddingId: wid,
                frequency: 'DAILY',
                interval: 1,
                startDate: '2030-01-02',
                endDate: '2030-01-05',
                time: null,
                template,
                nextGenerationDate: '2030-01-02',
                createdBy: admin,
                updatedBy: admin,
              },
              ...Array.from({ length: 5 }, () => ({
                weddingId: wid,
                frequency: 'DAILY',
                interval: 1,
                startDate: '2030-01-01',
                endDate: '2030-01-05',
                time: null,
                template,
                nextGenerationDate: '2030-01-01',
                createdBy: admin,
                updatedBy: outsider,
              })),
            ]);
            await tasks.pumpRecurrence();
            assert.equal(
              await Task.countDocuments({ seriesId: healthy._id }),
              0,
            );
            assert.equal(
              await TaskSeries.countDocuments({
                _id: { $in: blocked.map((s) => s._id) },
                generationIssue: 'OWNER_UNAVAILABLE',
              }),
              5,
            );
            instant = new Date(instant.getTime() + 15 * 60000);
            await tasks.pumpRecurrence();
            assert.equal(
              await Task.countDocuments({ seriesId: healthy._id }),
              4,
            );
            // Already-paused work is rechecked rather than permanently abandoned.
            for (let i = 0; i < 3; i++) {
              instant = new Date(instant.getTime() + 15 * 60000);
              await tasks.pumpRecurrence();
            }
            assert.equal(
              await Task.countDocuments({ seriesId: healthy._id }),
              4,
            );
            const retries = await TaskSeries.find({
              _id: { $in: blocked.map((s) => s._id) },
            }).lean();
            assert.ok(
              retries.every(
                (s) => s.retryAt > new Date('2030-01-02T03:15:00Z'),
              ),
            );
            assert.equal((await TaskSeries.findById(healthy._id)).__v, 0);
          } finally {
            instant = savedInstant;
          }
        },
      );
    } finally {
      await tasks.close();
      await connection.dropDatabase();
      await database.close();
    }
  },
);
