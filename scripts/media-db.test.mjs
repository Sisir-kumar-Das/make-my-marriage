import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { config } from '../apps/api/src/config.js';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { weddingModels } from '../apps/api/src/weddings/models.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';
import { weddingToday } from '../apps/api/src/weddings/validation.js';
import { mediaModel } from '../apps/api/src/media/models.js';
import { createMediaService } from '../apps/api/src/media/service.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';

test(
  'Atlas cover ownership, atomic attachment, concurrency and cleanup',
  { skip: !config.mongodbUri && 'Set MONGODB_URI privately.' },
  async (t) => {
    const settings = {
      ...config,
      nodeEnv: 'test',
      mongodbDbName: 'mmm_media_test_' + randomBytes(8).toString('hex'),
      r2AccountId: 'a'.repeat(32),
      r2Bucket: 'fixture-bucket',
      r2AccessKeyId: 'fixture',
      r2SecretAccessKey: 'fixture',
    };
    const database = createAuthDatabase(settings);
    let instant = new Date();
    const now = () => instant;
    const weddings = createWeddingService({ database, settings, now });
    let finish = async () => ({
      width: 1600,
      height: 1000,
      checksum: 'fixture-checksum',
    });
    let finishCalls = 0,
      failRemoval = false;
    const removed = [];
    const storage = {
      async uploadUrl() {
        return 'https://fixture.r2.cloudflarestorage.com/upload?signed=fixture';
      },
      async finish(asset) {
        finishCalls++;
        return finish(asset);
      },
      async readUrl() {
        return 'https://fixture.r2.cloudflarestorage.com/display?signed=fixture';
      },
      async remove(asset, stagingOnly) {
        if (failRemoval) {
          failRemoval = false;
          throw new Error('private-storage-failure');
        }
        removed.push({ id: String(asset._id), stagingOnly: !!stagingOnly });
      },
    };
    const media = createMediaService({ database, settings, storage, now });
    const connection = await database.connect();
    const { User } = authModels(connection);
    const { Wedding, WeddingMember, WeddingCreationRequest } =
      weddingModels(connection);
    const Media = mediaModel(connection);
    let sequence = 0;
    async function account(verified = true) {
      const email = `fixture-${++sequence}@example.com`;
      const user = await User.create({
        email,
        emailNormalized: email,
        profile: { displayName: 'Cover Fixture' },
        passwordHash: 'not-a-login-fixture',
        emailVerifiedAt: verified ? instant : null,
      });
      return String(user._id);
    }
    const input = () => ({
      name: 'Our wedding',
      brideName: 'Bride',
      groomName: 'Groom',
      mainDate: weddingToday(instant),
      tradition: 'ODIA',
      location: { city: 'Puri', state: 'Odisha', countryCode: 'IN' },
    });
    const frame = { x: 0.25, y: 0.65, zoom: 1.4 };
    async function ready(owner, weddingId = null) {
      const result = await media.upload(owner, weddingId, {
        mimeType: 'image/jpeg',
        sizeBytes: 12345,
      });
      await media.complete(owner, weddingId, result.mediaId);
      return result.mediaId;
    }
    let owner, firstId, weddingId, current;
    try {
      await t.test(
        'setup presign creates only owner-scoped pending media, without a wedding or membership',
        async () => {
          owner = await account();
          const result = await media.upload(owner, null, {
            mimeType: 'image/jpeg',
            sizeBytes: 15_000_000,
          });
          firstId = result.mediaId;
          const record = await Media.findById(firstId).lean();
          assert.equal(record.status, 'PENDING_UPLOAD');
          assert.equal(record.weddingId, null);
          assert.equal(String(record.ownerUserId), owner);
          assert.match(
            record.objectKey,
            /^dev\/covers\/[a-f\d]{24}\/original$/,
          );
          assert.equal(await Wedding.countDocuments(), 0);
          assert.equal(await WeddingMember.countDocuments(), 0);
          assert.equal(
            Date.parse(result.expiresAt) - instant.getTime(),
            300000,
          );
        },
      );
      await t.test(
        'unverified users and unsupported metadata are rejected without granting upload access',
        async () => {
          const unverified = await account(false);
          await assert.rejects(
            media.upload(unverified, null, {
              mimeType: 'image/jpeg',
              sizeBytes: 1,
            }),
            { code: 'SESSION_EXPIRED' },
          );
          await assert.rejects(
            media.upload(owner, null, {
              mimeType: 'image/svg+xml',
              sizeBytes: 1,
            }),
            { code: 'INVALID_COVER' },
          );
          await assert.rejects(
            media.upload(owner, null, {
              mimeType: 'image/jpeg',
              sizeBytes: 15_000_001,
            }),
            { code: 'INVALID_COVER' },
          );
        },
      );
      await t.test(
        'another user cannot complete, read or claim a setup upload',
        async () => {
          const outsider = await account();
          await assert.rejects(media.complete(outsider, null, firstId), {
            code: 'MEDIA_NOT_FOUND',
          });
          await assert.rejects(
            weddings.create(
              outsider,
              { ...input(), coverMediaId: firstId, coverFrame: frame },
              randomUUID(),
            ),
            { code: 'COVER_NOT_READY' },
          );
          assert.equal(
            await Wedding.countDocuments({ createdBy: outsider }),
            0,
          );
          assert.equal(
            await WeddingMember.countDocuments({ userId: outsider }),
            0,
          );
        },
      );
      await t.test(
        'overlapping completion has one processing owner and a completed retry does not process again',
        async () => {
          const started = Promise.withResolvers(),
            release = Promise.withResolvers();
          finish = async () => {
            started.resolve();
            await release.promise;
            return { width: 1600, height: 1000, checksum: 'fixture-checksum' };
          };
          const first = media.complete(owner, null, firstId);
          await started.promise;
          await assert.rejects(media.complete(owner, null, firstId), {
            code: 'MEDIA_PROCESSING',
          });
          release.resolve();
          await first;
          const count = finishCalls;
          await media.complete(owner, null, firstId);
          assert.equal(finishCalls, count);
          finish = async () => ({
            width: 1600,
            height: 1000,
            checksum: 'fixture-checksum',
          });
        },
      );
      await t.test(
        'temporary processing failures release their lease; invalid images are queued for cleanup',
        async () => {
          const result = await media.upload(owner, null, {
            mimeType: 'image/png',
            sizeBytes: 120,
          });
          finish = async () => {
            throw new Error('private-provider-detail');
          };
          const log = console.error;
          console.error = () => {};
          try {
            await assert.rejects(media.complete(owner, null, result.mediaId), {
              code: 'MEDIA_UNAVAILABLE',
            });
          } finally {
            console.error = log;
          }
          const pending = await Media.findById(result.mediaId).lean();
          assert.equal(pending.status, 'PENDING_UPLOAD');
          assert.equal(pending.processingToken, undefined);
          finish = async () => ({
            width: 100,
            height: 120,
            checksum: 'fixture-checksum',
          });
          await media.complete(owner, null, result.mediaId);
          const invalid = await media.upload(owner, null, {
            mimeType: 'image/png',
            sizeBytes: 120,
          });
          finish = async () => {
            throw new ApiError(400, 'INVALID_COVER', 'Invalid image');
          };
          await assert.rejects(media.complete(owner, null, invalid.mediaId), {
            code: 'INVALID_COVER',
          });
          assert.equal(
            (await Media.findById(invalid.mediaId)).status,
            'DELETE_PENDING',
          );
          finish = async () => ({
            width: 1600,
            height: 1000,
            checksum: 'fixture-checksum',
          });
        },
      );
      await t.test(
        'wedding, Admin membership, media attachment and replay record commit atomically',
        async () => {
          const data = { ...input(), coverMediaId: firstId, coverFrame: frame },
            key = randomUUID();
          current = await weddings.create(owner, data, key);
          weddingId = current.wedding.id;
          assert.equal(current.wedding.cover, 'CUSTOM');
          assert.deepEqual(current.wedding.coverFrame, frame);
          assert.equal(current.membership.role, 'ADMIN');
          const record = await Media.findById(firstId).lean();
          assert.equal(record.attached, true);
          assert.equal(String(record.weddingId), weddingId);
          assert.equal(record.purgeAfter, undefined);
          assert.equal(
            await WeddingCreationRequest.countDocuments({ userId: owner }),
            1,
          );
          const savedInstant = instant;
          // Cross India midnight while remaining inside the 24-hour replay window.
          instant = new Date(weddingToday(instant) + 'T18:30:01Z');
          const retry = await weddings.create(owner, data, key);
          assert.equal(retry.wedding.id, weddingId);
          instant = savedInstant;
          assert.equal(await Wedding.countDocuments({ createdBy: owner }), 1);
          await assert.rejects(
            media.upload(owner, null, { mimeType: 'image/png', sizeBytes: 10 }),
            { code: 'WEDDING_ALREADY_EXISTS' },
          );
          assert.ok(!JSON.stringify(current).includes('objectKey'));
          assert.ok(!JSON.stringify(current).includes('signed='));
        },
      );
      await t.test(
        'pending/foreign/expired media cannot create an orphan wedding or replace a cover',
        async () => {
          const another = await account();
          const pending = await media.upload(another, null, {
            mimeType: 'image/jpeg',
            sizeBytes: 40,
          });
          await assert.rejects(
            weddings.create(
              another,
              { ...input(), coverMediaId: pending.mediaId },
              randomUUID(),
            ),
            { code: 'COVER_NOT_READY' },
          );
          assert.equal(await Wedding.countDocuments({ createdBy: another }), 0);
          assert.equal(
            await WeddingMember.countDocuments({ userId: another }),
            0,
          );
          assert.equal(
            await WeddingCreationRequest.countDocuments({ userId: another }),
            0,
          );
          const expired = await ready(another);
          await Media.updateOne(
            { _id: expired },
            { $set: { purgeAfter: new Date(instant.getTime() - 1) } },
          );
          await assert.rejects(
            weddings.create(
              another,
              { ...input(), coverMediaId: expired },
              randomUUID(),
            ),
            { code: 'COVER_NOT_READY' },
          );
          await assert.rejects(
            weddings.setCover(owner, weddingId, {
              mediaId: expired,
              frame,
              version: 0,
            }),
            { code: 'COVER_NOT_READY' },
          );
          assert.equal(
            (await weddings.read(owner, weddingId)).wedding.coverMediaId,
            firstId,
          );
        },
      );
      await t.test(
        'Viewer and Family Member can read the current cover but cannot upload or change it',
        async () => {
          const viewer = await account();
          const member = await WeddingMember.create({
            userId: viewer,
            weddingId,
            role: 'VIEWER',
            status: 'ACTIVE',
            joinedAt: instant,
            createdBy: owner,
          });
          assert.equal(
            (await media.read(viewer, weddingId, firstId)).mediaId,
            firstId,
          );
          assert.equal(
            (await weddings.current(viewer)).wedding.coverMediaId,
            firstId,
          );
          for (const role of ['VIEWER', 'FAMILY_MEMBER']) {
            await WeddingMember.updateOne(
              { _id: member._id },
              { $set: { role } },
            );
            await assert.rejects(
              media.upload(viewer, weddingId, {
                mimeType: 'image/png',
                sizeBytes: 10,
              }),
              { code: 'ADMIN_REQUIRED' },
            );
            await assert.rejects(
              weddings.setCover(viewer, weddingId, {
                mediaId: null,
                version: 0,
              }),
              { code: 'ADMIN_REQUIRED' },
            );
          }
          const outsider = await account();
          await assert.rejects(media.read(outsider, weddingId, firstId), {
            code: 'MEDIA_NOT_FOUND',
          });
        },
      );
      await t.test(
        'replacement keeps the old image until save, detaches it atomically, and identical retries succeed',
        async () => {
          const second = await ready(owner, weddingId);
          assert.equal(
            (await weddings.read(owner, weddingId)).wedding.coverMediaId,
            firstId,
          );
          const command = {
            mediaId: second,
            frame: { x: 0.8, y: 0.2, zoom: 1.2 },
            version: 0,
          };
          current = await weddings.setCover(owner, weddingId, command);
          assert.equal(current.wedding.version, 1);
          assert.equal(current.wedding.coverMediaId, second);
          const previous = await Media.findById(firstId);
          assert.equal(previous.status, 'DELETE_PENDING');
          assert.equal(previous.attached, false);
          assert.equal(
            previous.purgeAfter.getTime() - instant.getTime(),
            600000,
          );
          const replay = await weddings.setCover(owner, weddingId, command);
          assert.equal(replay.wedding.version, 1);
          await assert.rejects(media.read(owner, weddingId, firstId), {
            code: 'MEDIA_NOT_FOUND',
          });
        },
      );
      await t.test(
        'two different replacement saves cannot silently overwrite each other',
        async () => {
          const a = await ready(owner, weddingId),
            b = await ready(owner, weddingId);
          const outcomes = await Promise.allSettled(
            [a, b].map((mediaId) =>
              weddings.setCover(owner, weddingId, {
                mediaId,
                frame,
                version: 1,
              }),
            ),
          );
          assert.equal(
            outcomes.filter((value) => value.status === 'fulfilled').length,
            1,
          );
          assert.equal(
            outcomes.find((value) => value.status === 'rejected').reason.code,
            'VERSION_CONFLICT',
          );
          current = outcomes.find(
            (value) => value.status === 'fulfilled',
          ).value;
          assert.equal(current.wedding.version, 2);
          const loser = current.wedding.coverMediaId === a ? b : a;
          assert.equal((await Media.findById(loser)).attached, false);
        },
      );
      await t.test(
        'removal restores the default and blocks reattachment of a deleted cover',
        async () => {
          const previous = current.wedding.coverMediaId;
          current = await weddings.setCover(owner, weddingId, {
            mediaId: null,
            version: 2,
          });
          assert.equal(current.wedding.cover, 'DEFAULT');
          assert.equal(current.wedding.version, 3);
          await weddings.setCover(owner, weddingId, {
            mediaId: null,
            version: 2,
          });
          assert.equal(
            (await Media.findById(previous)).status,
            'DELETE_PENDING',
          );
          await assert.rejects(
            weddings.setCover(owner, weddingId, {
              mediaId: previous,
              frame,
              version: 3,
            }),
            { code: 'COVER_NOT_READY' },
          );
        },
      );
      await t.test(
        'cleanup removes expired objects, protects live references and respects environment/bucket boundaries',
        async () => {
          const active = await ready(owner, weddingId);
          current = await weddings.setCover(owner, weddingId, {
            mediaId: active,
            frame,
            version: 3,
          });
          await Media.updateOne(
            { _id: active },
            {
              $set: {
                attached: false,
                purgeAfter: new Date(instant.getTime() - 1),
                stagingPurgeAfter: new Date(instant.getTime() - 1),
              },
            },
          );
          const expired = await ready(owner, weddingId);
          await Media.updateOne(
            { _id: expired },
            { $set: { purgeAfter: new Date(instant.getTime() - 1) } },
          );
          const foreign = await ready(owner, weddingId);
          await Media.updateOne(
            { _id: foreign },
            {
              $set: {
                objectKey: `prod/covers/${foreign}/original`,
                purgeAfter: new Date(instant.getTime() - 1),
              },
            },
          );
          instant = new Date(instant.getTime() + 660000);
          await media.cleanup();
          await media.cleanup();
          assert.equal((await Media.findById(expired)).status, 'DELETED');
          assert.equal((await Media.findById(active)).attached, true);
          assert.equal((await Media.findById(active)).status, 'READY');
          assert.ok(
            !removed.some(
              (record) => record.id === active && !record.stagingOnly,
            ),
          );
          assert.ok(
            removed.some(
              (record) => record.id === active && record.stagingOnly,
            ),
          );
          assert.equal((await Media.findById(foreign)).status, 'READY');
          assert.ok(!removed.some((record) => record.id === foreign));
        },
      );
      await t.test(
        'storage deletion failure stays retryable and cannot detach the current cover',
        async () => {
          const expired = await ready(owner, weddingId);
          await Media.updateOne(
            { _id: expired },
            { $set: { purgeAfter: new Date(instant.getTime() - 1) } },
          );
          failRemoval = true;
          const log = console.error;
          console.error = () => {};
          try {
            await assert.rejects(media.cleanup(), {
              code: 'MEDIA_UNAVAILABLE',
            });
          } finally {
            console.error = log;
          }
          assert.equal(
            (await Media.findById(expired)).status,
            'DELETE_PENDING',
          );
          instant = new Date(instant.getTime() + 61000);
          await media.cleanup();
          assert.equal((await Media.findById(expired)).status, 'DELETED');
          assert.equal(
            (await weddings.read(owner, weddingId)).wedding.cover,
            'CUSTOM',
          );
        },
      );
    } finally {
      await connection.dropDatabase();
      await database.close();
      console.log('Disposable cover test database removed.');
    }
  },
);
