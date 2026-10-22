import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';
import {
  createWeddingSchema,
  weddingToday as serverToday,
} from '../apps/api/src/weddings/validation.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';
import {
  budgetMinor,
  budgetLabel,
  suggestedWeddingName,
  weddingInput,
  weddingToday,
  setupSchema,
  setupSchemaForSubmission,
} from '../apps/web/src/features/weddings/form-data.js';

// This dependency belongs to the web workspace, not the root test scripts.
const { zodResolver } = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
)('@hookform/resolvers/zod');

const valid = {
  name: 'Sisir weds Priyanka',
  brideName: 'Priyanka Das',
  groomName: 'Sisir Das',
  mainDate: '2027-02-20',
  tradition: 'ODIA',
  location: { city: 'Bhubaneswar', state: 'Odisha', countryCode: 'IN' },
};

test('wedding input accepts a real local date and optional exact minor-unit budget; rejects injected privileges and unsupported uploads', () => {
  assert.equal(createWeddingSchema.parse(valid).mainDate, '2027-02-20');
  assert.equal(createWeddingSchema.parse(valid).timezone, 'Asia/Kolkata');
  for (const patch of [
    { mainDate: '2027-02-29' },
    { mainDate: '2028-02-30' },
    { role: 'ADMIN' },
    { createdBy: 'someone' },
    { coverMediaId: 'untrusted' },
    { timezone: 'UTC' },
    { estimatedBudget: { amountMinor: 0.5, currency: 'INR' } },
    { location: { ...valid.location, countryCode: 'US' } },
  ])
    assert.equal(
      createWeddingSchema.safeParse({ ...valid, ...patch }).success,
      false,
    );
  assert.equal(
    createWeddingSchema.safeParse({ ...valid, mainDate: '2028-02-29' }).success,
    true,
  );
  assert.equal(
    createWeddingSchema.safeParse({ ...valid, mainDate: '2020-02-20' }).success,
    true,
    'Calendar structure is independent of the creation-only date rule',
  );
});

test('name suggestions and budget conversion preserve user text and avoid floating point money', () => {
  assert.equal(
    suggestedWeddingName(' Priyanka Das ', ' Sisir Das '),
    'Sisir weds Priyanka',
  );
  assert.equal(suggestedWeddingName('', 'Sisir'), '');
  assert.equal(budgetMinor('0.29'), 29);
  assert.equal(budgetMinor('3500000.05'), 350000005);
  assert.equal(budgetMinor(''), undefined);
  for (const input of ['-1', '1e6', '2.005', 'abc', '99999999999999999999'])
    assert.equal(budgetMinor(input), null);
  const input = weddingInput({
    ...valid,
    name: 'Our beautiful celebration',
    city: 'Bhubaneswar',
    state: 'Odisha',
    budget: '',
  });
  assert.equal(input.name, 'Our beautiful celebration');
  assert.equal('estimatedBudget' in input, false);
});

test('INR formatting preserves every accepted paisa, including the maximum safe integer', () => {
  for (const [paise, expected] of [
    [0, '₹0.00'],
    [1, '₹0.01'],
    [99, '₹0.99'],
    [100, '₹1.00'],
    [101, '₹1.01'],
    [35000075, '₹3,50,000.75'],
    [Number.MAX_SAFE_INTEGER, '₹9,00,71,99,25,47,409.91'],
  ])
    assert.equal(budgetLabel(paise), expected);
});

test('India date boundaries agree on web/API; setup accepts today/future and rejects yesterday', () => {
  for (const [instant, expected] of [
    ['2026-10-21T18:29:59.999Z', '2026-10-21'],
    ['2026-10-21T18:30:00.000Z', '2026-10-22'],
    ['2028-02-28T18:30:00.000Z', '2028-02-29'],
    ['2026-12-31T18:30:00.000Z', '2027-01-01'],
  ]) {
    assert.equal(weddingToday(new Date(instant)), expected);
    assert.equal(serverToday(new Date(instant)), expected);
  }
  const today = weddingToday();
  const shift = (offset) =>
    new Date(new Date(today + 'T12:00:00Z').getTime() + offset * 86400000)
      .toISOString()
      .slice(0, 10);
  const data = { ...valid, city: 'Bhubaneswar', state: 'Odisha', budget: '' };
  for (const [mainDate, expected] of [
    [shift(-1), false],
    [today, true],
    [shift(1), true],
  ])
    assert.equal(
      setupSchema.safeParse({ ...data, mainDate }).success,
      expected,
    );
});

