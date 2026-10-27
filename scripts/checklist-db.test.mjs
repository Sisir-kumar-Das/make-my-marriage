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
import { checklistModels } from '../apps/api/src/checklist/models.js';
import { readChecklistCatalog } from '../apps/api/src/checklist/catalog.js';

test(
  'Atlas checklist generation: scoped preview, atomic writes, permanent identities and safe retries',
  { skip: !config.mongodbUri && 'Set private MONGODB_URI for Atlas checks.' },
  async (t) => {
    const settings = {
      ...config,
      mongodbDbName: 'mmm_checklist_test_' + randomBytes(8).toString('hex'),
      jwtSecret: randomBytes(48).toString('base64url'),
    };
    const database = createAuthDatabase(settings),
      weddings = createWeddingService({ database });
    let instant = new Date('2027-01-01T12:00:00Z');
    const tasks = createTaskService({ database, now: () => instant });
    const auth = createAuthService({
      database,
      settings,
      sendVerification: async () => {},
    });
    const connection = await database.connect(),
      { User } = authModels(connection),
      { Wedding, WeddingMember } = weddingModels(connection),
      { Task } = taskModels(connection),
      { Activity } = eventModels(connection),
      { ChecklistGeneration, ChecklistWriteRequest } =
        checklistModels(connection);
    const packs = readChecklistCatalog().templates;
    const selection = (index = 0) => ({
      templateId: packs[index].id,
      templateVersion: packs[index].version,
    });
    const body = (preview) => ({
      templateId: preview.template.id,
      templateVersion: preview.template.version,
      previewHash: preview.previewHash,
    });
    const isCode = (code) => (error) => error.code === code;
    let admin,
      family,
      viewer,
      outsider,
      wid,
      otherWid,
      original,
      originalBody,
      originalKey;
    async function account(name) {
      const email = name.toLowerCase() + '@checklist-test.example.com';
      await auth.register({ name, email, password: 'Wedding123' });
      const user = await User.findOneAndUpdate(
        { emailNormalized: email },
        { $set: { emailVerifiedAt: new Date() } },
        { returnDocument: 'after' },
      );
      return String(user._id);
    }
    const weddingInput = {
      name: 'Checklist fixture',
      brideName: 'Anya',
      groomName: 'Kabir',
      mainDate: '2028-02-20',
      tradition: 'ODIA',
      location: { city: 'Cuttack', state: 'Odisha', countryCode: 'IN' },
    };
    try {
      admin = await account('Admin');
      family = await account('Family');
      viewer = await account('Viewer');
      outsider = await account('Outsider');
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
        'current roles/tenant boundaries and template versions are enforced before any generation',
        async () => {
          const preview = await tasks.previewChecklist(admin, wid, selection());
          assert.deepEqual(preview.counts, {
            toAdd: 6,
            kept: 0,
            deleted: 0,
            pastDue: 0,
          });
          await assert.rejects(
            tasks.previewChecklist(viewer, wid, selection()),
            isCode('FORBIDDEN'),
          );
          await assert.rejects(
            tasks.generateChecklist(viewer, wid, body(preview), randomUUID()),
            isCode('FORBIDDEN'),
          );
          await assert.rejects(
            tasks.previewChecklist(outsider, wid, selection()),
            isCode('WEDDING_NOT_FOUND'),
          );
          await assert.rejects(
            tasks.generateChecklist(
              admin,
              otherWid,
              body(preview),
              randomUUID(),
            ),
            isCode('WEDDING_NOT_FOUND'),
          );
          await assert.rejects(
            tasks.previewChecklist(admin, wid, {
              templateId: 'odia-rituals',
              templateVersion: '1',
            }),
            isCode('TEMPLATE_NOT_FOUND'),
          );
          await assert.rejects(
            tasks.previewChecklist(admin, wid, {
              ...selection(),
              templateVersion: '2',
            }),
            isCode('TEMPLATE_VERSION_CHANGED'),
          );
          await assert.rejects(
            tasks.generateChecklist(admin, wid, body(preview), 'invalid'),
            isCode('IDEMPOTENCY_KEY_REQUIRED'),
          );
          assert.equal(await Task.countDocuments({ weddingId: wid }), 0);
          assert.equal(await ChecklistGeneration.countDocuments({}), 0);
        },
      );
      await t.test(
        'explicit generation atomically creates six normal tasks, source identities, audit and one receipt',
        async () => {
          const preview = await tasks.previewChecklist(admin, wid, selection());
          originalBody = body(preview);
          originalKey = randomUUID();
          original = await tasks.generateChecklist(
            admin,
            wid,
            originalBody,
            originalKey,
          );
          assert.equal(original.generation.added, 6);
          assert.equal(original.replayed, false);
          const rows = await Task.find({ weddingId: wid }).lean();
          assert.equal(rows.length, 6);
          for (const row of rows) {
            assert.equal(row.source.type, 'CHECKLIST');
            assert.equal(row.source.templateVersion, '1');
            assert.equal(row.status, 'TODO');
            assert.deepEqual(row.assigneeIds, []);
            assert.equal(row.eventId, null);
            assert.equal(row.dueDateOnly, true);
            assert.equal(
              new Date(row.dueAt.getTime() + 19800000).toISOString().slice(11),
              '23:59:59.999Z',
            );
            assert.equal(String(row.createdBy), admin);
          }
          assert.equal(
            await Activity.countDocuments({
              weddingId: wid,
              action: 'TASK_CREATED',
            }),
            6,
          );
          assert.equal(
            await Activity.countDocuments({
              weddingId: wid,
              action: 'CHECKLIST_GENERATED',
            }),
            1,
          );
          assert.equal(
            await ChecklistGeneration.countDocuments({ weddingId: wid }),
            1,
          );
          assert.equal(
            await ChecklistWriteRequest.countDocuments({ weddingId: wid }),
            1,
          );
          const replay = await tasks.generateChecklist(
            admin,
            wid,
            originalBody,
            originalKey,
          );
          assert.equal(replay.replayed, true);
          assert.equal(replay.generation.id, original.generation.id);
          assert.equal(
            await ChecklistGeneration.countDocuments({ weddingId: wid }),
            1,
          );
          await assert.rejects(
            tasks.generateChecklist(
              admin,
              wid,
              { ...originalBody, previewHash: 'f'.repeat(64) },
              originalKey,
            ),
            isCode('IDEMPOTENCY_CONFLICT'),
          );
        },
      );
      await t.test(
        'Family edits/completion/deadlines/assignments survive re-generation; removed records are skipped without disclosure',
        async () => {
          const first = await Task.findOne({
            weddingId: wid,
            'source.itemKey': packs[0].items[0].key,
          }).lean();
          await tasks.update(
            family,
            wid,
            String(first._id),
            {
              title: 'Family edited priority',
              description: 'Keep these notes',
              status: 'COMPLETED',
              priority: 'LOW',
              dueAt: null,
              dueDateOnly: false,
              assigneeIds: [family],
            },
            randomUUID(),
            '"0"',
          );
          const removed = await Task.findOne({
            weddingId: wid,
            'source.itemKey': packs[0].items[1].key,
          }).lean();
          const edited = await tasks.update(
            family,
            wid,
            String(removed._id),
            {
              title: 'Private removed title',
              description: 'Private removed notes',
            },
            randomUUID(),
            '"0"',
          );
          await tasks.remove(
            family,
            wid,
            String(removed._id),
            {},
            randomUUID(),
            `"${edited.task.version}"`,
          );
          const before = await Task.find({ weddingId: wid })
            .sort({ _id: 1 })
            .lean();
          const preview = await tasks.previewChecklist(
            family,
            wid,
            selection(),
          );
          assert.deepEqual(preview.counts, {
            toAdd: 0,
            kept: 5,
            deleted: 1,
            pastDue: 0,
          });
          assert.equal(
            JSON.stringify(preview).includes('Private removed'),
            false,
          );
          assert.equal(
            JSON.stringify(preview).includes(String(removed._id)),
            false,
          );
          const generated = await tasks.generateChecklist(
            family,
            wid,
            body(preview),
            randomUUID(),
          );
          assert.equal(generated.generation.added, 0);
          assert.equal(generated.generation.deleted, 1);
          assert.deepEqual(
            await Task.find({ weddingId: wid }).sort({ _id: 1 }).lean(),
            before,
          );
          await tasks.generateChecklist(admin, wid, originalBody, originalKey);
          assert.ok(
            (await Task.findById(removed._id).lean()).deletedAt,
            'A receipt replay cannot restore a removed item',
          );
          await assert.rejects(
            Task.create({
              weddingId: wid,
              title: 'Version two duplicate',
              source: { ...removed.source, templateVersion: '2' },
              createdBy: admin,
              updatedBy: admin,
            }),
            (error) => error.code === 11000,
          );
          const current = (
            await tasks.readDeleted(admin, wid, String(removed._id))
          ).task;
          await assert.rejects(
            tasks.restore(
              family,
              wid,
              current.id,
              {},
              randomUUID(),
              `"${current.version}"`,
            ),
            isCode('TASK_NOT_FOUND'),
          );
          await tasks.restore(
            admin,
            wid,
            current.id,
            {},
            randomUUID(),
            `"${current.version}"`,
          );
          assert.deepEqual(
            (await tasks.previewChecklist(admin, wid, selection())).counts,
            { toAdd: 0, kept: 6, deleted: 0, pastDue: 0 },
          );
        },
      );
      await t.test(
        'stale previews and wedding date changes require reconfirmation; manual same-title tasks are independent',
        async () => {
          const preview = await tasks.previewChecklist(
            admin,
            wid,
            selection(1),
          );
          await tasks.create(
            admin,
            wid,
            { title: packs[0].items[0].title },
            randomUUID(),
          );
          await assert.rejects(
            tasks.generateChecklist(admin, wid, body(preview), randomUUID()),
            isCode('CHECKLIST_PREVIEW_CHANGED'),
          );
          const latest = await tasks.previewChecklist(admin, wid, selection(1));
          await Wedding.updateOne(
            { _id: wid },
            { $set: { mainDate: '2028-02-21' } },
          );
          await assert.rejects(
            tasks.generateChecklist(admin, wid, body(latest), randomUUID()),
            isCode('CHECKLIST_PREVIEW_CHANGED'),
          );
          await Wedding.updateOne(
            { _id: wid },
            { $set: { mainDate: weddingInput.mainDate } },
          );
          assert.equal(
            await Task.countDocuments({
              weddingId: wid,
              'source.templateId': packs[1].id,
            }),
            0,
          );
        },
      );
      await t.test(
        'concurrent members cannot silently apply a stale confirmation or duplicate a pack',
        async () => {
          const preview = await tasks.previewChecklist(
            admin,
            wid,
            selection(1),
          );
          const settled = await Promise.allSettled([
            tasks.generateChecklist(admin, wid, body(preview), randomUUID()),
            tasks.generateChecklist(family, wid, body(preview), randomUUID()),
          ]);
          assert.equal(
            settled.filter((row) => row.status === 'fulfilled').length,
            1,
          );
          assert.equal(
            settled.find((row) => row.status === 'rejected').reason.code,
            'CHECKLIST_PREVIEW_CHANGED',
          );
          assert.equal(
            await Task.countDocuments({
              weddingId: wid,
              'source.templateId': packs[1].id,
            }),
            6,
          );
        },
      );
      await t.test(
        'overlapping identical retries return one generation and no duplicate audit',
        async () => {
          const preview = await tasks.previewChecklist(
              admin,
              wid,
              selection(2),
            ),
            key = randomUUID();
          const [a, b] = await Promise.all([
            tasks.generateChecklist(admin, wid, body(preview), key),
            tasks.generateChecklist(admin, wid, body(preview), key),
          ]);
          assert.equal(a.generation.id, b.generation.id);
          assert.ok(a.replayed !== b.replayed);
          assert.equal(
            await ChecklistGeneration.countDocuments({
              weddingId: wid,
              templateId: packs[2].id,
            }),
            1,
          );
          assert.equal(
            await Task.countDocuments({
              weddingId: wid,
              'source.templateId': packs[2].id,
            }),
            6,
          );
        },
      );
      await t.test(
        'audit failure rolls back every task, generation, receipt and revision',
        async () => {
          const preview = await tasks.previewChecklist(
            admin,
            wid,
            selection(3),
          );
          const before = {
            tasks: await Task.countDocuments({}),
            generations: await ChecklistGeneration.countDocuments({}),
            receipts: await ChecklistWriteRequest.countDocuments({}),
            revision: (await Wedding.findById(wid).lean()).taskRevision,
          };
          const originalCreate = Activity.create;
          Activity.create = async () => {
            throw new Error('Injected audit failure');
          };
          try {
            await assert.rejects(
              tasks.generateChecklist(admin, wid, body(preview), randomUUID()),
              /Injected audit failure/,
            );
          } finally {
            Activity.create = originalCreate;
          }
          assert.deepEqual(
            {
              tasks: await Task.countDocuments({}),
              generations: await ChecklistGeneration.countDocuments({}),
              receipts: await ChecklistWriteRequest.countDocuments({}),
              revision: (await Wedding.findById(wid).lean()).taskRevision,
            },
            before,
          );
        },
      );
      await t.test(
        'lost responses can be retried across midnight; expired receipts do not overwrite generation history',
        async () => {
          instant = new Date('2027-01-01T18:29:00Z');
          const preview = await tasks.previewChecklist(
              admin,
              wid,
              selection(3),
            ),
            key = randomUUID();
          const generated = await tasks.generateChecklist(
            admin,
            wid,
            body(preview),
            key,
          );
          instant = new Date('2027-01-01T18:31:00Z');
          assert.equal(
            (await tasks.generateChecklist(admin, wid, body(preview), key))
              .replayed,
            true,
          );
          instant = new Date('2027-01-02T18:31:00Z');
          await assert.rejects(
            tasks.generateChecklist(admin, wid, body(preview), key),
            isCode('CHECKLIST_PREVIEW_CHANGED'),
          );
          const latest = await tasks.previewChecklist(admin, wid, selection(3));
          const second = await tasks.generateChecklist(
            admin,
            wid,
            body(latest),
            key,
          );
          assert.notEqual(second.generation.id, generated.generation.id);
          assert.equal(second.generation.added, 0);
          assert.equal(
            await ChecklistGeneration.countDocuments({
              weddingId: wid,
              templateId: packs[3].id,
            }),
            2,
          );
        },
      );
      await t.test(
        'normal recurrence edits retain the original checklist identity and cannot make it regenerate',
        async () => {
          const row = await Task.findOne({
            weddingId: wid,
            'source.itemKey': packs[0].items[2].key,
          }).lean();
          const update = await tasks.update(
            admin,
            wid,
            String(row._id),
            {
              recurrence: {
                frequency: 'DAILY',
                interval: 1,
                startDate: '2027-01-04',
                endDate: '2027-01-07',
                time: null,
              },
            },
            randomUUID(),
            `"${row.__v}"`,
          );
          assert.equal(update.task.source.type, 'CHECKLIST');
          const current = await tasks.readSeries(admin, wid, update.task.id);
          await tasks.updateSeries(
            admin,
            wid,
            update.task.id,
            {
              active: true,
              recurrence: current.series.recurrence,
              template: {
                title: 'Updated repeating preparation',
                description: 'Keep checklist origin',
                priority: 'HIGH',
                assigneeIds: [],
                eventId: null,
              },
            },
            randomUUID(),
            `"${current.series.version}"`,
          );
          const after = (await tasks.read(admin, wid, update.task.id)).task;
          assert.equal(after.source.type, 'CHECKLIST');
          assert.equal(after.source.itemKey, row.source.itemKey);
          await tasks.remove(
            admin,
            wid,
            after.id,
            {},
            randomUUID(),
            `"${after.version}"`,
          );
          const preview = await tasks.previewChecklist(admin, wid, selection());
          assert.equal(preview.counts.toAdd, 0);
          assert.equal(preview.counts.deleted, 1);
          await tasks.generateChecklist(
            admin,
            wid,
            body(preview),
            randomUUID(),
          );
          assert.equal(
            await Task.countDocuments({
              weddingId: wid,
              'source.type': 'CHECKLIST',
              'source.templateId': packs[0].id,
            }),
            6,
          );
        },
      );
      await t.test(
        'current account, membership and wedding state are rechecked, including on receipt replay',
        async () => {
          const activePreview = await tasks.previewChecklist(
            admin,
            wid,
            selection(),
          );
          const activeBody = body(activePreview),
            activeKey = randomUUID();
          await tasks.generateChecklist(admin, wid, activeBody, activeKey);
          await User.updateOne(
            { _id: family },
            { $set: { status: 'DISABLED' } },
          );
          await assert.rejects(
            tasks.previewChecklist(family, wid, selection()),
            isCode('SESSION_EXPIRED'),
          );
          await User.updateOne({ _id: family }, { $set: { status: 'ACTIVE' } });
          await WeddingMember.updateOne(
            { weddingId: wid, userId: admin },
            { $set: { role: 'VIEWER' } },
          );
          await assert.rejects(
            tasks.generateChecklist(admin, wid, activeBody, activeKey),
            isCode('FORBIDDEN'),
          );
          await WeddingMember.updateOne(
            { weddingId: wid, userId: admin },
            { $set: { role: 'ADMIN' } },
          );
          await Wedding.updateOne(
            { _id: wid },
            { $set: { deletedAt: new Date() } },
          );
          await assert.rejects(
            tasks.previewChecklist(admin, wid, selection()),
            isCode('WEDDING_NOT_FOUND'),
          );
          await Wedding.updateOne({ _id: wid }, { $set: { deletedAt: null } });
        },
      );
      await t.test(
        'history is wedding-scoped, available to all active roles and uses saved outcomes after task changes',
        async () => {
          const before = {
            tasks: await Task.countDocuments({}),
            receipts: await ChecklistWriteRequest.countDocuments({}),
            activities: await Activity.countDocuments({}),
            revision: (await Wedding.findById(wid).lean()).taskRevision,
          };
          const saved = await ChecklistGeneration.findById(
            original.generation.id,
          ).lean();
          for (const actor of [admin, family, viewer]) {
            const result = await tasks.checklistGenerations(actor, wid);
            assert.equal(
              result.pagination.total,
              await ChecklistGeneration.countDocuments({ weddingId: wid }),
            );
            const detail = (
              await tasks.checklistGeneration(
                actor,
                wid,
                original.generation.id,
              )
            ).generation;
            for (const key of [
              'added',
              'kept',
              'deleted',
              'templateName',
              'templateVersion',
              'weddingDate',
            ])
              assert.equal(detail[key], saved[key]);
            assert.equal(detail.createdAt, saved.createdAt.toISOString());
            assert.equal(detail.initiator.name, 'Admin');
            assert.deepEqual(
              Object.keys(detail).sort(),
              [
                'id',
                'templateId',
                'templateVersion',
                'templateName',
                'weddingDate',
                'added',
                'kept',
                'deleted',
                'createdAt',
                'initiator',
              ].sort(),
            );
            assert.deepEqual(Object.keys(detail.initiator), ['name']);
            assert.equal(
              JSON.stringify(result).includes('Private removed'),
              false,
            );
            assert.equal(JSON.stringify(detail).includes('@'), false);
          }
          assert.deepEqual(
            await tasks.checklistGenerations(outsider, otherWid),
            {
              generations: [],
              pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
            },
          );
          await assert.rejects(
            tasks.checklistGenerations(outsider, wid),
            isCode('WEDDING_NOT_FOUND'),
          );
          await assert.rejects(
            tasks.checklistGeneration(
              outsider,
              otherWid,
              original.generation.id,
            ),
            isCode('GENERATION_NOT_FOUND'),
          );
          await assert.rejects(
            tasks.checklistGeneration(admin, wid, '000000000000000000000000'),
            isCode('GENERATION_NOT_FOUND'),
          );
          await assert.rejects(
            tasks.checklistGeneration(admin, wid, 'bad-id'),
            isCode('GENERATION_NOT_FOUND'),
          );
          await assert.rejects(
            tasks.checklistGeneration(admin, wid, original.generation.id, {
              includeTasks: 'true',
            }),
            isCode('VALIDATION_ERROR'),
          );
          assert.deepEqual(
            {
              tasks: await Task.countDocuments({}),
              receipts: await ChecklistWriteRequest.countDocuments({}),
              activities: await Activity.countDocuments({}),
              revision: (await Wedding.findById(wid).lean()).taskRevision,
            },
            before,
            'Reading history has no write side effects',
          );
        },
      );
      await t.test(
        'history has deterministic page boundaries, clamps missing pages and rejects unsafe queries',
        async () => {
          const sorted = await ChecklistGeneration.find({ weddingId: wid })
            .sort({ createdAt: -1, _id: -1 })
            .lean();
          const seen = [];
          for (let page = 1; page <= Math.ceil(sorted.length / 2); page++) {
            const result = await tasks.checklistGenerations(viewer, wid, {
              page,
              limit: 2,
            });
            seen.push(...result.generations.map((row) => row.id));
            assert.equal(result.pagination.page, page);
          }
          assert.deepEqual(
            seen,
            sorted.map((row) => String(row._id)),
          );
          assert.equal(new Set(seen).size, sorted.length);
          const last = await tasks.checklistGenerations(family, wid, {
            page: 999,
            limit: 2,
          });
          assert.equal(last.pagination.page, Math.ceil(sorted.length / 2));
          for (const raw of [
            { page: ['1'] },
            { limit: 101 },
            { weddingId: otherWid },
          ])
            await assert.rejects(
              tasks.checklistGenerations(admin, wid, raw),
              isCode('VALIDATION_ERROR'),
            );
        },
      );
      await t.test(
        'history resolves only eligible current names and blocks removed/disabled readers and deleted weddings',
        async () => {
          const detail = () =>
            tasks.checklistGeneration(viewer, wid, original.generation.id);
          await User.updateOne(
            { _id: admin },
            { $set: { 'profile.displayName': 'Renamed Admin' } },
          );
          assert.equal(
            (await detail()).generation.initiator.name,
            'Renamed Admin',
          );
          await WeddingMember.updateOne(
            { weddingId: wid, userId: admin },
            { $set: { status: 'REMOVED' } },
          );
          assert.equal((await detail()).generation.initiator.name, null);
          await assert.rejects(
            tasks.checklistGenerations(admin, wid),
            isCode('WEDDING_NOT_FOUND'),
          );
          await WeddingMember.updateOne(
            { weddingId: wid, userId: admin },
            { $set: { status: 'ACTIVE' } },
          );
          await User.updateOne(
            { _id: admin },
            { $set: { status: 'DISABLED' } },
          );
          assert.equal((await detail()).generation.initiator.name, null);
          await assert.rejects(
            tasks.checklistGeneration(admin, wid, original.generation.id),
            isCode('SESSION_EXPIRED'),
          );
          await User.updateOne(
            { _id: admin },
            { $set: { status: 'ACTIVE', 'profile.displayName': 'Admin' } },
          );
          await User.updateOne(
            { _id: viewer },
            { $set: { emailVerifiedAt: null } },
          );
          await assert.rejects(
            tasks.checklistGenerations(viewer, wid),
            isCode('SESSION_EXPIRED'),
          );
          await User.updateOne(
            { _id: viewer },
            { $set: { emailVerifiedAt: new Date() } },
          );
          await Wedding.updateOne(
            { _id: wid },
            { $set: { deletedAt: new Date() } },
          );
          await assert.rejects(
            tasks.checklistGenerations(family, wid),
            isCode('WEDDING_NOT_FOUND'),
          );
          await assert.rejects(detail(), isCode('WEDDING_NOT_FOUND'));
          await Wedding.updateOne({ _id: wid }, { $set: { deletedAt: null } });
        },
      );
    } finally {
      await tasks.close();
      await connection.dropDatabase();
      await database.close();
    }
  },
);
