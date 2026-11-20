import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { config } from '../apps/api/src/config.js';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { createAuthService, hashToken } from '../apps/api/src/auth/service.js';
import { createApp } from '../apps/api/src/app.js';

test(
  'Atlas password recovery integrity, privacy and session revocation',
  {
    skip: !config.mongodbUri && 'Set private MONGODB_URI to run Atlas checks.',
  },
  async (t) => {
    const settings = {
      ...config,
      mongodbDbName: `mmm_recovery_test_${randomBytes(8).toString('hex')}`,
      jwtSecret: randomBytes(48).toString('base64url'),
      emailProvider: 'gmail',
      smtpUser: 'fixture@gmail.com',
      smtpAppPassword: 'testonlypassword',
      resendApiKey: '',
      emailFrom: '',
    };
    const database = createAuthDatabase(settings);
    let instant = new Date();
    const emails = [],
      verification = [],
      notices = [];
    let sender = async (input) => emails.push(input);
    let notify = async (input) => notices.push(input);
    const service = createAuthService({
      settings,
      database,
      now: () => instant,
      sendVerification: async (input) => verification.push(input),
      sendReset: (input) => sender(input),
      sendPasswordChanged: (input) => notify(input),
    });
    const connection = await database.connect();
    const { User, AuthToken, Session } = authModels(connection);
    let sequence = 0;
    async function account({ verified = true } = {}) {
      const input = {
        name: 'Recovery Test Couple',
        email: `case-${++sequence}@example.com`,
        password: 'Wedding123',
      };
      await service.register(input);
      const user = await User.findOneAndUpdate(
        { emailNormalized: input.email },
        { $set: { emailVerifiedAt: verified ? instant : null } },
        { returnDocument: 'after' },
      ).lean();
      return { ...input, id: user._id };
    }
    async function request(user) {
      await service.forgotPassword({ email: user.email });
      await service.drainRecovery();
      return emails.filter((email) => email.email === user.email).at(-1);
    }
    try {
      await t.test(
        'forgot stores only a reset hash without changing credentials or verification tokens',
        async () => {
          const user = await account();
          const before = await User.findById(user.id)
            .select('+passwordHash')
            .lean();
          const issued = await request(user);
          const stored = await AuthToken.findOne({
            userId: user.id,
            type: 'PASSWORD_RESET',
          })
            .select('+tokenHash')
            .lean();
          assert.equal(stored.tokenHash, hashToken(issued.token));
          assert.ok(!JSON.stringify(stored).includes(issued.token));
          assert.equal(
            stored.expiresAt.getTime() - instant.getTime(),
            30 * 60000,
          );
          assert.equal(
            (await User.findById(user.id).select('+passwordHash').lean())
              .passwordHash,
            before.passwordHash,
          );
          assert.ok(
            await AuthToken.exists({ userId: user.id, type: 'EMAIL_VERIFY' }),
          );
        },
      );
      await t.test(
        'unknown, disabled and delivery-failure requests have identical HTTP acknowledgements',
        async () => {
          const eligible = await account(),
            disabled = await account();
          await User.updateOne(
            { _id: disabled.id },
            { $set: { status: 'DISABLED' } },
          );
          sender = async () => {
            throw new Error('private-provider-error');
          };
          const server = createApp({ settings, service }).listen(
            0,
            '127.0.0.1',
          );
          await new Promise((resolve) => server.once('listening', resolve));
          try {
            const responses = [];
            for (const email of [
              'missing@example.com',
              disabled.email,
              eligible.email,
            ]) {
              const response = await fetch(
                `http://127.0.0.1:${server.address().port}/api/v1/auth/forgot-password`,
                {
                  method: 'POST',
                  headers: {
                    Origin: settings.webOrigin,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ email }),
                },
              );
              assert.equal(response.status, 202);
              const payload = await response.json();
              responses.push(payload.data);
            }
            assert.deepEqual(responses[0], responses[1]);
            assert.deepEqual(responses[1], responses[2]);
            await service.drainRecovery();
            assert.equal(
              await AuthToken.countDocuments({
                userId: eligible.id,
                type: 'PASSWORD_RESET',
              }),
              0,
            );
          } finally {
            await new Promise((resolve) => server.close(resolve));
            sender = async (input) => emails.push(input);
          }
          assert.ok(await request(eligible));
        },
      );
      await t.test(
        'cooldown and concurrent requests create one replacement and invalidate the older link',
        async () => {
          const user = await account();
          const first = await request(user);
          await Promise.all([
            service.forgotPassword({ email: user.email }),
            service.forgotPassword({ email: user.email }),
          ]);
          await service.drainRecovery();
          assert.equal(
            emails.filter((email) => email.email === user.email).length,
            1,
          );
          instant = new Date(instant.getTime() + 46000);
          await Promise.all([
            service.forgotPassword({ email: user.email }),
            service.forgotPassword({ email: user.email }),
          ]);
          await service.drainRecovery();
          assert.equal(
            emails.filter((email) => email.email === user.email).length,
            2,
          );
          await assert.rejects(
            service.resetPassword({
              token: first.token,
              password: 'Updated123',
            }),
            { code: 'INVALID_RESET_LINK' },
          );
        },
      );
      await t.test(
        'expiry and token purpose are enforced before TTL cleanup',
        async () => {
          const user = await account();
          const issued = await request(user);
          await assert.rejects(
            service.resetPassword({
              token: verification
                .filter((item) => item.email === user.email)
                .at(-1).token,
              password: 'Updated123',
            }),
            { code: 'INVALID_RESET_LINK' },
          );
          instant = new Date(instant.getTime() + 31 * 60000);
          await assert.rejects(
            service.resetPassword({
              token: issued.token,
              password: 'Updated123',
            }),
            { code: 'INVALID_RESET_LINK' },
          );
        },
      );
      await t.test(
        'reset changes the hash, consumes once, revokes all devices and leaves another account usable',
        async () => {
          const user = await account(),
            other = await account();
          const first = await service.login(user),
            second = await service.login(user),
            otherSession = await service.login(other);
          const issued = await request(user);
          await service.resetPassword({
            token: issued.token,
            password: 'Updated123',
          });
          await service.drainRecovery();
          const stored = await User.findById(user.id)
            .select('+passwordHash')
            .lean();
          assert.ok(await argon2.verify(stored.passwordHash, 'Updated123'));
          assert.ok(!(await argon2.verify(stored.passwordHash, user.password)));
          for (const device of [first, second]) {
            await assert.rejects(service.session(device), {
              code: 'SESSION_EXPIRED',
            });
            await assert.rejects(service.refresh(device), {
              code: 'SESSION_EXPIRED',
            });
          }
          assert.equal(
            await Session.countDocuments({
              userId: user.id,
              revokeReason: 'PASSWORD_CHANGE',
            }),
            2,
          );
          assert.ok((await service.session(otherSession)).user.emailVerified);
          await assert.rejects(service.login(user), {
            code: 'INVALID_CREDENTIALS',
          });
          assert.ok(
            (await service.login({ ...user, password: 'Updated123' })).data.user
              .emailVerified,
          );
          await assert.rejects(
            service.resetPassword({
              token: issued.token,
              password: 'Other123',
            }),
            { code: 'INVALID_RESET_LINK' },
          );
          assert.ok(notices.some((notice) => notice.email === user.email));
        },
      );
      await t.test(
        'two concurrent resets have exactly one winner',
        async () => {
          const user = await account(),
            issued = await request(user);
          const outcomes = await Promise.allSettled(
            ['First123', 'Second123'].map((password) =>
              service.resetPassword({ token: issued.token, password }),
            ),
          );
          assert.equal(
            outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
            1,
          );
          assert.equal(
            outcomes.find((outcome) => outcome.status === 'rejected').reason
              .code,
            'INVALID_RESET_LINK',
          );
          await service.drainRecovery();
        },
      );
      await t.test(
        'unverified accounts stay unverified and disabled accounts cannot consume a link',
        async () => {
          const user = await account({ verified: false }),
            issued = await request(user);
          await service.resetPassword({
            token: issued.token,
            password: 'Updated123',
          });
          assert.equal(
            (await User.findById(user.id).lean()).emailVerifiedAt,
            null,
          );
          await assert.rejects(
            service.login({ ...user, password: 'Updated123' }),
            { code: 'EMAIL_NOT_VERIFIED' },
          );
          const disabled = await account(),
            link = await request(disabled);
          await User.updateOne(
            { _id: disabled.id },
            { $set: { status: 'DISABLED' } },
          );
          await assert.rejects(
            service.resetPassword({
              token: link.token,
              password: 'Updated123',
            }),
            { code: 'INVALID_RESET_LINK' },
          );
          assert.equal(
            (
              await AuthToken.findOne({
                tokenHash: hashToken(link.token),
              }).lean()
            ).usedAt,
            null,
          );
          await service.drainRecovery();
        },
      );
      await t.test(
        'a failure during session revocation rolls back password and token consumption, allowing retry',
        async () => {
          const user = await account(),
            device = await service.login(user),
            issued = await request(user);
          const failure = t.mock.method(Session, 'updateMany', async () => {
            throw new Error('Injected revocation outage');
          });
          try {
            await assert.rejects(
              service.resetPassword({
                token: issued.token,
                password: 'Updated123',
              }),
              { code: 'AUTH_UNAVAILABLE' },
            );
          } finally {
            failure.mock.restore();
          }
          assert.equal(
            (
              await AuthToken.findOne({
                tokenHash: hashToken(issued.token),
              }).lean()
            ).usedAt,
            null,
          );
          assert.ok((await service.session(device)).user.emailVerified);
          assert.ok(
            await argon2.verify(
              (await User.findById(user.id).select('+passwordHash').lean())
                .passwordHash,
              user.password,
            ),
          );
          await service.resetPassword({
            token: issued.token,
            password: 'Updated123',
          });
          await service.drainRecovery();
        },
      );
      await t.test(
        'a login that read the old password cannot create a session after reset',
        async () => {
          const user = await account(),
            issued = await request(user);
          const started = Promise.withResolvers(),
            resume = Promise.withResolvers();
          const original = User.updateOne;
          const paused = t.mock.method(
            User,
            'updateOne',
            async function (filter, ...args) {
              if (filter.passwordHash) {
                started.resolve();
                await resume.promise;
              }
              return original.call(this, filter, ...args);
            },
          );
          const pending = service.login(user);
          try {
            await started.promise;
            await service.resetPassword({
              token: issued.token,
              password: 'Updated123',
            });
          } finally {
            resume.resolve();
            paused.mock.restore();
          }
          await assert.rejects(pending, { code: 'INVALID_CREDENTIALS' });
          assert.equal(
            await Session.countDocuments({ userId: user.id, revokedAt: null }),
            0,
          );
          await service.drainRecovery();
        },
      );
      await t.test(
        'a refresh paused at user lookup cannot bypass reset revocation',
        async () => {
          const user = await account(),
            device = await service.login(user),
            issued = await request(user);
          const started = Promise.withResolvers(),
            resume = Promise.withResolvers();
          const original = User.findOne;
          const paused = t.mock.method(
            User,
            'findOne',
            function (filter, ...args) {
              if (filter._id && filter.status === 'ACTIVE')
                return {
                  lean: async () => {
                    started.resolve();
                    await resume.promise;
                    return original.call(this, filter, ...args).lean();
                  },
                };
              return original.call(this, filter, ...args);
            },
          );
          const pending = service.refresh(device);
          try {
            await started.promise;
            await service.resetPassword({
              token: issued.token,
              password: 'Updated123',
            });
          } finally {
            resume.resolve();
            paused.mock.restore();
          }
          await assert.rejects(pending, { code: 'SESSION_EXPIRED' });
          await service.drainRecovery();
        },
      );
      await t.test(
        'HTTP recovery completes with a fake emailed token and clears cookies without auto-login',
        async () => {
          const user = await account(),
            device = await service.login(user);
          const server = createApp({ settings, service }).listen(
            0,
            '127.0.0.1',
          );
          await new Promise((resolve) => server.once('listening', resolve));
          const post = (path, body) =>
            fetch(
              `http://127.0.0.1:${server.address().port}/api/v1/auth/${path}`,
              {
                method: 'POST',
                headers: {
                  Origin: settings.webOrigin,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
              },
            );
          try {
            assert.equal(
              (await post('forgot-password', { email: user.email })).status,
              202,
            );
            await service.drainRecovery();
            const email = emails
              .filter((item) => item.email === user.email)
              .at(-1);
            const response = await post('reset-password', {
              token: email.token,
              password: 'HttpUpdated123',
            });
            assert.equal(response.status, 200);
            assert.deepEqual((await response.json()).data, {
              passwordReset: true,
            });
            assert.equal(response.headers.getSetCookie().length, 4);
            assert.ok(
              response.headers
                .getSetCookie()
                .every((value) => /Expires=Thu, 01 Jan 1970/.test(value)),
            );
            await assert.rejects(service.session(device), {
              code: 'SESSION_EXPIRED',
            });
            assert.ok(
              (await service.login({ ...user, password: 'HttpUpdated123' }))
                .data.user.emailVerified,
            );
          } finally {
            await service.drainRecovery();
            await new Promise((resolve) => server.close(resolve));
          }
        },
      );
      await t.test(
        'an older failed delivery cannot remove the replacement link',
        async () => {
          const user = await account();
          const started = Promise.withResolvers(),
            release = Promise.withResolvers(),
            replacement = Promise.withResolvers();
          let count = 0;
          sender = async (input) => {
            if (++count === 1) {
              started.resolve(input);
              await release.promise;
              throw new Error('Injected old send failure');
            }
            emails.push(input);
            replacement.resolve(input);
          };
          try {
            await service.forgotPassword({ email: user.email });
            const old = await started.promise;
            instant = new Date(instant.getTime() + 46000);
            await service.forgotPassword({ email: user.email });
            const current = await replacement.promise;
            release.resolve();
            await service.drainRecovery();
            assert.ok(
              await AuthToken.exists({
                tokenHash: hashToken(current.token),
                usedAt: null,
              }),
            );
            await assert.rejects(
              service.resetPassword({
                token: old.token,
                password: 'Updated123',
              }),
              { code: 'INVALID_RESET_LINK' },
            );
            await service.resetPassword({
              token: current.token,
              password: 'Updated123',
            });
          } finally {
            release.resolve();
            await service.drainRecovery();
            sender = async (input) => emails.push(input);
          }
        },
      );
      await t.test(
        'notification failure does not report a committed password change as failed',
        async () => {
          const user = await account(),
            issued = await request(user);
          notify = async () => {
            throw new Error('Private notification failure');
          };
          try {
            await service.resetPassword({
              token: issued.token,
              password: 'Updated123',
            });
            await service.drainRecovery();
            assert.ok(
              (await service.login({ ...user, password: 'Updated123' })).data
                .user.emailVerified,
            );
          } finally {
            notify = async (input) => notices.push(input);
          }
        },
      );
    } finally {
      await service.drainRecovery();
      await connection.dropDatabase();
      await service.close();
    }
  },
);
