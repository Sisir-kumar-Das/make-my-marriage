import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { config } from '../apps/api/src/config.js';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { weddingModels } from '../apps/api/src/weddings/models.js';
import { taskModels } from '../apps/api/src/tasks/models.js';
import { eventModels } from '../apps/api/src/events/models.js';
import { memberModels } from '../apps/api/src/members/models.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';
import { createMemberService } from '../apps/api/src/members/service.js';
import { createTaskService } from '../apps/api/src/tasks/service.js';
import { createAuthService } from '../apps/api/src/auth/service.js';
import { createInvitationService } from '../apps/api/src/invitations/service.js';

test(
  'Atlas member removal: explicit assignment policy, preserved history, last Admin and receipt/worker races',
  { skip: !config.mongodbUri && 'Set private MONGODB_URI for Atlas checks.' },
  async (t) => {
    const dbName = 'mmm_removal_test_' + randomBytes(8).toString('hex'),
      settings = {
        ...config,
        mongodbDbName: dbName,
        jwtSecret: randomBytes(48).toString('base64url'),
      },
      database = createAuthDatabase(settings);
    let connection;
    try {
      connection = await database.connect();
      const { User } = authModels(connection),
        { Wedding, WeddingMember } = weddingModels(connection),
        { Task, TaskSeries } = taskModels(connection),
        { Activity } = eventModels(connection),
        { MemberRemovalRequest } = memberModels(connection);
      const instant = new Date('2027-01-30T06:00:00Z'),
        now = () => instant,
        weddings = createWeddingService({ database, now }),
        members = createMemberService({ database, settings, now }),
        tasks = createTaskService({ database, now });
      const invitations = createInvitationService({
        database,
        settings,
        now,
        sendInvitation: async () => {},
      });
      const auth = createAuthService({
        database,
        settings,
        now,
        getWeddingContext: weddings.current,
        sendVerification: async () => {},
      });
      const password = 'DisposableRemoval42',
        passwordHash = await argon2.hash(password);
      let serial = 0;
      async function account(label, extra = {}) {
        const name = label + ++serial,
          email = name.toLowerCase() + '@removal-test.example.com';
        const row = await User.create({
          email,
          emailNormalized: email,
          passwordHash,
          profile: { displayName: name },
          emailVerifiedAt: instant,
          ...extra,
        });
        return { id: String(row._id), email, name };
      }
      async function fixture(coRole = 'ADMIN') {
        const admin = await account('Creator'),
          coadmin = await account('CoAdmin'),
          family = await account('Family'),
          viewer = await account('Viewer');
        const wid = (
          await weddings.create(
            admin.id,
            {
              name: 'Removal fixture',
              brideName: 'Anya',
              groomName: 'Kabir',
              mainDate: '2028-02-20',
              tradition: 'ODIA',
              location: { city: 'Cuttack', state: 'Odisha', countryCode: 'IN' },
            },
            randomUUID(),
          )
        ).wedding.id;
        for (const [person, role] of [
          [coadmin, coRole],
          [viewer, 'VIEWER'],
        ])
          await WeddingMember.create({
            weddingId: wid,
            userId: person.id,
            role,
            relationship: 'Friend',
            joinedAt: instant,
            createdBy: admin.id,
          });
        const issue = async (person) => {
          const data = await invitations.create(
            admin.id,
            wid,
            {
              email: person.email,
              role: 'FAMILY_MEMBER',
              relationshipChoice: 'Friend',
            },
            randomUUID(),
          );
          const token = new URL(
              (await invitations.copyLink(admin.id, wid, data.invitation.id))
                .url,
            ).hash.slice('#token='.length),
            key = randomUUID();
          await invitations.accept(person.id, { token }, key);
          return { token, key };
        };
        const originalJoin = await issue(family);
        const row = (person) =>
          WeddingMember.findOne({ weddingId: wid, userId: person.id }).lean();
        async function request(actor, person, patch = {}) {
          const target = await row(person),
            data = await members.readRemoval(actor.id, wid, String(target._id));
          return {
            memberId: String(target._id),
            version: String(data.member.version),
            key: randomUUID(),
            input: {
              preview: data.preview,
              policy:
                data.taskCount || data.assignmentRules ? 'UNASSIGN' : null,
              replacementUserId: null,
              handoverToUserId: data.managedRules.count ? admin.id : null,
              confirmHandover: data.managedRules.count > 0,
              confirmRemoval: true,
              ...patch,
            },
          };
        }
        const remove = (actor, r) =>
          members.remove(actor.id, wid, r.memberId, r.input, r.version, r.key);
        async function task(title, patch = {}) {
          return Task.create({
            weddingId: wid,
            title,
            assigneeIds: [family.id],
            source: { type: 'MANUAL' },
            createdBy: family.id,
            updatedBy: family.id,
            ...patch,
          });
        }
        async function rule(title, patch = {}) {
          return TaskSeries.create({
            weddingId: wid,
            frequency: 'DAILY',
            interval: 1,
            startDate: '2027-01-30',
            endDate: '2027-05-01',
            time: '10:00',
            template: {
              title,
              priority: 'MEDIUM',
              assigneeIds: [family.id],
              eventId: null,
            },
            nextGenerationDate: '2027-01-30',
            createdBy: family.id,
            updatedBy: family.id,
            ...patch,
          });
        }
        return {
          admin,
          coadmin,
          family,
          viewer,
          wid,
          row,
          request,
          remove,
          task,
          rule,
          issue,
          originalJoin,
        };
      }
      const f = await fixture();
      const solo = await f.task('Overdue sole assignment', {
          dueAt: new Date('2027-01-29T04:30:00Z'),
        }),
        shared = await f.task('Overdue shared assignment', {
          assigneeIds: [f.family.id, f.coadmin.id],
          dueAt: new Date('2027-01-28T04:30:00Z'),
          status: 'IN_PROGRESS',
        }),
        noDue = await f.task('No deadline');
      const preserved = [
        await f.task('Completed work', {
          status: 'COMPLETED',
          completedAt: instant,
          completedBy: f.family.id,
        }),
        await f.task('Deleted work', { deletedAt: instant }),
        await f.task('Retired work', { recurrenceExcluded: true }),
      ];
      const assignedRule = await f.rule('Assignment and manager', {
          generationIssue: 'OWNER_UNAVAILABLE',
          retryAt: new Date('2027-02-10'),
        }),
        managedRule = await f.rule('Managed for someone else', {
          template: {
            title: 'Managed for someone else',
            priority: 'HIGH',
            assigneeIds: [f.viewer.id],
            eventId: null,
          },
          generationIssue: 'EVENT_UNAVAILABLE',
          retryAt: new Date('2027-02-10'),
        }),
        stopped = await f.rule('Stopped historical rule', { active: false }),
        past = await f.rule('Ended historical rule', { endDate: '2027-01-29' });
      const copy = await f.task('Future generated copy', {
        source: { type: 'RECURRENCE' },
        seriesId: assignedRule._id,
        occurrenceDate: '2027-01-31',
        dueAt: new Date('2027-01-31T04:30:00Z'),
      });
      const checklist = await f.task('Generated checklist work', {
        source: {
          type: 'CHECKLIST',
          templateId: 'generic',
          templateVersion: '1',
          itemKey: 'one',
        },
      });
      const oldSession = await auth.login({ email: f.family.email, password }),
        untouched = await Task.find({
          _id: { $in: preserved.map((row) => row._id) },
        })
          .sort({ _id: 1 })
          .lean();
      let originalRequest;
      await t.test(
        'current Admin-only preview is scoped, exact and excludes private/deleted task details',
        async () => {
          const id = String((await f.row(f.family))._id),
            preview = await members.readRemoval(f.admin.id, f.wid, id);
          assert.equal(preview.taskCount, 5);
          assert.equal(preview.overdueCount, 2);
          assert.equal(preview.assignmentRules, 1);
          assert.equal(preview.managedRules.count, 2);
          assert.equal(JSON.stringify(preview).includes('@'), false);
          assert.equal(JSON.stringify(preview).includes('Deleted work'), false);
          for (const actor of [f.family, f.viewer])
            await assert.rejects(members.readRemoval(actor.id, f.wid, id), {
              code: 'ADMIN_REQUIRED',
            });
          const foreign = await fixture();
          await assert.rejects(
            members.readRemoval(f.admin.id, foreign.wid, id),
            { code: 'MEMBER_NOT_FOUND' },
          );
          await assert.rejects(
            members.readRemoval(f.admin.id, f.wid, id, {
              includeDeleted: 'true',
            }),
            { code: 'VALIDATION_ERROR' },
          );
          await assert.rejects(
            f.remove(f.family, await f.request(f.admin, f.viewer)),
            { code: 'ADMIN_REQUIRED' },
          );
        },
      );
      await t.test(
        'choice/manager/recipient must be explicit, current, eligible and purpose-scoped',
        async () => {
          const r = await f.request(f.admin, f.family);
          await assert.rejects(
            f.remove(f.admin, { ...r, input: { ...r.input, policy: null } }),
            { code: 'ASSIGNMENT_CHOICE_REQUIRED' },
          );
          await assert.rejects(
            f.remove(f.admin, {
              ...r,
              input: {
                ...r.input,
                handoverToUserId: null,
                confirmHandover: false,
              },
            }),
            { code: 'HANDOVER_REQUIRED' },
          );
          await assert.rejects(
            f.remove(f.admin, {
              ...r,
              input: {
                ...r.input,
                policy: 'REASSIGN',
                replacementUserId: f.family.id,
              },
            }),
            { code: 'INVALID_RECIPIENT' },
          );
          await assert.rejects(
            f.remove(f.admin, {
              ...r,
              input: { ...r.input, handoverToUserId: f.viewer.id },
            }),
            { code: 'MEMBER_PREVIEW_STALE' },
          );
          const token = (await members.read(f.admin.id, f.wid, r.memberId))
            .preview;
          await assert.rejects(
            f.remove(f.admin, { ...r, input: { ...r.input, preview: token } }),
            { code: 'MEMBER_PREVIEW_STALE' },
          );
          const disabled = await account('Disabled', { status: 'DISABLED' });
          await WeddingMember.create({
            weddingId: f.wid,
            userId: disabled.id,
            role: 'FAMILY_MEMBER',
            relationship: 'Friend',
            joinedAt: instant,
            createdBy: f.admin.id,
          });
          const fresh = await f.request(f.admin, f.family, {
            policy: 'REASSIGN',
            replacementUserId: disabled.id,
          });
          await assert.rejects(f.remove(f.admin, fresh), {
            code: 'MEMBER_PREVIEW_STALE',
          });
        },
      );
      await t.test(
        'new task/repeat impact and stale member versions block the original preview',
        async () => {
          const r = await f.request(f.admin, f.family);
          await tasks.create(
            f.admin.id,
            f.wid,
            { title: 'Concurrent untouched new work' },
            randomUUID(),
          );
          await assert.rejects(f.remove(f.admin, r), {
            code: 'MEMBER_PREVIEW_STALE',
          });
          const fresh = await f.request(f.admin, f.family);
          await WeddingMember.updateOne(
            { _id: fresh.memberId },
            { $inc: { __v: 1 } },
          );
          await assert.rejects(f.remove(f.admin, fresh), {
            code: 'MEMBER_PREVIEW_STALE',
          });
        },
      );
      await t.test(
        'failure at final member audit rolls back all earlier task/rule writes and the receipt',
        async () => {
          const r = await f.request(f.admin, f.family),
            before = await Task.find({ weddingId: f.wid })
              .sort({ _id: 1 })
              .lean(),
            beforeRules = await TaskSeries.find({ weddingId: f.wid })
              .sort({ _id: 1 })
              .lean(),
            original = Activity.create;
          Activity.create = async (...args) => {
            if (args[0][0].action === 'MEMBER_REMOVED')
              throw new Error('Injected audit failure');
            return original.apply(Activity, args);
          };
          try {
            await assert.rejects(f.remove(f.admin, r), {
              code: 'MEMBER_CHANGE_UNAVAILABLE',
            });
          } finally {
            Activity.create = original;
          }
          assert.deepEqual(
            await Task.find({ weddingId: f.wid }).sort({ _id: 1 }).lean(),
            before,
          );
          assert.deepEqual(
            await TaskSeries.find({ weddingId: f.wid }).sort({ _id: 1 }).lean(),
            beforeRules,
          );
          assert.equal((await f.row(f.family)).status, 'ACTIVE');
          assert.equal(
            await MemberRemovalRequest.countDocuments({ weddingId: f.wid }),
            0,
          );
        },
      );
      await t.test(
        'unassignment retains shared people, empty arrays, checklist identity, completed records and old creators',
        async () => {
          originalRequest = await f.request(f.admin, f.family);
          const result = await f.remove(f.admin, originalRequest);
          assert.equal(result.changedTasks, 5);
          assert.equal(result.assignmentRules, 1);
          assert.equal(result.managedRules, 2);
          for (const task of [solo, noDue, copy, checklist]) {
            const saved = await Task.findById(task._id).lean();
            assert.deepEqual(saved.assigneeIds, []);
            assert.equal(String(saved.createdBy), f.family.id);
          }
          assert.deepEqual(
            (await Task.findById(shared._id).lean()).assigneeIds.map(String),
            [f.coadmin.id],
          );
          assert.equal(
            (await Task.findById(copy._id).lean()).occurrenceEdited,
            true,
          );
          assert.deepEqual(
            (await Task.findById(checklist._id).lean()).source,
            checklist.toObject().source,
          );
          assert.deepEqual(
            await Task.find({ _id: { $in: preserved.map((row) => row._id) } })
              .sort({ _id: 1 })
              .lean(),
            untouched,
          );
          assert.equal((await f.row(f.family)).status, 'REMOVED');
          assert.ok(await User.findById(f.family.id));
          assert.equal(
            await Activity.countDocuments({
              weddingId: f.wid,
              action: 'TASK_ASSIGNEES_CHANGED',
            }),
            5,
          );
          assert.equal(
            await Activity.countDocuments({
              weddingId: f.wid,
              action: 'MEMBER_REMOVED',
            }),
            1,
          );
        },
      );
      await t.test(
        'repeat template/manager changes preserve schedule/cursor, stopped/past rules and unrelated retry reasons',
        async () => {
          const changed = await TaskSeries.findById(assignedRule._id).lean(),
            managed = await TaskSeries.findById(managedRule._id).lean();
          assert.deepEqual(changed.template.assigneeIds, []);
          assert.equal(String(changed.updatedBy), f.admin.id);
          assert.equal(String(changed.createdBy), f.family.id);
          assert.equal(changed.nextGenerationDate, '2027-01-30');
          assert.equal(changed.endDate, '2027-05-01');
          assert.equal(changed.generationIssue, null);
          assert.equal(managed.generationIssue, 'EVENT_UNAVAILABLE');
          assert.equal(String(managed.template.assigneeIds[0]), f.viewer.id);
          for (const old of [stopped, past]) {
            const value = await TaskSeries.findById(old._id).lean();
            assert.equal(String(value.updatedBy), f.family.id);
            assert.deepEqual(value.template.assigneeIds.map(String), [
              f.family.id,
            ]);
            assert.equal(value.__v, old.__v);
          }
        },
      );
      await t.test(
        'an existing session stays signed in but loses wedding reads, writes, directory and assignee eligibility',
        async () => {
          const session = await auth.session({
            accessToken: oldSession.accessToken,
          });
          assert.equal(session.wedding, null);
          assert.equal(session.membership, null);
          await assert.rejects(members.list(f.family.id, f.wid), {
            code: 'WEDDING_NOT_FOUND',
          });
          await assert.rejects(
            tasks.create(f.family.id, f.wid, { title: 'Denied' }, randomUUID()),
            { code: 'WEDDING_NOT_FOUND' },
          );
          assert.equal(
            (await tasks.assignees(f.admin.id, f.wid)).members.some(
              (m) => m.id === f.family.id,
            ),
            false,
          );
          assert.equal(
            (await members.list(f.admin.id, f.wid)).members.some(
              (m) => m.userId === f.family.id,
            ),
            false,
          );
          await assert.rejects(f.remove(f.family, originalRequest), {
            code: 'MEMBER_NOT_FOUND',
          });
        },
      );
      await t.test(
        'exact receipt replay does not repeat audits; old invitations cannot restore removed access',
        async () => {
          const before = await Activity.countDocuments({ weddingId: f.wid });
          assert.equal(
            (await f.remove(f.admin, originalRequest)).replayed,
            true,
          );
          assert.equal(
            await Activity.countDocuments({ weddingId: f.wid }),
            before,
          );
          await assert.rejects(
            f.remove(f.admin, {
              ...originalRequest,
              input: {
                ...originalRequest.input,
                policy: 'REASSIGN',
                replacementUserId: f.viewer.id,
              },
            }),
            { code: 'IDEMPOTENCY_CONFLICT' },
          );
          await assert.rejects(
            invitations.accept(
              f.family.id,
              { token: f.originalJoin.token },
              f.originalJoin.key,
            ),
          );
          assert.equal((await f.row(f.family)).status, 'REMOVED');
          await f.issue(f.family);
          assert.equal((await f.row(f.family)).status, 'ACTIVE');
          assert.equal(
            (await f.remove(f.admin, originalRequest)).replayed,
            true,
          );
          assert.equal((await f.row(f.family)).status, 'ACTIVE');
        },
      );
      await t.test(
        'explicit reassignment deduplicates existing recipients and can assign Viewer without granting edit rights',
        async () => {
          const shared = await f.task('Already assigned to recipient', {
              assigneeIds: [f.family.id, f.viewer.id],
            }),
            solo = await f.task('New reassignment');
          const rule = await f.rule('New assignment template', {
            updatedBy: f.admin.id,
            template: {
              title: 'New assignment template',
              priority: 'MEDIUM',
              assigneeIds: [f.family.id, f.viewer.id],
              eventId: null,
            },
          });
          const r = await f.request(f.admin, f.family, {
            policy: 'REASSIGN',
            replacementUserId: f.viewer.id,
          });
          await f.remove(f.admin, r);
          for (const task of [shared, solo])
            assert.deepEqual(
              (await Task.findById(task._id).lean()).assigneeIds.map(String),
              [f.viewer.id],
            );
          assert.deepEqual(
            (
              await TaskSeries.findById(rule._id).lean()
            ).template.assigneeIds.map(String),
            [f.viewer.id],
          );
          assert.equal((await f.row(f.viewer)).role, 'VIEWER');
          await assert.rejects(
            tasks.create(
              f.viewer.id,
              f.wid,
              { title: 'Still denied' },
              randomUUID(),
            ),
            { code: 'FORBIDDEN' },
          );
        },
      );
      await t.test(
        'the sole eligible Admin cannot remove themselves, including a disabled additional Admin',
        async () => {
          const x = await fixture('FAMILY_MEMBER'),
            disabled = await account('InactiveAdmin', { status: 'DISABLED' });
          await WeddingMember.create({
            weddingId: x.wid,
            userId: disabled.id,
            role: 'ADMIN',
            relationship: 'Friend',
            joinedAt: instant,
            createdBy: x.admin.id,
          });
          const r = await x.request(x.admin, x.admin);
          assert.equal(
            (await members.readRemoval(x.admin.id, x.wid, r.memberId))
              .lastAdmin,
            true,
          );
          await assert.rejects(x.remove(x.admin, r), { code: 'LAST_ADMIN' });
        },
      );
      await t.test(
        'concurrent mutual removals keep one Admin and preserve both user accounts',
        async () => {
          const x = await fixture(),
            a = await x.request(x.admin, x.coadmin),
            b = await x.request(x.coadmin, x.admin);
          const result = await Promise.allSettled([
            x.remove(x.admin, a),
            x.remove(x.coadmin, b),
          ]);
          assert.equal(
            result.filter((r) => r.status === 'fulfilled').length,
            1,
          );
          assert.equal(
            await WeddingMember.countDocuments({
              weddingId: x.wid,
              role: 'ADMIN',
              status: 'ACTIVE',
            }),
            1,
          );
          assert.equal(
            await User.countDocuments({
              _id: { $in: [x.admin.id, x.coadmin.id] },
            }),
            2,
          );
        },
      );
      await t.test(
        'a demotion racing with removal cannot remove the final Admin',
        async () => {
          const x = await fixture(),
            remove = await x.request(x.coadmin, x.admin),
            target = await x.row(x.coadmin),
            preview = await members.read(x.admin.id, x.wid, String(target._id));
          const result = await Promise.allSettled([
            x.remove(x.coadmin, remove),
            members.update(
              x.admin.id,
              x.wid,
              String(target._id),
              {
                role: 'FAMILY_MEMBER',
                relationshipChoice: 'Friend',
                preview: preview.preview,
              },
              String(preview.member.version),
              randomUUID(),
            ),
          ]);
          assert.equal(
            result.filter((r) => r.status === 'fulfilled').length,
            1,
          );
          assert.equal(
            await WeddingMember.countDocuments({
              weddingId: x.wid,
              role: 'ADMIN',
              status: 'ACTIVE',
            }),
            1,
          );
        },
      );
      await t.test(
        'self-removal hands repeats to another Admin and retains authentication without receipt access',
        async () => {
          const x = await fixture(),
            own = await x.rule('Own managed schedule', {
              updatedBy: x.admin.id,
              template: {
                title: 'Own managed schedule',
                priority: 'MEDIUM',
                assigneeIds: [x.admin.id],
                eventId: null,
              },
            }),
            r = await x.request(x.admin, x.admin, {
              handoverToUserId: x.coadmin.id,
            });
          const session = await auth.login({ email: x.admin.email, password });
          await x.remove(x.admin, r);
          assert.equal(
            (await auth.session({ accessToken: session.accessToken })).wedding,
            null,
          );
          assert.equal(
            String((await TaskSeries.findById(own._id).lean()).updatedBy),
            x.coadmin.id,
          );
          await assert.rejects(x.remove(x.admin, r), {
            code: 'MEMBER_NOT_FOUND',
          });
        },
      );
      await t.test(
        'worker generation racing with removal preserves new assignment policy and duplicate-free dates',
        async () => {
          const x = await fixture(),
            rule = await x.rule('Concurrent worker removal'),
            r = await x.request(x.admin, x.family);
          const [worker, removal] = await Promise.allSettled([
            tasks.pumpRecurrence(),
            x.remove(x.admin, r),
          ]);
          assert.equal(worker.status, 'fulfilled');
          if (removal.status === 'rejected') {
            assert.equal(removal.reason.code, 'MEMBER_PREVIEW_STALE');
            await x.remove(x.admin, await x.request(x.admin, x.family));
          }
          await tasks.pumpRecurrence();
          const copies = await Task.find({ seriesId: rule._id }).lean();
          assert.ok(copies.length);
          assert.equal(
            new Set(copies.map((r) => r.occurrenceDate)).size,
            copies.length,
          );
          assert.ok(
            copies.every(
              (r) => !r.assigneeIds.map(String).includes(x.family.id),
            ),
          );
          assert.equal(
            String((await TaskSeries.findById(rule._id).lean()).updatedBy),
            x.admin.id,
          );
        },
      );
      await t.test(
        'actual receipt TTL/unique and repeat-assignment indexes are present',
        async () => {
          const indexes = await MemberRemovalRequest.collection.indexes();
          assert.ok(
            indexes.some(
              (i) =>
                i.unique && i.key.weddingId && i.key.userId && i.key.keyHash,
            ),
          );
          assert.ok(
            indexes.some((i) => i.key.expiresAt && i.expireAfterSeconds === 0),
          );
          assert.ok(
            (await TaskSeries.collection.indexes()).some(
              (i) =>
                i.key.weddingId &&
                i.key['template.assigneeIds'] &&
                i.key.endDate,
            ),
          );
          assert.ok((await Wedding.findById(f.wid).lean()).taskRevision > 0);
        },
      );
    } finally {
      if (connection && /^mmm_removal_test_[a-f\d]{16}$/.test(connection.name))
        await connection.dropDatabase();
      await database.close();
    }
  },
);
