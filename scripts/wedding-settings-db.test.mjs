import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { weddingModels } from '../apps/api/src/weddings/models.js';
import { eventModels } from '../apps/api/src/events/models.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';
import { createMemberManagement } from '../apps/api/src/members/management-service.js';
import { createApp } from '../apps/api/src/app.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';
import { config } from '../apps/api/src/config.js';

const uri = process.env.MONGODB_SETTINGS_TEST_URI;
test(
  'isolated wedding-settings authorization, concurrency, exact retries and atomic history',
  {
    skip:
      !uri &&
      'Set MONGODB_SETTINGS_TEST_URI to an isolated loopback replica set.',
  },
  async (t) => {
    assert.match(
      uri,
      /^mongodb:\/\/127\.0\.0\.1:\d+\/\?replicaSet=[a-zA-Z0-9_-]+$/,
    );
    const tag = 'mmm-test-settings-' + randomBytes(6).toString('hex');
    const database = createAuthDatabase({
      mongodbUri: uri,
      mongodbDbName: tag,
    });
    const service = createWeddingService({ database });
    try {
      const connection = await database.connect();
      const { User } = authModels(connection);
      const { Wedding, WeddingMember, WeddingSettingsRequest } =
        weddingModels(connection);
      const { Activity } = eventModels(connection);
      const accounts = [];
      for (let i = 0; i < 5; i++)
        accounts.push(
          await User.create({
            email: `${tag}-${i}@example.test`,
            emailNormalized: `${tag}-${i}@example.test`,
            profile: { displayName: `Settings Fixture ${i}` },
            passwordHash: 'fixture',
            emailVerifiedAt: new Date(),
          }),
        );
      const wedding = await Wedding.create({
        name: 'Settings fixture',
        brideName: 'Asha',
        groomName: 'Rahul',
        slug: tag,
        mainDate: '2020-01-01',
        tradition: 'ODIA',
        timezone: 'Asia/Kolkata',
        location: { city: 'Puri', state: 'Odisha', countryCode: 'IN' },
        createdBy: accounts[0]._id,
      });
      for (let i = 0; i < 4; i++)
        await WeddingMember.create({
          weddingId: wedding._id,
          userId: accounts[i]._id,
          role: i < 2 ? 'ADMIN' : i === 2 ? 'FAMILY_MEMBER' : 'VIEWER',
          financeAccess: false,
          joinedAt: new Date(),
          createdBy: accounts[0]._id,
          relationship: i ? 'Friend' : null,
        });
      const id = String(wedding._id);
      const user = (i) => String(accounts[i]._id);
      const update = (i, body, version, key = randomUUID()) =>
        service.update(user(i), id, body, `"${version}"`, key);
      t.diagnostic(
        JSON.stringify({
          tag,
          accounts: accounts.map((a) => String(a._id)),
          wedding: id,
        }),
      );
      await t.test(
        'current roles and tenant boundaries reject writes before replay',
        async () => {
          for (const i of [2, 3])
            await assert.rejects(update(i, { name: 'Changed' }, 0), {
              status: 403,
            });
          await assert.rejects(update(4, { name: 'Changed' }, 0), {
            status: 404,
          });
          assert.equal(await Activity.countDocuments({ weddingId: id }), 0);
        },
      );
      let receiptKey;
      await t.test(
        'exact maximum money, fixed schedule, existing past wedding and metadata save',
        async () => {
          receiptKey = randomUUID();
          const result = await update(
            0,
            {
              name: 'Our custom title',
              tradition: 'BENGALI',
              estimatedBudget: {
                amountMinor: Number.MAX_SAFE_INTEGER,
                currency: 'INR',
              },
            },
            0,
            receiptKey,
          );
          assert.equal(
            result.wedding.estimatedBudget.amountMinor,
            Number.MAX_SAFE_INTEGER,
          );
          const record = await Wedding.findById(id).lean();
          assert.equal(
            BigInt(record.estimatedBudget.amountMinor),
            BigInt(Number.MAX_SAFE_INTEGER),
          );
          const [storage] = await Wedding.aggregate([
            { $match: { _id: wedding._id } },
            { $project: { kind: { $type: '$estimatedBudget.amountMinor' } } },
          ]);
          assert.equal(storage.kind, 'long');
          assert.equal(record.mainDate, '2020-01-01');
          assert.equal(record.timezone, 'Asia/Kolkata');
          assert.equal(record.location.countryCode, 'IN');
          const audit = await Activity.findOne({ weddingId: id }).lean();
          assert.equal(audit.action, 'WEDDING_UPDATED');
          assert.equal(audit.feedHidden, true);
          assert.equal(
            JSON.stringify(audit).includes('9007199254740991'),
            false,
          );
        },
      );
      await t.test(
        'receipt replay is exact, current-authorized and never rewinds later edits',
        async () => {
          const body = {
            estimatedBudget: {
              currency: 'INR',
              amountMinor: Number.MAX_SAFE_INTEGER,
            },
            tradition: 'BENGALI',
            name: 'Our custom title',
          };
          const replay = await update(0, body, 0, receiptKey);
          assert.equal(replay.replayed, true);
          assert.equal(replay.wedding.version, 1);
          await assert.rejects(
            update(0, { name: 'Different payload' }, 0, receiptKey),
            { code: 'IDEMPOTENCY_CONFLICT' },
          );
          await update(1, { brideName: 'Priya' }, 1);
          assert.equal(
            (await update(0, body, 0, receiptKey)).wedding.brideName,
            'Priya',
          );
          await WeddingMember.updateOne(
            { userId: user(0) },
            { $set: { role: 'VIEWER' } },
          );
          await assert.rejects(update(0, body, 0, receiptKey), { status: 403 });
          await WeddingMember.updateOne(
            { userId: user(0) },
            { $set: { role: 'ADMIN' } },
          );
        },
      );
      await t.test(
        'concurrent Admin saves have one winner and preserve custom title',
        async () => {
          const results = await Promise.allSettled([
            update(0, { city: 'bad' }, 2),
            update(1, { groomName: 'Kabir' }, 2),
          ]);
          assert.equal(results[0].reason.status, 400);
          assert.equal(results[1].status, 'fulfilled');
          const version = results[1].value.wedding.version;
          const race = await Promise.allSettled([
            update(0, { name: 'Choice One' }, version),
            update(1, { name: 'Choice Two' }, version),
          ]);
          assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
          assert.equal(
            race.find((r) => r.status === 'rejected').reason.code,
            'VERSION_CONFLICT',
          );
        },
      );
      await t.test(
        'budget visibility follows current role and clearing removes the BSON value',
        async () => {
          assert.equal(
            (await service.read(user(2), id)).wedding.estimatedBudget,
            undefined,
          );
          assert.equal(
            (await service.read(user(3), id)).wedding.estimatedBudget,
            undefined,
          );
          await WeddingMember.updateOne(
            { userId: user(2) },
            { $set: { financeAccess: true } },
          );
          assert.equal(
            (await service.read(user(2), id)).wedding.estimatedBudget
              .amountMinor,
            Number.MAX_SAFE_INTEGER,
          );
          const current = await service.read(user(0), id);
          await update(0, { estimatedBudget: null }, current.wedding.version);
          assert.equal(
            (await Wedding.findById(id).lean()).estimatedBudget,
            undefined,
          );
        },
      );
      await t.test(
        'a final receipt failure rolls back settings and audit, then unchanged retry succeeds',
        async () => {
          const before = await Wedding.findById(id).lean();
          const count = await Activity.countDocuments({ weddingId: id });
          const key = randomUUID();
          await connection.db.command({
            collMod: WeddingSettingsRequest.collection.name,
            validator: { $expr: { $eq: [1, 0] } },
            validationLevel: 'strict',
          });
          const writeReceipt = WeddingSettingsRequest.findOneAndUpdate;
          let validationError;
          WeddingSettingsRequest.findOneAndUpdate = async function (...args) {
            const transaction = args[2].session;
            assert.equal(
              (await Wedding.findById(id).session(transaction).lean()).name,
              'Rollback attempt',
            );
            assert.equal(
              await Activity.countDocuments({ weddingId: id }).session(
                transaction,
              ),
              count + 1,
            );
            try {
              return await writeReceipt.apply(this, args);
            } catch (failure) {
              validationError = failure;
              throw failure;
            }
          };
          try {
            await assert.rejects(
              update(0, { name: 'Rollback attempt' }, before.__v, key),
              { status: 503 },
            );
            assert.equal(validationError?.code, 121);
          } finally {
            WeddingSettingsRequest.findOneAndUpdate = writeReceipt;
          }
          assert.equal((await Wedding.findById(id).lean()).name, before.name);
          assert.equal((await Wedding.findById(id).lean()).__v, before.__v);
          assert.equal(await Activity.countDocuments({ weddingId: id }), count);
          await connection.db.command({
            collMod: WeddingSettingsRequest.collection.name,
            validator: {},
          });
          const result = await update(
            0,
            { name: 'Rollback attempt' },
            before.__v,
            key,
          );
          assert.equal(result.wedding.version, before.__v + 1);
        },
      );
      await t.test(
        'duplicate concurrent saves create one audit and one receipt',
        async () => {
          const before = await service.read(user(0), id);
          const count = await Activity.countDocuments({ weddingId: id });
          const key = randomUUID();
          const results = await Promise.all([
            update(0, { name: 'Duplicate safe' }, before.wedding.version, key),
            update(0, { name: 'Duplicate safe' }, before.wedding.version, key),
          ]);
          assert.equal(results.filter((r) => r.replayed).length, 1);
          assert.equal(
            await Activity.countDocuments({ weddingId: id }),
            count + 1,
          );
          assert.equal(
            await WeddingSettingsRequest.countDocuments({ weddingId: id }),
            count + 1,
          );
        },
      );
      await t.test(
        'unchanged saves keep the wedding version/audit and replay without restoring old values',
        async () => {
          const before = await service.read(user(0), id),
            count = await Activity.countDocuments({ weddingId: id }),
            key = randomUUID();
          const body = {
            name: before.wedding.name,
            estimatedBudget: null,
            location: { city: 'Puri', state: 'Odisha' },
          };
          const result = await update(0, body, before.wedding.version, key);
          assert.equal(result.unchanged, true);
          assert.equal(result.wedding.version, before.wedding.version);
          assert.equal(await Activity.countDocuments({ weddingId: id }), count);
          await update(1, { name: 'A newer title' }, before.wedding.version);
          const replay = await update(0, body, before.wedding.version, key);
          assert.equal(replay.unchanged, true);
          assert.equal(replay.replayed, true);
          assert.equal(replay.wedding.name, 'A newer title');
        },
      );
      await t.test(
        'actual HTTP PATCH rejects malformed If-Match and records no-op receipts safely',
        async () => {
          const settings = {
            ...config,
            nodeEnv: 'test',
            webOrigin: 'http://127.0.0.1:3108',
            jwtSecret: 'fixture-only-'.repeat(6),
          };
          const app = createApp({
            settings,
            weddings: service,
            service: {
              async session({ accessToken }) {
                if (accessToken !== 'fixture-access')
                  throw new ApiError(401, 'SESSION_EXPIRED', 'Please sign in.');
                return { user: { id: user(0), emailVerified: true } };
              },
            },
          });
          const server = app.listen(0, '127.0.0.1');
          await new Promise((resolve) => server.once('listening', resolve));
          t.diagnostic(
            JSON.stringify({
              httpPid: process.pid,
              httpPort: server.address().port,
            }),
          );
          try {
            const base = `http://127.0.0.1:${server.address().port}/api/v1`;
            const csrf = await fetch(base + '/auth/csrf');
            const token = (await csrf.json()).data.csrfToken;
            const cookie =
              csrf.headers
                .getSetCookie()
                .map((value) => value.split(';')[0])
                .join('; ') + '; mmm_access=fixture-access';
            const current = await service.read(user(0), id);
            for (const match of [
              'W/"1"',
              '"abc"',
              `"${current.wedding.version}"`,
            ]) {
              const result = await fetch(base + '/weddings/' + id, {
                method: 'PATCH',
                headers: {
                  Origin: settings.webOrigin,
                  'Content-Type': 'application/json',
                  Cookie: cookie,
                  'X-CSRF-Token': token,
                  'If-Match': match,
                  'Idempotency-Key': randomUUID(),
                },
                body: JSON.stringify({ name: current.wedding.name }),
              });
              assert.equal(
                result.status,
                match === `"${current.wedding.version}"` ? 200 : 428,
              );
              const body = await result.json();
              if (result.status === 428)
                assert.equal(body.error.code, 'VERSION_REQUIRED');
              else assert.equal(body.data.unchanged, true);
            }
          } finally {
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
          }
        },
      );
      await t.test(
        'a Settings lock preserves an existing role preview while retaining demotion protection',
        async () => {
          const instant = new Date('2026-11-11T12:00:00Z');
          const management = createMemberManagement({
            database,
            settings: { jwtSecret: 'fixture-only-'.repeat(6) },
            now: () => instant,
          });
          const member = await WeddingMember.findOne({
            userId: user(0),
          }).lean();
          const before = await management.read(user(1), id, String(member._id));
          const weddingBefore = await service.read(user(0), id),
            key = randomUUID();
          await update(
            0,
            { name: 'Separate permission lock' },
            weddingBefore.wedding.version,
            key,
          );
          const after = await management.read(user(1), id, String(member._id));
          assert.equal(after.member.version, before.member.version);
          assert.equal(after.preview, before.preview);
          await management.update(
            user(1),
            id,
            String(member._id),
            {
              role: 'VIEWER',
              relationshipChoice: '',
              customRelationship: '',
              preview: before.preview,
            },
            String(before.member.version),
            randomUUID(),
          );
          await assert.rejects(
            update(
              0,
              { name: 'Separate permission lock' },
              weddingBefore.wedding.version,
              key,
            ),
            { status: 403 },
          );
        },
      );
    } finally {
      await database.close();
      // Keep tagged fixtures until the owner authorizes deletion.
    }
  },
);
