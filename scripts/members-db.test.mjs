import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { config } from '../apps/api/src/config.js';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { weddingModels } from '../apps/api/src/weddings/models.js';
import { taskModels } from '../apps/api/src/tasks/models.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';
import { createMemberService } from '../apps/api/src/members/service.js';

test(
  'Atlas member directory: scoped current identities, exact open counts, role privacy and bounded reads',
  { skip: !config.mongodbUri && 'Set private MONGODB_URI for Atlas checks.' },
  async (t) => {
    const dbName = 'mmm_members_test_' + randomBytes(8).toString('hex');
    const database = createAuthDatabase({ ...config, mongodbDbName: dbName });
    let connection;
    try {
      connection = await database.connect();
      const { User } = authModels(connection),
        { Wedding, WeddingMember } = weddingModels(connection),
        { Task } = taskModels(connection);
      const weddings = createWeddingService({ database }),
        members = createMemberService({ database });
      async function account(name, extra = {}) {
        const user = await User.create({
          email: name.toLowerCase() + '@members-test.example.com',
          emailNormalized: name.toLowerCase() + '@members-test.example.com',
          passwordHash: 'disposable-not-used-for-login',
          emailVerifiedAt: new Date(),
          profile: { displayName: name },
          ...extra,
        });
        return String(user._id);
      }
      const admin = await account('Creator'),
        family = await account('Family'),
        viewer = await account('Viewer'),
        secondAdmin = await account('CoAdmin'),
        legacy = await account('Legacy'),
        outsider = await account('Outsider'),
        disabled = await account('Disabled', { status: 'DISABLED' }),
        unverified = await account('Unverified', { emailVerifiedAt: null }),
        removed = await account('Removed');
      const input = {
        name: 'Directory fixture',
        brideName: 'Anya',
        groomName: 'Kabir',
        mainDate: '2028-02-20',
        tradition: 'ODIA',
        location: { city: 'Cuttack', state: 'Odisha', countryCode: 'IN' },
      };
      const wid = (await weddings.create(admin, input, randomUUID())).wedding
        .id;
      const otherWid = (await weddings.create(outsider, input, randomUUID()))
        .wedding.id;
      for (const [userId, role, relationship, status] of [
        [family, 'FAMILY_MEMBER', 'Bride’s father'],
        [viewer, 'VIEWER', 'Groom’s brother'],
        [secondAdmin, 'ADMIN', 'Friend'],
        [legacy, 'FAMILY_MEMBER', null],
        [disabled, 'FAMILY_MEMBER', 'Friend'],
        [unverified, 'VIEWER', 'Friend'],
        [removed, 'VIEWER', 'Friend', 'REMOVED'],
      ])
        await WeddingMember.create({
          weddingId: wid,
          userId,
          role,
          relationship,
          status: status || 'ACTIVE',
          joinedAt: new Date(),
          createdBy: admin,
        });
      async function task(title, patch = {}) {
        return Task.create({
          weddingId: wid,
          title,
          status: 'TODO',
          priority: 'MEDIUM',
          assigneeIds: [family],
          source: { type: 'MANUAL' },
          createdBy: admin,
          updatedBy: admin,
          ...patch,
        });
      }
      await task('Overdue', { dueAt: new Date('2020-01-01') });
      await task('Shared', {
        assigneeIds: [family, viewer],
        status: 'IN_PROGRESS',
      });
      await task('Completed', { status: 'COMPLETED' });
      await task('Deleted', { deletedAt: new Date() });
      await task('Retired', { recurrenceExcluded: true });
      await task('Foreign', {
        weddingId: otherWid,
        createdBy: outsider,
        updatedBy: outsider,
      });
      await task('Unassigned', { assigneeIds: [] });
      await task('Creator future', {
        assigneeIds: [admin],
        dueAt: new Date('2028-01-01'),
      });
      await task('Existing repeat', {
        occurrenceDate: '2028-01-01',
        source: { type: 'RECURRENCE' },
      });
      await task('Duplicate assignee once', { assigneeIds: [family, family] });
      const before = await Task.find({}).sort({ _id: 1 }).lean();
      await t.test(
        'real open counts include overdue/shared/generated tasks and exclude completed/deleted/retired/foreign records',
        async () => {
          const data = await members.list(admin, wid);
          assert.deepEqual(data.counts, {
            ALL: 5,
            ADMIN: 2,
            FAMILY_MEMBER: 2,
            VIEWER: 1,
          });
          const byUser = new Map(data.members.map((m) => [m.userId, m]));
          assert.equal(byUser.get(family).openTaskCount, 4);
          assert.equal(byUser.get(viewer).openTaskCount, 1);
          assert.equal(byUser.get(admin).openTaskCount, 1);
          assert.equal(byUser.get(legacy).openTaskCount, 0);
          assert.equal(byUser.get(admin).isCreator, true);
          assert.equal(byUser.get(admin).relationship, null);
          assert.equal(byUser.get(secondAdmin).isCreator, false);
          assert.equal(byUser.get(secondAdmin).relationship, 'Friend');
          assert.equal(byUser.get(legacy).relationship, null);
        },
      );
      await t.test(
        'Admin sees all eligible emails; Family/Viewer see only their own, even when role-filtering out themselves',
        async () => {
          for (const id of [admin, family, viewer]) {
            const data = await members.list(id, wid);
            for (const member of data.members) {
              assert.equal(
                Object.hasOwn(member, 'email'),
                id === admin || member.userId === id,
              );
              assert.equal(Object.hasOwn(member, 'financeAccess'), false);
              assert.equal(Object.hasOwn(member, 'passwordHash'), false);
            }
          }
          const data = await members.list(viewer, wid, { role: 'ADMIN' });
          assert.ok(data.members.every((row) => !Object.hasOwn(row, 'email')));
        },
      );
      await t.test(
        'role counts stay global while filtered pagination clamps out-of-range pages and sorting has no duplicate rows',
        async () => {
          const one = await members.list(admin, wid, { limit: '2' }),
            two = await members.list(admin, wid, { limit: '2', page: '2' }),
            end = await members.list(admin, wid, { limit: '2', page: '99' });
          assert.equal(
            new Set(
              [...one.members, ...two.members, ...end.members].map((m) => m.id),
            ).size,
            5,
          );
          assert.deepEqual(end.pagination, {
            page: 3,
            limit: 2,
            total: 5,
            totalPages: 3,
          });
          const familyOnly = await members.list(admin, wid, {
            role: 'FAMILY_MEMBER',
            page: '99',
            limit: '1',
          });
          assert.equal(familyOnly.members.length, 1);
          assert.equal(familyOnly.members[0].role, 'FAMILY_MEMBER');
          assert.equal(familyOnly.pagination.page, 2);
          assert.equal(familyOnly.counts.ALL, 5);
        },
      );
      await t.test(
        'each read resolves current role rather than a cached Admin claim',
        async () => {
          await WeddingMember.updateOne(
            { weddingId: wid, userId: secondAdmin },
            { $set: { role: 'VIEWER' } },
          );
          const data = await members.list(secondAdmin, wid);
          assert.ok(
            data.members
              .filter((m) => !m.isYou)
              .every((m) => !Object.hasOwn(m, 'email')),
          );
          await WeddingMember.updateOne(
            { weddingId: wid, userId: secondAdmin },
            { $set: { role: 'ADMIN' } },
          );
        },
      );
      await t.test(
        'outsiders, removed/unverified/disabled requesters and deleted weddings cannot read the directory',
        async () => {
          for (const id of [outsider, removed])
            await assert.rejects(members.list(id, wid), {
              code: 'WEDDING_NOT_FOUND',
            });
          for (const id of [disabled, unverified])
            await assert.rejects(members.list(id, wid), {
              code: 'SESSION_EXPIRED',
            });
          await Wedding.updateOne(
            { _id: wid },
            { $set: { deletedAt: new Date() } },
          );
          await assert.rejects(members.list(admin, wid), {
            code: 'WEDDING_NOT_FOUND',
          });
          await Wedding.updateOne({ _id: wid }, { $set: { deletedAt: null } });
        },
      );
      await t.test(
        'empty-role pages are honest and directory reads never mutate tasks or membership versions',
        async () => {
          await WeddingMember.updateOne(
            { weddingId: wid, userId: viewer },
            { $set: { role: 'FAMILY_MEMBER' } },
          );
          const data = await members.list(admin, wid, {
            role: 'VIEWER',
            page: '9',
          });
          assert.deepEqual(data.members, []);
          assert.equal(data.pagination.total, 0);
          assert.equal(data.pagination.page, 1);
          assert.deepEqual(await Task.find({}).sort({ _id: 1 }).lean(), before);
          assert.ok(
            (await WeddingMember.find({ weddingId: wid }).lean()).every(
              (m) => m.__v === 0,
            ),
          );
        },
      );
    } finally {
      if (connection && connection.name === dbName)
        await connection.dropDatabase();
      await database.close();
    }
  },
);
