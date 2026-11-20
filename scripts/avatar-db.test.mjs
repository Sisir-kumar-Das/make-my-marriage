import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { mediaModel } from '../apps/api/src/media/models.js';
import { createMediaService } from '../apps/api/src/media/service.js';
import { PROFILE_AVATAR } from '../apps/api/src/media/validation.js';

const uri = process.env.MONGODB_AVATAR_TEST_URI;

test(
  'an avatar replacement rolls back both attachments and the account on a database failure',
  {
    skip:
      !uri &&
      'Set MONGODB_AVATAR_TEST_URI to an isolated loopback replica set.',
  },
  async (t) => {
    assert.match(
      uri,
      /^mongodb:\/\/127\.0\.0\.1:\d+\/\?replicaSet=[a-zA-Z0-9_-]+$/,
    );
    const tag = 'mmm-test-avatar-' + randomBytes(6).toString('hex');
    const settings = {
      nodeEnv: 'test',
      mongodbUri: uri,
      mongodbDbName: tag,
      r2AccountId: 'a'.repeat(32),
      r2Bucket: 'fixture-bucket',
      r2AccessKeyId: 'fixture',
      r2SecretAccessKey: 'fixture',
    };
    const database = createAuthDatabase(settings);
    const media = createMediaService({
      database,
      settings,
      storage: {
        uploadUrl: async () =>
          'https://fixture.r2.cloudflarestorage.com/upload',
        finish: async () => ({ width: 160, height: 160, checksum: 'fixture' }),
        readUrl: async () => 'https://fixture.r2.cloudflarestorage.com/display',
      },
    });
    try {
      const connection = await database.connect();
      const { User } = authModels(connection);
      const Media = mediaModel(connection);
      const { _id } = await User.create({
        email: `${tag}@example.test`,
        emailNormalized: `${tag}@example.test`,
        passwordHash: 'fixture',
        profile: { displayName: 'Avatar Rollback Fixture' },
        emailVerifiedAt: new Date(),
      });
      const accountId = String(_id);
      async function stage() {
        const { mediaId } = await media.upload(
          accountId,
          null,
          {
            mimeType: 'image/webp',
            sizeBytes: 123,
          },
          PROFILE_AVATAR,
        );
        await media.complete(accountId, null, mediaId, PROFILE_AVATAR);
        return mediaId;
      }
      const original = await stage();
      const replacement = await stage();
      const frame = { x: 0.25, y: 0.75, zoom: 1.5 };
      await media.setAvatar(accountId, {
        accountId,
        mediaId: original,
        frame,
        version: 0,
      });

      // Reject the final database write after the new asset and account have been updated.
      const originalId = (await Media.findById(original).lean())._id;
      const collMod = (validator) =>
        connection.db.command({
          collMod: Media.collection.name,
          validator,
          validationAction: 'error',
        });
      await collMod({
        $or: [
          { _id: { $ne: originalId } },
          { status: { $ne: 'DELETE_PENDING' } },
        ],
      });
      const edit = {
        accountId,
        mediaId: replacement,
        frame: { ...frame, x: 0.5 },
        version: 1,
      };
      const runTransaction = connection.transaction.bind(connection);
      let databaseFailure;
      // Observe the driver error before the media service maps it to MEDIA_UNAVAILABLE.
      t.mock.method(connection, 'transaction', async (...args) => {
        try {
          return await runTransaction(...args);
        } catch (error) {
          databaseFailure = error;
          throw error;
        }
      });
      await assert.rejects(media.setAvatar(accountId, edit), {
        code: 'MEDIA_UNAVAILABLE',
      });
      assert.equal(
        databaseFailure?.code,
        121,
        'MongoDB rejected the write on document validation',
      );
      assert.equal(
        String(databaseFailure.errInfo?.failingDocumentId),
        original,
      );
      const account = await User.findById(accountId).lean();
      const old = await Media.findById(original).lean();
      const next = await Media.findById(replacement).lean();
      assert.equal(String(account.avatarMediaId), original);
      assert.equal(account.avatarVersion, 1);
      assert.deepEqual(account.avatarFrame, frame);
      assert.equal(old.status, 'READY');
      assert.equal(old.attached, true);
      assert.equal(next.status, 'READY');
      assert.equal(next.attached, false);
      assert.ok(next.purgeAfter instanceof Date);
      assert.equal(
        (await media.readAvatar(accountId, original)).mediaId,
        original,
      );

      await collMod({});
      assert.deepEqual(await media.setAvatar(accountId, edit), {
        id: accountId,
        avatar: { mediaId: replacement, frame: edit.frame },
        avatarVersion: 2,
      });
      assert.equal(
        (await Media.findById(original).lean()).status,
        'DELETE_PENDING',
      );
      assert.equal((await Media.findById(replacement).lean()).attached, true);
    } finally {
      await database.close();
    }
  },
);
