import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { config } from '../apps/api/src/config.js';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { createAuthService, hashToken } from '../apps/api/src/auth/service.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';
import { createApp } from '../apps/api/src/app.js';

test(
  'MongoDB registration and one-time verification integrity',
  {
    skip:
      !config.mongodbUri &&
      'Set MONGODB_URI in apps/api/.env to run database integration checks.',
  },
  async (t) => {
    // A unique, test-owned database only. Never drop the application's database.
    const settings = {
      ...config,
      mongodbDbName: `mmm_auth_test_${randomBytes(8).toString('hex')}`,
      emailProvider: 'gmail',
      smtpUser: 'fixture@gmail.com',
      smtpAppPassword: 'testonlypassword',
      resendApiKey: '',
      emailFrom: '',
    };
    const database = createAuthDatabase(settings);
    let instant = new Date();
    let failDelivery = false;
    let deliveryAttempts = 0;
    const emails = [];
    const service = createAuthService({
      database,
      settings,
      now: () => instant,
      sendVerification: async (message) => {
        deliveryAttempts++;
        if (failDelivery)
          throw new ApiError(503, 'EMAIL_UNAVAILABLE', 'Delivery unavailable.');
        emails.push(message);
      },
    });
    const connection = await database.connect();
    const { User, AuthToken } = authModels(connection);
    const account = {
      name: 'Test Couple',
      email: 'couple@example.com',
      password: 'Wedding123',
    };
    try {
      await t.test(
        'registration stores an unverified account, Argon2id hash and only a token hash',
        async () => {
          await service.register(account);
          const user = await User.findOne({ emailNormalized: account.email })
            .select('+passwordHash')
            .lean();
          assert.equal(user.emailVerifiedAt, null);
          assert.equal(user.profile.displayName, account.name);
          assert.ok(user.passwordHash.startsWith('$argon2id$'));
          assert.ok(await argon2.verify(user.passwordHash, account.password));
          const stored = await AuthToken.findOne({ userId: user._id })
            .select('+tokenHash')
            .lean();
          assert.ok(stored.tokenHash === hashToken(emails[0].token));
          assert.ok(!JSON.stringify(stored).includes(emails[0].token));
        },
      );
      await t.test(
        'duplicate registration cannot replace existing credentials',
        async () => {
          await assert.rejects(
            service.register({
              ...account,
              name: 'Replacement',
              password: 'Another123',
            }),
            { status: 409, code: 'EMAIL_ALREADY_REGISTERED' },
          );
          assert.equal(
            await User.countDocuments({ emailNormalized: account.email }),
            1,
          );
          const user = await User.findOne({ emailNormalized: account.email })
            .select('+passwordHash')
            .lean();
          assert.equal(user.profile.displayName, account.name);
          assert.ok(await argon2.verify(user.passwordHash, account.password));
          assert.equal(emails.length, 1);
        },
      );
      await t.test(
        'resend cooldown and concurrent resends issue only one replacement',
        async () => {
          await service.resend({ email: account.email });
          assert.equal(emails.length, 1);
          instant = new Date(instant.getTime() + 46000);
          await Promise.all([
            service.resend({ email: account.email }),
            service.resend({ email: account.email }),
          ]);
          assert.equal(emails.length, 2);
          await assert.rejects(service.verify({ token: emails[0].token }), {
            code: 'INVALID_VERIFICATION_LINK',
          });
        },
      );
      await t.test(
        'concurrent verification succeeds once; replay cannot succeed',
        async () => {
          const outcomes = await Promise.allSettled([
            service.verify({ token: emails[1].token }),
            service.verify({ token: emails[1].token }),
          ]);
          assert.equal(
            outcomes.filter((result) => result.status === 'fulfilled').length,
            1,
          );
          assert.equal(
            outcomes.filter((result) => result.status === 'rejected').length,
            1,
          );
          const user = await User.findOne({
            emailNormalized: account.email,
          }).lean();
          assert.ok(user.emailVerifiedAt instanceof Date);
          await assert.rejects(service.verify({ token: emails[1].token }), {
            code: 'INVALID_VERIFICATION_LINK',
          });
        },
      );
      await t.test(
        'unknown, verified and disabled accounts receive no verification email',
        async () => {
          const count = emails.length;
          await service.resend({ email: 'missing@example.com' });
          await service.resend({ email: account.email });
          assert.equal(emails.length, count);
        },
      );
      await t.test('expiry is enforced before TTL cleanup', async () => {
        const email = 'expired@example.com';
        await service.register({ ...account, email });
        const token = emails.at(-1).token;
        instant = new Date(instant.getTime() + 25 * 3600000);
        await assert.rejects(service.verify({ token }), {
          code: 'INVALID_VERIFICATION_LINK',
        });
        const user = await User.findOne({ emailNormalized: email }).lean();
        assert.equal(user.emailVerifiedAt, null);
      });
      await t.test(
        'failed delivery preserves the account and permits immediate resend',
        async () => {
          const email = 'retry@example.com';
          failDelivery = true;
          await service.register({ ...account, email });
          const user = await User.findOne({ emailNormalized: email }).lean();
          assert.ok(user);
          assert.equal(await AuthToken.countDocuments({ userId: user._id }), 0);
          failDelivery = false;
          await service.resend({ email });
          await service.verify({ token: emails.at(-1).token });
          assert.ok((await User.findById(user._id).lean()).emailVerifiedAt);
        },
      );
      await t.test(
        'disabled account verification rolls back token consumption',
        async () => {
          const email = 'disabled@example.com';
          await service.register({ ...account, email });
          const token = emails.at(-1).token;
          await User.updateOne(
            { emailNormalized: email },
            { $set: { status: 'DISABLED' } },
          );
          const sentCount = emails.length;
          await service.resend({ email });
          assert.equal(emails.length, sentCount);
          await assert.rejects(service.verify({ token }), {
            code: 'INVALID_VERIFICATION_LINK',
          });
          const stored = await AuthToken.findOne({
            tokenHash: hashToken(token),
          }).lean();
          assert.equal(stored.usedAt, null);
        },
      );
      await t.test(
        'verified and disabled duplicates receive the same conflict without modifying accounts or verification claims',
        async () => {
          const attemptsBefore = deliveryAttempts;
          for (const email of [account.email, 'disabled@example.com']) {
            const before = await User.findOne({ emailNormalized: email })
              .select('+passwordHash')
              .lean();
            const claimsBefore = await AuthToken.find({ userId: before._id })
              .select('+tokenHash')
              .lean();
            await assert.rejects(
              service.register({
                ...account,
                email,
                name: 'Replacement',
                password: 'Another123',
              }),
              { status: 409, code: 'EMAIL_ALREADY_REGISTERED' },
            );
            assert.deepEqual(
              await User.findById(before._id).select('+passwordHash').lean(),
              before,
            );
            assert.deepEqual(
              await AuthToken.find({ userId: before._id })
                .select('+tokenHash')
                .lean(),
              claimsBefore,
            );
          }
          assert.equal(deliveryAttempts, attemptsBefore);
        },
      );
      await t.test(
        'concurrent registration creates one account and sends one email while the duplicate returns a conflict',
        async () => {
          const email = 'concurrent@example.com';
          const attemptsBefore = deliveryAttempts;
          const results = await Promise.allSettled([
            service.register({ ...account, email }),
            service.register({ ...account, email }),
          ]);
          assert.equal(
            results.filter((result) => result.status === 'fulfilled').length,
            1,
          );
          const duplicate = results.find(
            (result) => result.status === 'rejected',
          );
          assert.equal(duplicate.reason.status, 409);
          assert.equal(duplicate.reason.code, 'EMAIL_ALREADY_REGISTERED');
          const user = await User.findOne({ emailNormalized: email }).lean();
          assert.equal(
            await User.countDocuments({ emailNormalized: email }),
            1,
          );
          assert.equal(await AuthToken.countDocuments({ userId: user._id }), 1);
          assert.equal(deliveryAttempts - attemptsBefore, 1);
        },
      );
      await t.test(
        'provider failures retain generic resend responses and the new/duplicate registration contract',
        async () => {
          const app = createApp({ service, settings });
          const server = await new Promise((resolve) => {
            const listener = app.listen(0, '127.0.0.1', () =>
              resolve(listener),
            );
          });
          const request = (path, body) =>
            fetch(
              `http://127.0.0.1:${server.address().port}/api/v1/auth${path}`,
              {
                method: 'POST',
                headers: {
                  Origin: settings.webOrigin,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(10000),
              },
            );
          const attemptsBefore = deliveryAttempts;
          const newEmail = 'delivery-failure@example.com';
          failDelivery = true;
          try {
            let acknowledgement;
            for (const email of [
              'missing@example.com',
              account.email,
              'disabled@example.com',
              'expired@example.com',
            ]) {
              const response = await request('/resend-verification', { email });
              const payload = await response.json();
              assert.equal(response.status, 202);
              acknowledgement ??= payload;
              assert.deepEqual(payload, acknowledgement);
              assert.equal(response.headers.get('cache-control'), 'no-store');
            }
            for (const email of [newEmail, account.email]) {
              const response = await request('/register', {
                ...account,
                email,
              });
              if (email === newEmail) {
                assert.equal(response.status, 202);
                assert.deepEqual(await response.json(), acknowledgement);
              } else {
                assert.equal(response.status, 409);
                assert.equal(
                  (await response.json()).error.code,
                  'EMAIL_ALREADY_REGISTERED',
                );
              }
            }
            assert.equal(deliveryAttempts - attemptsBefore, 2);
            for (const email of [newEmail, 'expired@example.com']) {
              const user = await User.findOne({
                emailNormalized: email,
              }).lean();
              assert.ok(user);
              assert.equal(user.emailVerifiedAt, null);
              assert.equal(
                await AuthToken.countDocuments({ userId: user._id }),
                0,
              );
            }
            failDelivery = false;
            for (const email of [newEmail, 'expired@example.com']) {
              await service.resend({ email });
              await service.verify({ token: emails.at(-1).token });
              const user = await User.findOne({
                emailNormalized: email,
              }).lean();
              assert.ok(user.emailVerifiedAt);
            }
          } finally {
            failDelivery = false;
            await new Promise((resolve) => server.close(resolve));
          }
        },
      );
    } finally {
      await connection.dropDatabase();
      await service.close();
    }
  },
);