test('the form resolver and serializer allow only unchanged attempted payloads after India midnight', async () => {
  let clock = new Date('2026-10-22T18:29:59.999Z');
  const values = {
    ...valid,
    mainDate: '2026-10-22',
    city: 'Bhubaneswar',
    state: 'Odisha',
    budget: '125000.50',
  };
  const previous = {
    key: 'previous-attempt-key',
    body: JSON.stringify(weddingInput(values, undefined, () => clock)),
  };
  const resolve = (data, attempt) =>
    zodResolver(setupSchemaForSubmission(attempt, () => clock))(
      data,
      {},
      { fields: {}, shouldUseNativeValidation: false },
    );
  assert.deepEqual((await resolve(values)).errors, {});
  clock = new Date('2026-10-22T18:30:00.000Z');
  assert.ok((await resolve(values)).errors.mainDate);
  const retried = await resolve(values, previous);
  assert.deepEqual(retried.errors, {});
  assert.equal(
    JSON.stringify(weddingInput(retried.values, previous, () => clock)),
    previous.body,
  );
  // Normalized values match the same API request, even if presentation changes.
  assert.deepEqual(
    (
      await resolve(
        { ...values, name: '  ' + values.name + '  ', budget: '125000.5' },
        previous,
      )
    ).errors,
    {},
  );
  for (const change of [
    { name: 'Different wedding' },
    { brideName: 'Different bride' },
    { groomName: 'Different groom' },
    { city: 'Cuttack' },
    { state: 'Different state' },
    { tradition: 'BENGALI' },
    { budget: '125000.51' },
    { mainDate: '2026-10-21' },
  ]) {
    const changed = { ...values, ...change };
    assert.ok((await resolve(changed, previous)).errors.mainDate);
    assert.throws(() => weddingInput(changed, previous, () => clock));
  }
  for (const incomplete of [
    undefined,
    { body: previous.body },
    { key: previous.key },
  ])
    assert.ok((await resolve(values, incomplete)).errors.mainDate);
  assert.deepEqual(
    (await resolve({ ...values, mainDate: '2026-10-23' })).errors,
    {},
  );
});

test('retry date exemption preserves structural validation and valid JSON serialization', async () => {
  const clock = () => new Date('2026-10-23T00:00:00+05:30');
  const values = {
    ...valid,
    mainDate: '2026-10-22',
    city: 'Bhubaneswar',
    state: 'Odisha',
    budget: '',
  };
  const previous = {
    key: 'previous-attempt-key',
    body: JSON.stringify(
      weddingInput(
        values,
        undefined,
        () => new Date('2026-10-22T12:00:00+05:30'),
      ),
    ),
  };
  const resolver = zodResolver(setupSchemaForSubmission(previous, clock));
  for (const [change, field] of [
    [{ mainDate: '2026-02-30' }, 'mainDate'],
    [{ brideName: '' }, 'brideName'],
    [{ budget: '1.001' }, 'budget'],
  ]) {
    const invalid = { ...values, ...change };
    assert.ok(
      (
        await resolver(
          invalid,
          {},
          { fields: {}, shouldUseNativeValidation: false },
        )
      ).errors[field],
    );
    assert.throws(() => weddingInput(invalid, previous, clock));
  }
  assert.equal(
    JSON.stringify(weddingInput(values, previous, clock)),
    previous.body,
  );
});

test('invalid wedding inputs never open a database connection', async () => {
  let connects = 0;
  const service = createWeddingService({
    database: {
      connect() {
        connects++;
        throw new Error('Should not connect');
      },
    },
  });
  await assert.rejects(
    service.create('user', { ...valid, role: 'ADMIN' }, 'test-key-123456789'),
    { code: 'VALIDATION_ERROR' },
  );
  await assert.rejects(service.create('user', valid, ''), {
    code: 'IDEMPOTENCY_KEY_REQUIRED',
  });
  assert.equal(connects, 0);
});

test('wedding HTTP writes require a verified session, trusted Origin, JSON and signed CSRF; keys reach the wedding service', async () => {
  const settings = {
    ...config,
    jwtSecret: 'test-only-secret-'.repeat(4),
    authRateLimitMax: 100,
  };
  let calls = 0;
  const identity = {
    user: { id: '012345678901234567890123', emailVerified: true },
    wedding: null,
    membership: null,
  };
  const service = {
    async session({ accessToken }) {
      if (accessToken !== 'verified-test-access')
        throw new ApiError(401, 'SESSION_EXPIRED', 'Please sign in.');
      return identity;
    },
  };
  const weddings = {
    async create(id, input, key) {
      calls++;
      assert.equal(id, identity.user.id);
      assert.deepEqual(input, valid);
      assert.equal(key, 'test-key-123456789');
      return {
        wedding: { id: '123456789012345678901234', version: 0, ...valid },
        membership: { role: 'ADMIN' },
      };
    },
    async read() {
      throw new ApiError(
        404,
        'WEDDING_NOT_FOUND',
        'This wedding is not available.',
      );
    },
  };
  const app = createApp({ service, weddings, settings });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v1';
  try {
    const csrf = await fetch(base + '/auth/csrf');
    const token = (await csrf.json()).data.csrfToken;
    const cookie =
      csrf.headers
        .getSetCookie()
        .map((entry) => entry.split(';')[0])
        .join('; ') + '; mmm_access=verified-test-access';
    const headers = {
      Origin: settings.webOrigin,
      'Content-Type': 'application/json',
      Cookie: cookie,
      'X-CSRF-Token': token,
      'Idempotency-Key': 'test-key-123456789',
    };
    const post = (changes) =>
      fetch(base + '/weddings', {
        method: 'POST',
        headers: { ...headers, ...changes },
        body: JSON.stringify(valid),
      });
    assert.equal(
      (await post({ Origin: 'https://untrusted.example' })).status,
      403,
    );
    assert.equal((await post({ 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post({ Cookie: '' })).status, 401);
    assert.equal((await post({ 'X-CSRF-Token': '' })).status, 403);
    assert.equal(calls, 0);
    const created = await post({});
    assert.equal(created.status, 201);
    assert.equal(created.headers.get('etag'), '"0"');
    assert.equal((await created.json()).data.membership.role, 'ADMIN');
    assert.equal(created.headers.getSetCookie().length, 0);
    assert.match(created.headers.get('cache-control'), /no-store/);
    assert.equal(calls, 1);
    assert.equal(
      (
        await fetch(base + '/weddings/123456789012345678901234', {
          headers: { Cookie: cookie },
        })
      ).status,
      404,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
