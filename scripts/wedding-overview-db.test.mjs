import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { weddingModels } from '../apps/api/src/weddings/models.js';
import { taskModels } from '../apps/api/src/tasks/models.js';
import { eventModels } from '../apps/api/src/events/models.js';
import { invitationModels } from '../apps/api/src/invitations/models.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';

const uri = process.env.MONGODB_SETTINGS_TEST_URI;
test(
  'isolated Settings overview counts and current permission boundaries',
  { skip: !uri && 'Set an isolated loopback MONGODB_SETTINGS_TEST_URI.' },
  async (t) => {
    assert.match(
      uri,
      /^mongodb:\/\/127\.0\.0\.1:\d+\/\?replicaSet=[a-zA-Z0-9_-]+$/,
    );
    const tag = 'mmm-test-overview-' + randomBytes(6).toString('hex');
    const database = createAuthDatabase({
      mongodbUri: uri,
      mongodbDbName: tag,
    });
    const instant = new Date('2027-01-01T12:00:00Z');
    const service = createWeddingService({ database, now: () => instant });
    try {
      const connection = await database.connect();
      const { User } = authModels(connection),
        { Wedding, WeddingMember } = weddingModels(connection);
      const { Task } = taskModels(connection),
        { Event } = eventModels(connection),
        { MemberInvitation } = invitationModels(connection);
      const users = [];
      for (let i = 0; i < 7; i++)
        users.push(
          await User.create({
            email: `${tag}-${i}@example.test`,
            emailNormalized: `${tag}-${i}@example.test`,
            passwordHash: 'fixture',
            profile: { displayName: 'Overview fixture ' + i },
            emailVerifiedAt: i === 5 ? null : instant,
            status: i === 4 ? 'DISABLED' : 'ACTIVE',
          }),
        );
      const wedding = await Wedding.create({
        name: 'Overview fixture',
        brideName: 'Anya',
        groomName: 'Kabir',
        slug: tag,
        mainDate: '2027-02-20',
        tradition: 'ODIA',
        location: { city: 'Puri', state: 'Odisha', countryCode: 'IN' },
        createdBy: users[0]._id,
      });
      for (const i of [0, 1, 2, 4, 5, 6])
        await WeddingMember.create({
          weddingId: wedding._id,
          userId: users[i]._id,
          role: i === 0 ? 'ADMIN' : i === 2 ? 'VIEWER' : 'FAMILY_MEMBER',
          status: i === 6 ? 'REMOVED' : 'ACTIVE',
          relationship: 'Friend',
          joinedAt: instant,
          createdBy: users[0]._id,
        });
      const id = String(wedding._id),
        uid = (i) => String(users[i]._id);
      t.diagnostic(
        JSON.stringify({
          tag,
          wedding: id,
          users: users.map((u) => String(u._id)),
        }),
      );
      await t.test(
        'empty tasks resolve to zero without exposing private records',
        async () => {
          const result = await service.overview(uid(0), id);
          assert.deepEqual(result, {
            role: 'ADMIN',
            collaborators: 3,
            ceremonies: 0,
            tasks: { total: 0, completed: 0, progress: 0 },
            pendingInvites: 0,
          });
        },
      );
      for (const [i, status, deletedAt, recurrenceExcluded] of [
        [0, 'TODO', null, false],
        [1, 'IN_PROGRESS', null, false],
        [2, 'COMPLETED', null, false],
        [3, 'TODO', instant, false],
        [4, 'TODO', null, true],
      ])
        await Task.create({
          weddingId: wedding._id,
          title: 'Private fixture task ' + i,
          status,
          deletedAt,
          recurrenceExcluded,
          source: { type: 'MANUAL' },
          createdBy: users[0]._id,
          updatedBy: users[0]._id,
        });
      const eventBase = {
        weddingId: wedding._id,
        name: 'Fixture ceremony',
        type: 'HALDI',
        createdBy: users[0]._id,
        updatedBy: users[0]._id,
      };
      for (const [status, start, end, deletedAt] of [
        ['PLANNED', 1, 2, null],
        ['CONFIRMED', -1, 1, null],
        ['CONFIRMED', -1, 0, null],
        ['PLANNED', -2, -1, null],
        ['COMPLETED', -1, 1, null],
        ['CANCELLED', 1, 2, null],
        ['PLANNED', 1, 2, instant],
      ])
        await Event.create({
          ...eventBase,
          status,
          startAt: new Date(+instant + start * 3600000),
          endAt: new Date(+instant + end * 3600000),
          deletedAt,
        });
      for (const [i, status, delta] of [
        [0, 'PENDING', 1],
        [1, 'PENDING', -1],
        [2, 'ACCEPTED', 1],
        [3, 'DECLINED', 1],
        [4, 'REVOKED', 1],
      ])
        await MemberInvitation.create({
          weddingId: wedding._id,
          email: `${tag}-invite-${i}@example.test`,
          emailNormalized: `${tag}-invite-${i}@example.test`,
          role: 'FAMILY_MEMBER',
          relationship: 'Friend',
          tokenHash: tag + i,
          nonce: tag + i,
          invitedBy: users[0]._id,
          status,
          expiresAt: new Date(+instant + delta * 3600000),
          lastSentAt: instant,
        });
      await t.test(
        'real totals exclude expired invitations, deleted/retired tasks, past/completed/cancelled ceremonies and ineligible members',
        async () => {
          const result = await service.overview(uid(0), id);
          assert.deepEqual(result, {
            role: 'ADMIN',
            collaborators: 3,
            ceremonies: 3,
            tasks: { total: 3, completed: 1, progress: 33 },
            pendingInvites: 1,
          });
          assert.doesNotMatch(
            JSON.stringify(result),
            /email|token|Private fixture|nonce|password|budget/i,
          );
        },
      );
      await t.test(
        'Family and Viewer receive no invitation count; current demotion changes the projection',
        async () => {
          for (const i of [1, 2])
            assert.equal(
              Object.hasOwn(
                await service.overview(uid(i), id),
                'pendingInvites',
              ),
              false,
            );
          await WeddingMember.updateOne(
            { userId: users[0]._id },
            { $set: { role: 'VIEWER' } },
          );
          const result = await service.overview(uid(0), id);
          assert.equal(result.role, 'VIEWER');
          assert.equal(Object.hasOwn(result, 'pendingInvites'), false);
        },
      );
      await t.test(
        'outsiders, removed/disabled/unverified accounts and deleted weddings are denied',
        async () => {
          for (const i of [3, 6])
            await assert.rejects(service.overview(uid(i), id), { status: 404 });
          for (const i of [4, 5])
            await assert.rejects(service.overview(uid(i), id), { status: 401 });
          await Wedding.updateOne(
            { _id: wedding._id },
            { $set: { deletedAt: instant } },
          );
          await assert.rejects(service.overview(uid(1), id), { status: 404 });
          await assert.rejects(service.overview(uid(1), 'invalid'), {
            status: 404,
          });
        },
      );
    } finally {
      await database.close();
      t.diagnostic(`Retained tagged fixtures in ${tag}; clients closed.`);
    }
  },
);
