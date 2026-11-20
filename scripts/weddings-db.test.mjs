import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { config } from '../apps/api/src/config.js';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { createAuthService } from '../apps/api/src/auth/service.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';
import { weddingModels } from '../apps/api/src/weddings/models.js';
import { weddingToday } from '../apps/api/src/weddings/validation.js';
import { weddingInput } from '../apps/web/src/features/weddings/form-data.js';
import { createApp } from '../apps/api/src/app.js';

const input = {
  name: 'Sisir weds Priyanka',
  brideName: 'Priyanka',
  groomName: 'Sisir',
  mainDate: '2027-02-20',
  tradition: 'ODIA',
  location: { city: 'Bhubaneswar', state: 'Odisha', countryCode: 'IN' },
  estimatedBudget: { amountMinor: 350000005, currency: 'INR' },
};

test(
  'Atlas wedding creation, membership, retry and authorization integrity',
  {
    skip: !config.mongodbUri && 'Set private MONGODB_URI to run Atlas checks.',
  },
  async (t) => {
    const settings = {
      ...config,
      emailProvider: 'resend',
      mongodbDbName: 'mmm_weddings_test_' + randomBytes(8).toString('hex'),
      jwtSecret: randomBytes(48).toString('base64url'),
      resendApiKey: 'test-only',
      emailFrom: 'test@example.com',
    };
    const database = createAuthDatabase(settings);
    const weddings = createWeddingService({ database });
    let contextFails = false;
    const auth = createAuthService({
      settings,
      database,
      sendVerification: async () => {},
      getWeddingContext: async (id) => {
        if (contextFails) throw new Error('Injected context outage');
        return weddings.current(id);
      },
    });
    const connection = await database.connect();
    const { User } = authModels(connection);
    const { Wedding, WeddingMember, WeddingCreationRequest } =
      weddingModels(connection);
    let sequence = 0;
    async function account() {
      const record = {
        name: 'Wedding Test Couple',
        email: 'case-' + ++sequence + '@example.com',
        password: 'Wedding123',
      };
      await auth.register(record);
      const user = await User.findOneAndUpdate(
        { emailNormalized: record.email },
        { $set: { emailVerifiedAt: new Date() } },
        { returnDocument: 'after' },
      );
      return { ...record, id: String(user._id) };
    }
    try {
      await t.test(
        'creation atomically saves a wedding and Admin; minor-unit money is BSON Int64 and the calendar date stays unchanged',
        async () => {
          const user = await account();
          const key = randomUUID();
          const result = await weddings.create(user.id, input, key);
          assert.equal(result.membership.role, 'ADMIN');
          assert.equal(result.membership.financeAccess, true);
          assert.equal(result.wedding.mainDate, input.mainDate);
          assert.equal(result.wedding.estimatedBudget.amountMinor, 350000005);
          const saved = await Wedding.findById(result.wedding.id);
          assert.equal(String(saved.createdBy), user.id);
          assert.equal(saved.mode, 'PLANNING');
          assert.equal(
            await WeddingMember.countDocuments({
              userId: user.id,
              role: 'ADMIN',
              status: 'ACTIVE',
            }),
            1,
          );
          const [types] = await Wedding.aggregate([
            { $match: { _id: saved._id } },
            {
              $project: {
                budgetType: { $type: '$estimatedBudget.amountMinor' },
              },
            },
          ]);
          assert.equal(types.budgetType, 'long');
          const requests = await WeddingCreationRequest.find({
            userId: user.id,
          }).lean();
          assert.equal(requests.length, 1);
          assert.ok(!JSON.stringify(requests).includes(key));
          const issued = await auth.login(user);
          assert.equal(issued.data.wedding.id, result.wedding.id);
          assert.equal(
            (await auth.session({ accessToken: issued.accessToken })).membership
              .role,
            'ADMIN',
          );
        },
      );
      await t.test(
        'a verified account with no wedding has a null wedding context',
        async () => {
          const user = await account();
          const issued = await auth.login(user);
          assert.deepEqual(await weddings.current(user.id), {
            wedding: null,
            membership: null,
          });
          assert.equal(issued.data.wedding, null);
        },
      );
      await t.test(
        'concurrent retries with one key return the same wedding and one membership',
        async () => {
          const user = await account(),
            key = randomUUID();
          const results = await Promise.all(
            Array.from({ length: 4 }, () =>
              weddings.create(user.id, input, key),
            ),
          );
          assert.equal(
            new Set(results.map((result) => result.wedding.id)).size,
            1,
          );
          assert.equal(await Wedding.countDocuments({ createdBy: user.id }), 1);
          assert.equal(
            await WeddingMember.countDocuments({ userId: user.id }),
            1,
          );
          await assert.rejects(
            weddings.create(user.id, { ...input, name: 'Changed title' }, key),
            { code: 'IDEMPOTENCY_CONFLICT' },
          );
        },
      );
      await t.test(
        'a winner committing between the retry request and membership reads still returns the same wedding',
        async () => {
          const user = await account(),
            key = randomUUID();
          const paused = Promise.withResolvers(),
            release = Promise.withResolvers();
          const original = WeddingCreationRequest.findOne;
          let armed = true;
          WeddingCreationRequest.findOne = function (...args) {
            const query = original.apply(this, args);
            if (armed && String(args[0].userId) === user.id) {
              armed = false;
              const lean = query.lean;
              query.lean = async function (...options) {
                const result = await lean.apply(this, options);
                assert.equal(result, null);
                paused.resolve();
                await release.promise;
                return result;
              };
            }
            return query;
          };
          const first = weddings.create(user.id, input, key).then(
            (value) => ({ value }),
            (error) => ({ error }),
          );
          try {
            await paused.promise;
            const winner = await weddings.create(user.id, input, key);
            release.resolve();
            const outcome = await first;
            if (outcome.error) throw outcome.error;
            assert.equal(outcome.value.wedding.id, winner.wedding.id);
            assert.equal(
              await Wedding.countDocuments({ createdBy: user.id }),
              1,
            );
            assert.equal(
              await WeddingMember.countDocuments({ userId: user.id }),
              1,
            );
            assert.equal(
              await WeddingCreationRequest.countDocuments({ userId: user.id }),
              1,
            );
          } finally {
            release.resolve();
            await first;
            WeddingCreationRequest.findOne = original;
          }
        },
      );
      await t.test(
        'new weddings reject past dates without leaving creation records',
        async () => {
          const user = await account();
          await assert.rejects(
            weddings.create(
              user.id,
              { ...input, mainDate: '2000-01-01' },
              randomUUID(),
            ),
            (error) =>
              error.code === 'VALIDATION_ERROR' &&
              !!error.details?.fields?.mainDate,
          );
          assert.equal(await Wedding.countDocuments({ createdBy: user.id }), 0);
          assert.equal(
            await WeddingMember.countDocuments({ userId: user.id }),
            0,
          );
          assert.equal(
            await WeddingCreationRequest.countDocuments({ userId: user.id }),
            0,
          );
        },
      );
      await t.test(
        'the actual web serializer and API recover a lost creation response after India midnight; new past dates remain rejected',
        async () => {
          const user = await account(),
            key = randomUUID();
          let clock = new Date();
          const service = createWeddingService({ database, now: () => clock });
          const today = weddingToday(clock);
          const form = {
            ...input,
            mainDate: today,
            city: 'Bhubaneswar',
            state: 'Odisha',
            budget: '3500000.05',
          };
          const todayInput = weddingInput(form, undefined, () => clock);
          const previous = { key, body: JSON.stringify(todayInput) };
          const created = await service.create(user.id, todayInput, key);
          const nextDay = new Date(
            new Date(today + 'T12:00:00Z').getTime() + 86400000,
          )
            .toISOString()
            .slice(0, 10);
          // Cross midnight by less than 24 hours, keeping the idempotency record valid.
          clock = new Date(nextDay + 'T00:00:00+05:30');
          assert.equal(
            (await service.read(user.id, created.wedding.id)).wedding.mainDate,
            today,
          );
          assert.equal(
            (await service.current(user.id)).wedding.id,
            created.wedding.id,
          );
          assert.equal(
            (
              await service.create(
                user.id,
                weddingInput(form, previous, () => clock),
                previous.key,
              )
            ).wedding.id,
            created.wedding.id,
          );
          assert.equal(await Wedding.countDocuments({ createdBy: user.id }), 1);
          assert.equal(
            await WeddingMember.countDocuments({ userId: user.id }),
            1,
          );
          assert.equal(
            await WeddingCreationRequest.countDocuments({ userId: user.id }),
            1,
          );
          assert.throws(() => weddingInput(form, undefined, () => clock));
          assert.throws(() =>
            weddingInput({ ...form, city: 'Cuttack' }, previous, () => clock),
          );
          const other = await account();
          await assert.rejects(
            service.create(other.id, todayInput, randomUUID()),
            { code: 'VALIDATION_ERROR' },
          );
          const future = await service.create(
            other.id,
            { ...input, mainDate: nextDay },
            randomUUID(),
          );
          assert.equal(future.wedding.mainDate, nextDay);
        },
      );
      await t.test(
        'different-key races and second-wedding attempts leave no orphan weddings',
        async () => {
          const user = await account();
          const results = await Promise.allSettled(
            Array.from({ length: 4 }, () =>
              weddings.create(user.id, input, randomUUID()),
            ),
          );
          assert.equal(
            results.filter((r) => r.status === 'fulfilled').length,
            1,
          );
          for (const r of results.filter((r) => r.status === 'rejected'))
            assert.equal(r.reason.code, 'WEDDING_ALREADY_EXISTS');
          assert.equal(await Wedding.countDocuments({ createdBy: user.id }), 1);
          assert.equal(
            await WeddingMember.countDocuments({ userId: user.id }),
            1,
          );
        },
      );
      await t.test(
        'membership failure rolls back wedding creation, idempotency and the user write',
        async () => {
          const user = await account();
          const before = await User.findById(user.id).lean();
          const original = WeddingMember.create;
          WeddingMember.create = async () => {
            throw new Error('Injected member failure');
          };
          try {
            await assert.rejects(
              weddings.create(user.id, input, randomUUID()),
              { code: 'WEDDING_UNAVAILABLE' },
            );
          } finally {
            WeddingMember.create = original;
          }
          assert.equal(await Wedding.countDocuments({ createdBy: user.id }), 0);
          assert.equal(
            await WeddingCreationRequest.countDocuments({ userId: user.id }),
            0,
          );
          assert.equal((await User.findById(user.id)).__v, before.__v);
        },
      );
      await t.test(
        'budget is optional and no events or tasks are generated',
        async () => {
          const user = await account();
          const withoutBudget = { ...input };
          delete withoutBudget.estimatedBudget;
          const result = await weddings.create(
            user.id,
            withoutBudget,
            randomUUID(),
          );
          assert.equal('estimatedBudget' in result.wedding, false);
          assert.equal(
            await connection.collection('events').countDocuments({}),
            0,
          );
          assert.equal(
            await connection.collection('tasks').countDocuments({}),
            0,
          );
        },
      );
      await t.test(
        'nonmembers and removed members cannot read weddings; Family/Viewer context excludes restricted budgets',
        async () => {
          const owner = await account(),
            viewer = await account(),
            family = await account(),
            outsider = await account();
          const created = await weddings.create(owner.id, input, randomUUID());
          const fixtureMember = (user, role) =>
            WeddingMember.create({
              weddingId: created.wedding.id,
              userId: user.id,
              role,
              status: 'ACTIVE',
              joinedAt: new Date(),
              createdBy: owner.id,
            });
          await fixtureMember(viewer, 'VIEWER');
          await fixtureMember(family, 'FAMILY_MEMBER');
          for (const user of [viewer, family]) {
            const context = await weddings.read(user.id, created.wedding.id);
            assert.equal('estimatedBudget' in context.wedding, false);
            assert.equal(context.membership.financeAccess, false);
            const login = await auth.login(user);
            assert.equal('estimatedBudget' in login.data.wedding, false);
            await assert.rejects(
              weddings.create(user.id, input, randomUUID()),
              { code: 'WEDDING_ALREADY_EXISTS' },
            );
          }
          await WeddingMember.updateOne(
            { userId: family.id },
            { $set: { financeAccess: true } },
          );
          assert.equal(
            (await weddings.read(family.id, created.wedding.id)).wedding
              .estimatedBudget.amountMinor,
            input.estimatedBudget.amountMinor,
          );
          await WeddingMember.updateOne(
            { userId: viewer.id },
            { $set: { financeAccess: true } },
          );
          assert.equal(
            'estimatedBudget' in (await weddings.current(viewer.id)).wedding,
            false,
          );
          await assert.rejects(weddings.read(outsider.id, created.wedding.id), {
            code: 'WEDDING_NOT_FOUND',
          });
          await WeddingMember.updateOne(
            { userId: viewer.id },
            { $set: { status: 'REMOVED' } },
          );
          await assert.rejects(weddings.read(viewer.id, created.wedding.id), {
            code: 'WEDDING_NOT_FOUND',
          });
          assert.equal((await weddings.current(viewer.id)).wedding, null);
        },
      );
      await t.test(
        'disabled/unverified users cannot create a wedding through the service',
        async () => {
          for (const patch of [
            { status: 'DISABLED' },
            { emailVerifiedAt: null },
          ]) {
            const user = await account();
            await User.updateOne({ _id: user.id }, { $set: patch });
            await assert.rejects(
              weddings.create(user.id, input, randomUUID()),
              { code: 'SESSION_EXPIRED' },
            );
            assert.equal(
              await Wedding.countDocuments({ createdBy: user.id }),
              0,
            );
          }
        },
      );
      await t.test(
        'a failed wedding lookup does not consume a refresh token',
        async () => {
          const user = await account(),
            issued = await auth.login(user);
          contextFails = true;
          try {
            await assert.rejects(
              auth.refresh({ refreshToken: issued.refreshToken }),
              { code: 'AUTH_UNAVAILABLE' },
            );
          } finally {
            contextFails = false;
          }
          const restored = await auth.refresh({
            refreshToken: issued.refreshToken,
          });
          assert.equal(restored.data.user.id, user.id);
        },
      );
      await t.test(
        'real HTTP sessions create and reread the wedding, reject anonymous users and deny another account',
        async () => {
          const user = await account(),
            other = await account();
          const app = createApp({ service: auth, weddings, settings });
          const server = await new Promise((resolve) => {
            const listener = app.listen(0, '127.0.0.1', () =>
              resolve(listener),
            );
          });
          const base = 'http://127.0.0.1:' + server.address().port + '/api/v1';
          try {
            const csrf = await fetch(base + '/auth/csrf');
            const token = (await csrf.json()).data.csrfToken;
            const issued = await auth.login(user);
            const cookie =
              csrf.headers
                .getSetCookie()
                .map((entry) => entry.split(';')[0])
                .join('; ') +
              '; mmm_access=' +
              issued.accessToken;
            const response = await fetch(base + '/weddings', {
              method: 'POST',
              headers: {
                Origin: settings.webOrigin,
                Cookie: cookie,
                'Content-Type': 'application/json',
                'X-CSRF-Token': token,
                'Idempotency-Key': randomUUID(),
              },
              body: JSON.stringify(input),
            });
            assert.equal(response.status, 201);
            assert.equal(response.headers.get('etag'), '"0"');
            const created = (await response.json()).data;
            const session = await fetch(base + '/auth/session', {
              headers: { Cookie: cookie },
            });
            assert.equal(
              (await session.json()).data.wedding.id,
              created.wedding.id,
            );
            assert.equal(
              (
                await fetch(base + '/weddings/' + created.wedding.id, {
                  headers: { Cookie: cookie },
                })
              ).status,
              200,
            );
            assert.equal(
              (await fetch(base + '/weddings/' + created.wedding.id)).status,
              401,
            );
            const otherLogin = await auth.login(other);
            assert.equal(
              (
                await fetch(base + '/weddings/' + created.wedding.id, {
                  headers: { Cookie: 'mmm_access=' + otherLogin.accessToken },
                })
              ).status,
              404,
            );
          } finally {
            await new Promise((resolve) => server.close(resolve));
          }
        },
      );
    } finally {
      await connection.dropDatabase();
      await auth.close();
    }
  },
);
