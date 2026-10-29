import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { config } from '../apps/api/src/config.js';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { weddingModels } from '../apps/api/src/weddings/models.js';
import { taskModels } from '../apps/api/src/tasks/models.js';
import { eventModels } from '../apps/api/src/events/models.js';
import { memberModels } from '../apps/api/src/members/models.js';
import { invitationModels } from '../apps/api/src/invitations/models.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';
import { createMemberService } from '../apps/api/src/members/service.js';
import { createTaskService } from '../apps/api/src/tasks/service.js';
import { createAuthService } from '../apps/api/src/auth/service.js';
import argon2 from 'argon2';

test(
  'Atlas member changes: role integrity, explicit handover, atomic history and safe retries',
  { skip: !config.mongodbUri && 'Set private MONGODB_URI for Atlas checks.' },
  async (t) => {
    const dbName = 'mmm_roles_test_' + randomBytes(8).toString('hex');
    const settings = {
      ...config,
      mongodbDbName: dbName,
      jwtSecret: randomBytes(48).toString('base64url'),
    };
    const database = createAuthDatabase(settings),
      instant = new Date('2027-01-30T06:00:00Z');
    let connection;
    try {
      connection = await database.connect();
      const { User } = authModels(connection),
        { Wedding, WeddingMember } = weddingModels(connection),
        { Task, TaskSeries } = taskModels(connection),
        { Activity } = eventModels(connection),
        { MemberWriteRequest } = memberModels(connection);
      const weddings = createWeddingService({ database, now: () => instant }),
        members = createMemberService({
          database,
          settings,
          now: () => instant,
        }),
        tasks = createTaskService({ database, now: () => instant });
      const password = 'DisposableOnly42',
        passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      async function account(name, patch = {}) {
        const user = await User.create({
          email: name.toLowerCase() + '@member-changes.example.com',
          emailNormalized: name.toLowerCase() + '@member-changes.example.com',
          passwordHash,
          emailVerifiedAt: instant,
          profile: { displayName: name },
          ...patch,
        });
        return String(user._id);
      }
      const admin = await account('Creator'),
        coadmin = await account('CoAdmin'),
        family = await account('Family'),
        viewer = await account('Viewer'),
        outsider = await account('Outsider'),
        disabled = await account('Disabled', { status: 'DISABLED' });
      const weddingInput = {
        name: 'Member changes fixture',
        brideName: 'Anya',
        groomName: 'Kabir',
        mainDate: '2028-02-20',
        tradition: 'ODIA',
        location: { city: 'Cuttack', state: 'Odisha', countryCode: 'IN' },
      };
      const wid = (await weddings.create(admin, weddingInput, randomUUID()))
          .wedding.id,
        otherWid = (await weddings.create(outsider, weddingInput, randomUUID()))
          .wedding.id;
      for (const [userId, role] of [
        [coadmin, 'ADMIN'],
        [family, 'FAMILY_MEMBER'],
        [viewer, 'VIEWER'],
        [disabled, 'ADMIN'],
      ])
        await WeddingMember.create({
          weddingId: wid,
          userId,
          role,
          relationship: 'Friend',
          joinedAt: instant,
          createdBy: admin,
        });
      const membership = async (userId) =>
        WeddingMember.findOne({ weddingId: wid, userId }).lean();
      async function request(actor, userId, patch = {}) {
        const member = await membership(userId),
          preview = await members.read(actor, wid, String(member._id));
        return {
          memberId: String(member._id),
          version: String(preview.member.version),
          key: randomUUID(),
          input: {
            role: preview.member.role,
            relationshipChoice: preview.member.isCreator
              ? ''
              : preview.member.relationship || 'Friend',
            customRelationship: '',
            preview: preview.preview,
            ...patch,
          },
        };
      }
      const submit = (actor, r) =>
        members.update(actor, wid, r.memberId, r.input, r.version, r.key);
      const auth = createAuthService({
        database,
        settings,
        now: () => instant,
        sendVerification: async () => {},
        getWeddingContext: weddings.current,
      });
      const existingSession = await auth.login({
        email: 'family@member-changes.example.com',
        password,
      });
      await t.test(
        'only current active Admins preview; tenant and disabled-account boundaries apply',
        async () => {
          const id = String((await membership(family))._id),
            data = await members.read(admin, wid, id);
          assert.equal(data.adminCount, 2);
          assert.equal(data.member.name, 'Family');
          for (const actor of [family, viewer])
            await assert.rejects(members.read(actor, wid, id), {
              code: 'ADMIN_REQUIRED',
            });
          await assert.rejects(members.read(outsider, wid, id), {
            code: 'MEMBER_NOT_FOUND',
          });
          await assert.rejects(members.read(admin, otherWid, id), {
            code: 'MEMBER_NOT_FOUND',
          });
          assert.equal(JSON.stringify(data).includes('@'), false);
          assert.equal(Object.hasOwn(data.member, 'financeAccess'), false);
        },
      );
      await t.test(
        'relationship edits preserve roles, require Other content and keep the creator exempt',
        async () => {
          const invalid = await request(admin, family, {
            relationshipChoice: 'OTHER',
            customRelationship: '',
          });
          await assert.rejects(submit(admin, invalid), {
            code: 'VALIDATION_ERROR',
          });
          const r = await request(admin, family, {
            relationshipChoice: 'OTHER',
            customRelationship: 'Bride’s cousin',
          });
          assert.equal((await submit(admin, r)).role, 'FAMILY_MEMBER');
          assert.equal(
            (await membership(family)).relationship,
            'Bride’s cousin',
          );
          const creator = await request(admin, admin, {
            relationshipChoice: 'Friend',
            role: 'FAMILY_MEMBER',
          });
          await assert.rejects(submit(admin, creator), {
            code: 'VALIDATION_ERROR',
          });
          const audit = await Activity.findOne({
            action: 'MEMBER_UPDATED',
          }).lean();
          assert.equal(audit.memberChange.toRelationship, 'Bride’s cousin');
          assert.equal(audit.memberChange.fromRole, 'FAMILY_MEMBER');
        },
      );
      await t.test(
        'unchanged receipt replay is duplicate-safe, while changed payloads cannot reuse keys',
        async () => {
          const r = await request(admin, family, {
            role: 'ADMIN',
            relationshipChoice: 'Friend',
          });
          await submit(admin, r);
          const before = await Activity.countDocuments({
            action: 'MEMBER_UPDATED',
          });
          assert.equal((await submit(admin, r)).replayed, true);
          assert.equal(
            await Activity.countDocuments({ action: 'MEMBER_UPDATED' }),
            before,
          );
          await assert.rejects(
            submit(admin, { ...r, input: { ...r.input, role: 'VIEWER' } }),
            { code: 'IDEMPOTENCY_CONFLICT' },
          );
          await submit(
            admin,
            await request(admin, family, { role: 'FAMILY_MEMBER' }),
          );
        },
      );
      await t.test(
        'stale member and task-impact previews require new confirmation',
        async () => {
          const r = await request(admin, family, { role: 'VIEWER' });
          await tasks.create(
            admin,
            wid,
            { title: 'Concurrent assignment', assigneeIds: [family] },
            randomUUID(),
          );
          await assert.rejects(submit(admin, r), {
            code: 'MEMBER_PREVIEW_STALE',
          });
          const current = await request(admin, family, { role: 'VIEWER' });
          await WeddingMember.updateOne(
            { _id: current.memberId },
            { $inc: { __v: 1 } },
          );
          await assert.rejects(submit(admin, current), {
            code: 'MEMBER_PREVIEW_STALE',
          });
        },
      );
      async function series(title, patch = {}) {
        return TaskSeries.create({
          weddingId: wid,
          frequency: 'DAILY',
          interval: 1,
          startDate: '2027-01-30',
          endDate: '2027-02-01',
          time: '10:00',
          template: {
            title,
            priority: 'MEDIUM',
            assigneeIds: [family],
            eventId: null,
          },
          nextGenerationDate: '2027-01-30',
          createdBy: family,
          updatedBy: family,
          ...patch,
        });
      }
      const repeat = await series('Daily coordination', {
          generationIssue: 'OWNER_UNAVAILABLE',
          retryAt: new Date('2027-02-10'),
        }),
        dependency = await series('Unresolved dependency', {
          generationIssue: 'EVENT_UNAVAILABLE',
          retryAt: new Date('2027-02-10'),
        }),
        stopped = await series('Stopped', { active: false }),
        past = await series('Past', { endDate: '2027-01-29' });
      await Task.create({
        weddingId: wid,
        title: 'Completed historical copy',
        status: 'COMPLETED',
        assigneeIds: [family, coadmin],
        source: { type: 'RECURRENCE' },
        seriesId: repeat._id,
        occurrenceDate: '2027-01-29',
        createdBy: family,
        updatedBy: family,
        completedAt: instant,
        completedBy: family,
      });
      const beforeTasks = await Task.find({}).sort({ _id: 1 }).lean(),
        beforeSeries = await TaskSeries.find({}).sort({ _id: 1 }).lean();
      await t.test(
        'Viewer demotion requires explicit eligible handover and preserves tasks/schedules',
        async () => {
          const noHandover = await request(admin, family, { role: 'VIEWER' });
          const preview = await members.read(admin, wid, noHandover.memberId);
          assert.equal(preview.managedRepeats.count, 2);
          assert.equal(preview.openTaskCount, 1);
          assert.equal(preview.handoverCandidates[0].userId, admin);
          await assert.rejects(submit(admin, noHandover), {
            code: 'HANDOVER_REQUIRED',
          });
          await assert.rejects(
            submit(admin, {
              ...noHandover,
              input: {
                ...noHandover.input,
                confirmHandover: true,
                handoverToUserId: family,
              },
            }),
            { code: 'HANDOVER_REQUIRED' },
          );
          await assert.rejects(
            submit(admin, {
              ...noHandover,
              input: {
                ...noHandover.input,
                confirmHandover: true,
                handoverToUserId: viewer,
              },
            }),
            { code: 'MEMBER_PREVIEW_STALE' },
          );
          const result = await submit(admin, {
            ...noHandover,
            input: {
              ...noHandover.input,
              confirmHandover: true,
              handoverToUserId: admin,
            },
          });
          assert.equal(result.transferredRepeats, 2);
          assert.deepEqual(
            await Task.find({}).sort({ _id: 1 }).lean(),
            beforeTasks,
          );
          const after = await TaskSeries.find({}).sort({ _id: 1 }).lean();
          for (let i = 0; i < after.length; i++) {
            const old = beforeSeries[i],
              value = after[i],
              untouched = [String(stopped._id), String(past._id)].includes(
                String(value._id),
              );
            for (const field of [
              'frequency',
              'interval',
              'startDate',
              'endDate',
              'time',
              'template',
              'nextGenerationDate',
              'createdBy',
              'active',
            ])
              assert.deepEqual(value[field], old[field]);
            assert.equal(String(value.updatedBy), untouched ? family : admin);
          }
          assert.equal(
            (await TaskSeries.findById(repeat._id).lean()).generationIssue,
            null,
          );
          assert.equal(
            (await TaskSeries.findById(dependency._id).lean()).generationIssue,
            'EVENT_UNAVAILABLE',
          );
          assert.equal(
            (
              await TaskSeries.findById(dependency._id).lean()
            ).retryAt.toISOString(),
            '2027-02-10T00:00:00.000Z',
          );
        },
      );
      await t.test(
        'current sessions and task writes immediately observe Viewer permissions',
        async () => {
          assert.equal(
            (await auth.session({ accessToken: existingSession.accessToken }))
              .membership.role,
            'VIEWER',
          );
          await assert.rejects(
            tasks.create(
              family,
              wid,
              { title: 'Forbidden Viewer edit' },
              randomUUID(),
            ),
            { code: 'FORBIDDEN' },
          );
          await tasks.pumpRecurrence();
          assert.equal(
            await Task.countDocuments({
              seriesId: repeat._id,
              occurrenceDate: '2027-01-30',
            }),
            1,
          );
          assert.equal(
            String((await TaskSeries.findById(repeat._id).lean()).updatedBy),
            admin,
          );
        },
      );
      await t.test(
        'audit failure rolls back membership, handover and receipt together',
        async () => {
          await submit(
            admin,
            await request(admin, family, { role: 'FAMILY_MEMBER' }),
          );
          const rollbackRule = await series('Rollback rule'),
            r = await request(admin, family, {
              role: 'VIEWER',
              confirmHandover: true,
              handoverToUserId: admin,
            });
          const before = await membership(family),
            count = await MemberWriteRequest.countDocuments({}),
            original = Activity.create;
          Activity.create = async () => {
            throw new Error('Injected audit failure');
          };
          try {
            await assert.rejects(submit(admin, r), {
              code: 'MEMBER_CHANGE_UNAVAILABLE',
            });
          } finally {
            Activity.create = original;
          }
          assert.deepEqual(await membership(family), before);
          assert.equal(
            String(
              (await TaskSeries.findById(rollbackRule._id).lean()).updatedBy,
            ),
            family,
          );
          assert.equal(await MemberWriteRequest.countDocuments({}), count);
        },
      );
      await t.test(
        'repeat generation racing with handover retries safely without duplicate occurrences',
        async () => {
          const rule = await series('Concurrent worker handover', {
            template: {
              title: 'Concurrent worker handover',
              priority: 'MEDIUM',
              assigneeIds: [],
              eventId: null,
            },
          });
          const r = await request(admin, family, {
            role: 'VIEWER',
            confirmHandover: true,
            handoverToUserId: admin,
          });
          const [worker, change] = await Promise.allSettled([
            tasks.pumpRecurrence(),
            submit(admin, r),
          ]);
          assert.equal(worker.status, 'fulfilled');
          if (change.status === 'rejected') {
            assert.equal(change.reason.code, 'MEMBER_PREVIEW_STALE');
            await submit(
              admin,
              await request(admin, family, {
                role: 'VIEWER',
                confirmHandover: true,
                handoverToUserId: admin,
              }),
            );
          }
          await tasks.pumpRecurrence();
          assert.equal(
            String((await TaskSeries.findById(rule._id).lean()).updatedBy),
            admin,
          );
          const copies = await Task.find({ seriesId: rule._id }).lean();
          assert.ok(copies.length > 0);
          assert.equal(
            new Set(copies.map((row) => row.occurrenceDate)).size,
            copies.length,
          );
        },
      );
      await t.test(
        'Admin demotion previews pending invitation impact without silently transferring issuer authority',
        async () => {
          await invitationModels(connection).MemberInvitation.create({
            weddingId: wid,
            email: 'pending@example.com',
            emailNormalized: 'pending@example.com',
            role: 'VIEWER',
            relationship: 'Friend',
            tokenHash: randomBytes(32).toString('hex'),
            nonce: randomBytes(32).toString('base64url'),
            expiresAt: new Date(instant.getTime() + 86400000),
            invitedBy: coadmin,
            lastSentAt: instant,
          });
          const r = await request(admin, coadmin, { role: 'FAMILY_MEMBER' });
          assert.equal(
            (await members.read(admin, wid, r.memberId)).pendingInvitations,
            1,
          );
          await submit(admin, r);
          assert.equal(
            String(
              (
                await invitationModels(connection)
                  .MemberInvitation.findOne({ weddingId: wid })
                  .lean()
              ).invitedBy,
            ),
            coadmin,
          );
          await submit(admin, await request(admin, coadmin, { role: 'ADMIN' }));
        },
      );
      await t.test(
        'simultaneous self-demotions cannot remove both remaining eligible Admins',
        async () => {
          const a = await request(admin, admin, { role: 'FAMILY_MEMBER' }),
            b = await request(coadmin, coadmin, { role: 'FAMILY_MEMBER' });
          const results = await Promise.allSettled([
            submit(admin, a),
            submit(coadmin, b),
          ]);
          assert.equal(
            results.filter((r) => r.status === 'fulfilled').length,
            1,
          );
          assert.ok(
            ['MEMBER_PREVIEW_STALE', 'LAST_ADMIN'].includes(
              results.find((r) => r.status === 'rejected').reason.code,
            ),
          );
          const demoted = results[0].status === 'fulfilled' ? admin : coadmin,
            remaining = demoted === admin ? coadmin : admin,
            original = demoted === admin ? a : b;
          assert.equal((await submit(demoted, original)).replayed, true);
          await assert.rejects(
            submit(demoted, { ...original, key: randomUUID() }),
            { code: 'ADMIN_REQUIRED' },
          );
          await assert.rejects(
            submit(
              remaining,
              await request(remaining, remaining, { role: 'FAMILY_MEMBER' }),
            ),
            { code: 'LAST_ADMIN' },
          );
          assert.equal(
            await WeddingMember.countDocuments({
              weddingId: wid,
              role: 'ADMIN',
              userId: { $in: [admin, coadmin] },
            }),
            1,
          );
          await WeddingMember.updateOne(
            { weddingId: wid, userId: demoted },
            { $set: { status: 'REMOVED' } },
          );
          await assert.rejects(submit(demoted, original), {
            code: 'MEMBER_NOT_FOUND',
          });
        },
      );
      await t.test(
        'receipt TTL/uniqueness and repeat-manager query index exist in Atlas',
        async () => {
          const indexes = await MemberWriteRequest.collection.indexes();
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
                i.key.updatedBy &&
                i.key.active &&
                i.key.endDate,
            ),
          );
          assert.ok((await Wedding.findById(wid).lean()).memberRevision > 0);
        },
      );
    } finally {
      if (connection && /^mmm_roles_test_[a-f\d]{16}$/.test(connection.name))
        await connection.dropDatabase();
      await database.close();
    }
  },
);
