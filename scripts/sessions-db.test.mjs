import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { config } from '../apps/api/src/config.js';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { createAuthService, hashToken } from '../apps/api/src/auth/service.js';

test(
  'Atlas login, persistent sessions, rotation and logout',
  {
    skip: !config.mongodbUri && 'Set private MONGODB_URI to run Atlas checks.',
  },
  async (t) => {
    const settings = {
      ...config,
      mongodbDbName: `mmm_sessions_test_${randomBytes(8).toString('hex')}`,
      jwtSecret: randomBytes(48).toString('base64url'),
      resendApiKey: 'test-only',
      emailFrom: 'test@example.com',
    };
    const base = new Date();
    let instant = new Date(base);
    const database = createAuthDatabase(settings);
    const service = createAuthService({
      settings,
      database,
      now: () => instant,
      sendVerification: async () => {},
    });
    const connection = await database.connect();
    const { User, Session } = authModels(connection);
    const account = {
      name: 'Test Couple',
      email: 'verified@example.com',
      password: 'Wedding123',
    };
    try {
      await service.register(account);
      await User.updateOne(
        { emailNormalized: account.email },
        { $set: { emailVerifiedAt: base } },
      );
      await service.register({ ...account, email: 'unverified@example.com' });
      await service.register({ ...account, email: 'disabled@example.com' });
      await User.updateOne(
        { emailNormalized: 'disabled@example.com' },
        { $set: { status: 'DISABLED', emailVerifiedAt: base } },
      );
      const login = () =>
        service.login({
          email: account.email,
          password: account.password,
          userAgent: 'Native auth integration test',
        });
      await t.test(
        'wrong, missing and disabled accounts receive the same credential error; unverified status requires the correct password',
        async () => {
          for (const input of [
            { email: 'missing@example.com', password: account.password },
            { email: account.email, password: 'Wrong123' },
            { email: 'disabled@example.com', password: account.password },
            { email: 'unverified@example.com', password: 'Wrong123' },
          ])
            await assert.rejects(service.login(input), {
              code: 'INVALID_CREDENTIALS',
              status: 401,
            });
          await assert.rejects(
            service.login({
              email: 'unverified@example.com',
              password: account.password,
            }),
            { code: 'EMAIL_NOT_VERIFIED', status: 403 },
          );
          assert.equal(await Session.countDocuments(), 0);
        },
      );
      await t.test(
        'login stores only refresh hashes, issues a safe identity and checks access signatures',
        async () => {
          const issued = await login();
          const stored = await Session.findOne({
            refreshTokenHash: hashToken(issued.refreshToken),
          })
            .select('+refreshTokenHash +usedRefreshTokens')
            .lean();
          assert.ok(stored);
          assert.ok(!JSON.stringify(stored).includes(issued.refreshToken));
          assert.ok(!JSON.stringify(issued.data).includes(issued.accessToken));
          assert.ok(!JSON.stringify(issued.data).includes(issued.refreshToken));
          assert.ok(
            (await service.session({ accessToken: issued.accessToken })).user
              .email === account.email,
          );
          await assert.rejects(
            service.session({ accessToken: issued.accessToken + 'x' }),
            { code: 'SESSION_EXPIRED' },
          );
        },
      );
      await t.test(
        'an expired access token is renewed with a rotated refresh token and fixed absolute expiry',
        async () => {
          const issued = await login();
          instant = new Date(base.getTime() + 16 * 60000);
          await assert.rejects(
            service.session({ accessToken: issued.accessToken }),
            { code: 'SESSION_EXPIRED' },
          );
          const renewed = await service.refresh({
            refreshToken: issued.refreshToken,
          });
          assert.ok(renewed.refreshToken !== issued.refreshToken);
          assert.equal(renewed.expiresAt.getTime(), issued.expiresAt.getTime());
          assert.ok(
            (await service.session({ accessToken: renewed.accessToken })).user
              .emailVerified,
          );
          instant = new Date(base);
        },
      );
      await t.test(
        'concurrent refreshes have one winner and a retryable loser without revocation',
        async () => {
          const issued = await login();
          const outcomes = await Promise.allSettled([
            service.refresh({ refreshToken: issued.refreshToken }),
            service.refresh({ refreshToken: issued.refreshToken }),
          ]);
          assert.equal(
            outcomes.filter((result) => result.status === 'fulfilled').length,
            1,
          );
          const loser = outcomes.find((result) => result.status === 'rejected');
          assert.equal(loser.reason.code, 'REFRESH_IN_PROGRESS');
          const winner = outcomes.find(
            (result) => result.status === 'fulfilled',
          ).value;
          assert.ok(
            (await service.session({ accessToken: winner.accessToken })).user
              .emailVerified,
          );
        },
      );
      await t.test(
        'replayed consumed tokens revoke their device family after the concurrency grace',
        async () => {
          const issued = await login();
          const otherDevice = await login();
          const renewed = await service.refresh({
            refreshToken: issued.refreshToken,
          });
          instant = new Date(base.getTime() + 6000);
          await assert.rejects(
            service.refresh({ refreshToken: issued.refreshToken }),
            { code: 'SESSION_EXPIRED' },
          );
          await assert.rejects(
            service.session({ accessToken: renewed.accessToken }),
            { code: 'SESSION_EXPIRED' },
          );
          assert.ok(
            (await service.session({ accessToken: otherDevice.accessToken }))
              .user.emailVerified,
          );
          instant = new Date(base);
        },
      );
      await t.test(
        'bounded refresh history requires a new login instead of growing without limit',
        async () => {
          const issued = await login();
          await Session.updateOne(
            { refreshTokenHash: hashToken(issued.refreshToken) },
            {
              $set: {
                usedRefreshTokens: Array.from({ length: 8192 }, () => ({
                  hash: hashToken(randomBytes(32)),
                  usedAt: base,
                })),
              },
            },
          );
          await assert.rejects(
            service.refresh({ refreshToken: issued.refreshToken }),
            { code: 'SESSION_EXPIRED' },
          );
          await assert.rejects(
            service.session({ accessToken: issued.accessToken }),
            { code: 'SESSION_EXPIRED' },
          );
        },
      );
      await t.test(
        'a guessed refresh secret cannot revoke another session by id',
        async () => {
          const issued = await login();
          const guess = `${issued.refreshToken.split('.')[0]}.${randomBytes(32).toString('base64url')}`;
          await assert.rejects(service.refresh({ refreshToken: guess }), {
            code: 'SESSION_EXPIRED',
          });
          assert.ok(
            (await service.session({ accessToken: issued.accessToken })).user
              .emailVerified,
          );
        },
      );
      await t.test(
        'logout immediately revokes the current device only and is idempotent',
        async () => {
          const first = await login();
          const second = await login();
          await service.logout(first);
          await assert.rejects(
            service.session({ accessToken: first.accessToken }),
            { code: 'SESSION_EXPIRED' },
          );
          await assert.rejects(
            service.refresh({ refreshToken: first.refreshToken }),
            { code: 'SESSION_EXPIRED' },
          );
          assert.ok(
            (await service.session({ accessToken: second.accessToken })).user
              .emailVerified,
          );
          await service.logout(first);
          instant = new Date(base.getTime() + 16 * 60000);
          await service.logout(second);
          await assert.rejects(
            service.refresh({ refreshToken: second.refreshToken }),
            { code: 'SESSION_EXPIRED' },
          );
          instant = new Date(base);
        },
      );
      await t.test(
        'logout with expired access revokes a refresh that rotated before the logout request',
        async () => {
          const issued = await login();
          instant = new Date(base.getTime() + 16 * 60000);
          try {
            const otherDevice = await login();
            const renewed = await service.refresh({
              refreshToken: issued.refreshToken,
            });
            // The renewal response is still in flight, so logout has the old browser cookies.
            await service.logout(issued);
            await assert.rejects(
              service.session({ accessToken: renewed.accessToken }),
              { code: 'SESSION_EXPIRED' },
            );
            await assert.rejects(
              service.refresh({ refreshToken: renewed.refreshToken }),
              { code: 'SESSION_EXPIRED' },
            );
            assert.ok(
              (await service.session({ accessToken: otherDevice.accessToken }))
                .user.emailVerified,
            );
          } finally {
            instant = new Date(base);
          }
        },
      );
      await t.test(
        'a transient user lookup failure preserves the browser refresh token for retry',
        async () => {
          const issued = await login();
          const original = User.findOne;
          const unavailable = t.mock.method(
            User,
            'findOne',
            function (filter, ...args) {
              if (filter._id && filter.status === 'ACTIVE')
                return {
                  lean: async () => {
                    throw new Error('Injected lookup outage');
                  },
                };
              return original.call(this, filter, ...args);
            },
          );
          try {
            await assert.rejects(
              service.refresh({ refreshToken: issued.refreshToken }),
              { status: 503, code: 'AUTH_UNAVAILABLE' },
            );
          } finally {
            unavailable.mock.restore();
          }
          const stored = await Session.findById(
            issued.refreshToken.split('.')[0],
          )
            .select('+refreshTokenHash +usedRefreshTokens')
            .lean();
          assert.equal(stored.refreshTokenHash, hashToken(issued.refreshToken));
          assert.equal(stored.usedRefreshTokens.length, 0);
          instant = new Date(base.getTime() + 6000);
          try {
            const renewed = await service.refresh({
              refreshToken: issued.refreshToken,
            });
            assert.ok(
              (await service.session({ accessToken: renewed.accessToken })).user
                .emailVerified,
            );
          } finally {
            instant = new Date(base);
          }
        },
      );
      await t.test(
        'logout wins when refresh is paused during the user lookup',
        async () => {
          const issued = await login();
          const started = Promise.withResolvers();
          const resume = Promise.withResolvers();
          const original = User.findOne;
          const lookup = t.mock.method(
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
          const pending = service.refresh({
            refreshToken: issued.refreshToken,
          });
          try {
            await started.promise;
            await service.logout({ refreshToken: issued.refreshToken });
          } finally {
            resume.resolve();
            lookup.mock.restore();
          }
          await assert.rejects(pending, { code: 'SESSION_EXPIRED' });
          await assert.rejects(
            service.refresh({ refreshToken: issued.refreshToken }),
            { code: 'SESSION_EXPIRED' },
          );
        },
      );
      await t.test(
        'a guessed refresh secret cannot log out another session, including after rotation',
        async () => {
          const issued = await login();
          const renewed = await service.refresh({
            refreshToken: issued.refreshToken,
          });
          const guess = `${issued.refreshToken.split('.')[0]}.${randomBytes(32).toString('base64url')}`;
          await service.logout({ refreshToken: guess });
          assert.ok(
            (await service.session({ accessToken: renewed.accessToken })).user
              .emailVerified,
          );
        },
      );
      await t.test(
        'absolute session expiry is enforced before TTL cleanup',
        async () => {
          const issued = await login();
          instant = new Date(base.getTime() + 31 * 86400000);
          await assert.rejects(
            service.refresh({ refreshToken: issued.refreshToken }),
            { code: 'SESSION_EXPIRED' },
          );
          instant = new Date(base);
        },
      );
      await t.test(
        'disabled users lose both access and refresh eligibility',
        async () => {
          const issued = await login();
          await User.updateOne(
            { emailNormalized: account.email },
            { $set: { status: 'DISABLED' } },
          );
          await assert.rejects(
            service.session({ accessToken: issued.accessToken }),
            { code: 'SESSION_EXPIRED' },
          );
          await assert.rejects(
            service.refresh({ refreshToken: issued.refreshToken }),
            { code: 'SESSION_EXPIRED' },
          );
          await User.updateOne(
            { emailNormalized: account.email },
            { $set: { status: 'ACTIVE' } },
          );
        },
      );
      await t.test(
        'a fresh backend connection restores an existing session with the persistent signing secret',
        async () => {
          const issued = await login();
          const secondDatabase = createAuthDatabase(settings);
          const restarted = createAuthService({
            settings,
            database: secondDatabase,
            now: () => instant,
            sendVerification: async () => {},
          });
          try {
            assert.ok(
              (await restarted.session({ accessToken: issued.accessToken }))
                .user.emailVerified,
            );
          } finally {
            await restarted.close();
          }
        },
      );
    } finally {
      await connection.dropDatabase();
      await service.close();
    }
  },
);
