import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { authModels } from '../apps/api/src/auth/models.js';
import {
  weddingModels,
  weddingLifecycleRequestModel,
} from '../apps/api/src/weddings/models.js';
import { invitationModels } from '../apps/api/src/invitations/models.js';
import { mediaModel } from '../apps/api/src/media/models.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';
import {
  RECOVERY_MS,
  changeLifecycle,
} from '../apps/api/src/weddings/lifecycle.js';

const uri = process.env.MONGODB_LIFECYCLE_TEST_URI;
test(
  'isolated wedding lifecycle, retries, reservation, expiry and bounded purge',
  { skip: !uri && 'Set a dedicated loopback replica-set URI.' },
  async (t) => {
    assert.match(
      uri,
      /^mongodb:\/\/127\.0\.0\.1:\d+\/\?replicaSet=[a-zA-Z0-9_-]+$/,
    );
    const tag = 'mmm-test-lifecycle-' + randomBytes(6).toString('hex');
    const database = createAuthDatabase({
      mongodbUri: uri,
      mongodbDbName: tag,
    });
    let instant = new Date('2026-11-15T18:30:00Z'),
      storageFails = true;
    const removed = [];
    const service = createWeddingService({
      database,
      now: () => instant,
      storage: {
        async remove(asset) {
          if (storageFails) throw new Error('Simulated R2 failure');
          removed.push(String(asset._id));
        },
        close() {},
      },
    });
    let connection;
    try {
      connection = await database.connect();
      assert.ok(connection.models.WeddingLifecycleRequest);
      assert.deepEqual(
        (await connection.db.collection('weddingLifecycleRequests').indexes())
          .map((i) => i.name)
          .sort(),
        ['_id_', 'expiresAt_1', 'weddingId_1_userId_1_keyHash_1'],
      );
      const { User } = authModels(connection),
        { Wedding, WeddingMember } = weddingModels(connection),
        WeddingLifecycleRequest = weddingLifecycleRequestModel(connection),
        { MemberInvitation } = invitationModels(connection),
        Media = mediaModel(connection);
      const users = [];
      for (let i = 0; i < 5; i++)
        users.push(
          await User.create({
            email: `${tag}-${i}@example.test`,
            emailNormalized: `${tag}-${i}@example.test`,
            profile: { displayName: 'Lifecycle Fixture ' + i },
            passwordHash: 'fixture',
            emailVerifiedAt: instant,
          }),
        );
      const root = await Wedding.create({
        name: 'Lifecycle fixture',
        brideName: 'Asha',
        groomName: 'Rahul',
        slug: tag,
        mainDate: '2029-01-01',
        tradition: 'ODIA',
        createdBy: users[0]._id,
      });
      const wid = String(root._id),
        actor = String(users[0]._id),
        second = String(users[1]._id);
      for (const [i, role] of [
        'ADMIN',
        'ADMIN',
        'FAMILY_MEMBER',
        'VIEWER',
      ].entries())
        await WeddingMember.create({
          weddingId: root._id,
          userId: users[i]._id,
          role,
          joinedAt: instant,
          createdBy: users[0]._id,
          relationship: i ? 'Friend' : null,
        });
      const invitation = await MemberInvitation.create({
        weddingId: root._id,
        email: `${tag}-pending@example.test`,
        emailNormalized: `${tag}-pending@example.test`,
        role: 'VIEWER',
        relationship: 'Friend',
        tokenHash: tag,
        nonce: tag,
        expiresAt: new Date(+instant + RECOVERY_MS),
        invitedBy: users[0]._id,
        lastSentAt: instant,
      });
      await connection.collection('tasks').insertOne({
        weddingId: root._id,
        title: tag,
        status: 'TODO',
        deletedAt: null,
      });
      await t.test(
        'current roles, outsiders and stale versions are enforced',
        async () => {
          for (const index of [2, 3])
            await assert.rejects(
              service.delete(
                String(users[index]._id),
                wid,
                { confirmation: 'DELETE' },
                '"0"',
                randomUUID(),
              ),
              { code: 'ADMIN_REQUIRED' },
            );
          await assert.rejects(service.lifecycle(String(users[4]._id), wid), {
            code: 'WEDDING_NOT_FOUND',
          });
          await assert.rejects(
            service.delete(
              actor,
              wid,
              { confirmation: 'DELETE' },
              '"99"',
              randomUUID(),
            ),
            { code: 'VERSION_CONFLICT' },
          );
          assert.equal(await WeddingLifecycleRequest.countDocuments({}), 0);
        },
      );
      let key = randomUUID(),
        deleteActor = actor;
      const otherKey = randomUUID();
      let deleted;
      await t.test(
        'atomic deletion cancels invitations, preserves data and reserves every membership',
        async () => {
          const values = await Promise.allSettled([
            service.delete(actor, wid, { confirmation: 'DELETE' }, '"0"', key),
            service.delete(
              second,
              wid,
              { confirmation: 'DELETE' },
              '"0"',
              otherKey,
            ),
          ]);
          assert.equal(
            values.filter((v) => v.status === 'fulfilled').length,
            1,
          );
          if (values[0].status !== 'fulfilled') {
            key = otherKey;
            deleteActor = second;
          }
          deleted = values.find((value) => value.status === 'fulfilled').value
            .lifecycle;
          assert.equal(+new Date(deleted.purgeAfter), +instant + RECOVERY_MS);
          assert.equal(
            (await MemberInvitation.findById(invitation._id).lean()).status,
            'REVOKED',
          );
          assert.equal(
            await connection
              .collection('tasks')
              .countDocuments({ weddingId: root._id }),
            1,
          );
          assert.equal(
            await WeddingMember.countDocuments({
              weddingId: root._id,
              status: 'ACTIVE',
            }),
            4,
          );
          for (const user of users.slice(0, 4)) {
            const context = await service.current(String(user._id));
            assert.equal(context.wedding, null);
            assert.equal(context.recovery.id, wid);
          }
          await assert.rejects(service.read(actor, wid), {
            code: 'WEDDING_NOT_FOUND',
          });
          await assert.rejects(
            service.create(
              String(users[2]._id),
              {
                name: 'Other Wedding',
                brideName: 'Asha',
                groomName: 'Rahul',
                mainDate: '2029-01-01',
                tradition: 'ODIA',
                location: { city: 'Puri', state: 'Odisha', countryCode: 'IN' },
              },
              randomUUID(),
            ),
            {
              code: 'WEDDING_ALREADY_EXISTS',
              message:
                'Your wedding is scheduled for deletion. Open wedding recovery before creating another wedding.',
              details: { recoveryRequired: true },
            },
          );
        },
      );
      await t.test(
        'result lookup is authorized, exact, private and read-only, with absence remaining unconfirmed',
        async () => {
          const snapshot = async () =>
            Promise.all(
              [
                'users',
                'weddings',
                'weddingMembers',
                'weddingLifecycleRequests',
                'activities',
                'memberInvitations',
              ].map((name) =>
                connection.collection(name).find({}).sort({ _id: 1 }).toArray(),
              ),
            );
          const before = await snapshot();
          const input = { action: 'DELETE', body: { confirmation: 'DELETE' } };
          const result = await service.lifecycleResult(
            deleteActor,
            wid,
            input,
            '"0"',
            key,
          );
          assert.equal(result.confirmed, true);
          assert.equal(result.lifecycle.state, 'RECOVERABLE');
          assert.deepEqual(Object.keys(result).sort(), [
            'confirmed',
            'lifecycle',
          ]);
          assert.equal('keyHash' in result, false);
          assert.equal('requestHash' in result, false);
          assert.deepEqual(
            await service.lifecycleResult(
              deleteActor,
              wid,
              input,
              '"0"',
              randomUUID(),
            ),
            { confirmed: false },
          );
          const otherAdmin = deleteActor === actor ? second : actor;
          assert.deepEqual(
            await service.lifecycleResult(otherAdmin, wid, input, '"0"', key),
            { confirmed: false },
          );
          await assert.rejects(
            service.lifecycleResult(deleteActor, wid, input, '"1"', key),
            { code: 'IDEMPOTENCY_CONFLICT' },
          );
          await assert.rejects(
            service.lifecycleResult(
              deleteActor,
              wid,
              { action: 'RESTORE', body: {} },
              '"0"',
              key,
            ),
            { code: 'IDEMPOTENCY_CONFLICT' },
          );
          for (const index of [2, 3])
            await assert.rejects(
              service.lifecycleResult(
                String(users[index]._id),
                wid,
                input,
                '"0"',
                key,
              ),
              { code: 'ADMIN_REQUIRED' },
            );
          await assert.rejects(
            service.lifecycleResult(
              String(users[4]._id),
              wid,
              input,
              '"0"',
              key,
            ),
            { code: 'WEDDING_NOT_FOUND' },
          );
          const previous = instant;
          instant = new Date(+instant + 86400001);
          try {
            assert.deepEqual(
              await service.lifecycleResult(
                deleteActor,
                wid,
                input,
                '"0"',
                key,
              ),
              { confirmed: false },
            );
          } finally {
            instant = previous;
          }
          assert.deepEqual(
            await snapshot(),
            before,
            'result checks must not update users/members/root/audits/receipts/invitations',
          );
        },
      );
      const restoreKey = randomUUID();
      await t.test(
        'another Admin restores; old delete replay returns current state without deleting again',
        async () => {
          const restored = await service.restore(
            second,
            wid,
            {},
            '"1"',
            restoreKey,
          );
          assert.equal(restored.lifecycle.state, 'ACTIVE');
          const replay = await service.delete(
            deleteActor,
            wid,
            { confirmation: 'DELETE' },
            '"0"',
            key,
          );
          assert.equal(replay.replayed, true);
          assert.equal(replay.lifecycle.state, 'ACTIVE');
          const confirmed = await service.lifecycleResult(
            deleteActor,
            wid,
            { action: 'DELETE', body: { confirmation: 'DELETE' } },
            '"0"',
            key,
          );
          assert.equal(confirmed.confirmed, true);
          assert.equal(confirmed.lifecycle.state, 'ACTIVE');

          assert.equal(
            (await MemberInvitation.findById(invitation._id)).status,
            'REVOKED',
          );
          assert.equal(
            await connection
              .collection('tasks')
              .countDocuments({ weddingId: root._id }),
            1,
          );
        },
      );
      await t.test(
        'a failed final receipt write rolls back deletion, invitations and history',
        async () => {
          const fresh = await MemberInvitation.create({
            weddingId: root._id,
            email: `${tag}-second@example.test`,
            emailNormalized: `${tag}-second@example.test`,
            role: 'VIEWER',
            relationship: 'Friend',
            tokenHash: tag + '2',
            nonce: tag + '2',
            expiresAt: new Date(+instant + RECOVERY_MS),
            invitedBy: users[0]._id,
            lastSentAt: instant,
          });
          await connection.db.command({
            collMod: 'weddingLifecycleRequests',
            validator: { impossible: { $exists: true } },
            validationLevel: 'strict',
            validationAction: 'error',
          });
          await assert.rejects(
            changeLifecycle(
              { database, now: () => instant },
              'DELETE',
              actor,
              wid,
              { confirmation: 'DELETE' },
              '"2"',
              randomUUID(),
            ),
            { code: 121 },
          );
          assert.equal((await Wedding.findById(root._id)).deletedAt, null);
          assert.equal(
            (await MemberInvitation.findById(fresh._id)).status,
            'PENDING',
          );
          await connection.db.command({
            collMod: 'weddingLifecycleRequests',
            validator: {},
          });
        },
      );
      await service.delete(
        actor,
        wid,
        { confirmation: 'DELETE' },
        '"2"',
        randomUUID(),
      );
      await t.test(
        'old restore replay does not revive a later deletion; authorization precedes replay',
        async () => {
          const replay = await service.restore(
            second,
            wid,
            {},
            '"1"',
            restoreKey,
          );
          assert.equal(replay.lifecycle.state, 'RECOVERABLE');
          const confirmed = await service.lifecycleResult(
            second,
            wid,
            { action: 'RESTORE', body: {} },
            '"1"',
            restoreKey,
          );
          assert.equal(confirmed.confirmed, true);
          assert.equal(confirmed.lifecycle.state, 'RECOVERABLE');

          await WeddingMember.updateOne(
            { userId: users[1]._id },
            { $set: { role: 'VIEWER' } },
          );
          await assert.rejects(
            service.lifecycleResult(
              second,
              wid,
              { action: 'RESTORE', body: {} },
              '"1"',
              restoreKey,
            ),
            { code: 'ADMIN_REQUIRED' },
          );
          await assert.rejects(
            service.restore(second, wid, {}, '"1"', restoreKey),
            { code: 'ADMIN_REQUIRED' },
          );
        },
      );
      instant = new Date(+instant + RECOVERY_MS);
      await t.test(
        'restore closes at exact expiry even before purge runs',
        async () => {
          await assert.rejects(
            service.restore(actor, wid, {}, '"3"', randomUUID()),
            { code: 'RECOVERY_EXPIRED' },
          );
          assert.equal(
            (await service.lifecycle(actor, wid)).lifecycle.state,
            'EXPIRED',
          );
        },
      );
      const cover = await Media.create({
        weddingId: root._id,
        ownerUserId: users[0]._id,
        purpose: 'WEDDING_COVER',
        bucket: 'fixture',
        objectKey: tag + '/cover',
        displayKey: tag + '/cover-display',
        uploadKey: tag + '/cover-upload',
        mimeType: 'image/jpeg',
        sizeBytes: 10,
        attached: true,
        status: 'READY',
      });
      const avatar = await Media.create({
        ownerUserId: users[0]._id,
        purpose: 'PROFILE_AVATAR',
        bucket: 'fixture',
        objectKey: tag + '/avatar',
        displayKey: tag + '/avatar-display',
        uploadKey: tag + '/avatar-upload',
        mimeType: 'image/jpeg',
        sizeBytes: 10,
        attached: true,
        status: 'READY',
      });
      await User.updateOne(
        { _id: users[0]._id },
        { $set: { avatarMediaId: avatar._id } },
      );
      await t.test(
        'storage failure retains root, media and memberships; bounded retry finishes without global deletion',
        async () => {
          const first = service.purge();
          assert.equal(
            service.purge(),
            first,
            'overlapping local passes share one promise',
          );
          await assert.rejects(first, /paused/);
          assert.ok(await Media.exists({ _id: cover._id }));
          assert.ok(await Wedding.exists({ _id: root._id }));
          storageFails = false;
          instant = new Date(+instant + 300000);
          for (
            let index = 0;
            index < 40 && (await Wedding.exists({ _id: root._id }));
            index++
          )
            await service.purge();
          assert.equal(await Wedding.exists({ _id: root._id }), null);
          assert.equal(
            await WeddingMember.countDocuments({ weddingId: root._id }),
            0,
          );
          assert.equal(
            await connection
              .collection('tasks')
              .countDocuments({ weddingId: root._id }),
            0,
          );
          assert.deepEqual(removed, [String(cover._id)]);
          assert.ok(await Media.exists({ _id: avatar._id }));
          assert.equal(await User.countDocuments({}), 5);
          assert.equal((await service.current(actor)).wedding, null);
        },
      );
    } finally {
      if (connection) {
        const inventory = {};
        for (const { name } of await connection.db.listCollections().toArray())
          inventory[name] = await connection
            .collection(name)
            .find({}, { projection: { _id: 1 } })
            .toArray();
        await writeFile(
          '/private/tmp/' + tag + '-inventory.json',
          JSON.stringify({ tag, inventory }, null, 2),
        );
        console.info('Retained tagged local fixture:', tag);
      }
      await service.close();
      await database.close();
    }
  },
);
