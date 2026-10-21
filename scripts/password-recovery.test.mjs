import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config.js';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../apps/api/src/auth/validation.js';
import { createPasswordRecovery } from '../apps/api/src/auth/password-recovery.js';
import {
  createResetSender,
  createPasswordChangedSender,
} from '../apps/api/src/auth/email.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';

const settings = {
  ...config,
  mongodbUri: 'test-only',
  resendApiKey: 'test-only',
  emailFrom: 'test@example.com',
  authRateLimitMax: 10,
};
const token = 'a'.repeat(43);
async function withApi(service, run, overrides = {}) {
  const server = createApp({
    service,
    settings: { ...settings, ...overrides },
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const post = (path, body, headers = {}) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/v1/auth${path}`, {
      method: 'POST',
      headers: {
        Origin: settings.webOrigin,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  try {
    await run(post);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('recovery validation normalizes email and uses the registration password policy without accepting injected state', () => {
  assert.equal(
    forgotPasswordSchema.parse({ email: ' COUPLE@EXAMPLE.COM ' }).email,
    'couple@example.com',
  );
  for (const password of [
    'short',
    'lowercase123',
    'UPPERCASE123',
    'NoNumbersHere',
    'x'.repeat(129),
  ])
    assert.equal(
      resetPasswordSchema.safeParse({ token, password }).success,
      false,
    );
  assert.ok(
    resetPasswordSchema.safeParse({ token, password: 'NewWedding123' }).success,
  );
  assert.equal(
    resetPasswordSchema.safeParse({
      token,
      password: 'NewWedding123',
      userId: 'injected',
    }).success,
    false,
  );
  assert.equal(
    resetPasswordSchema.safeParse({ token: 'bad', password: 'NewWedding123' })
      .success,
    false,
  );
});

test('forgot/reset require exact Origin, JSON and valid public input before service calls', async () => {
  let calls = 0;
  await withApi(
    { forgotPassword: async () => calls++, resetPassword: async () => calls++ },
    async (post) => {
      for (const [path, body] of [
        ['/forgot-password', { email: 'couple@example.com' }],
        ['/reset-password', { token, password: 'NewWedding123' }],
      ]) {
        assert.equal(
          (await post(path, body, { Origin: 'https://untrusted.example' }))
            .status,
          403,
        );
        assert.equal(
          (await post(path, body, { 'Content-Type': 'text/plain' })).status,
          415,
        );
      }
      assert.equal(
        (await post('/reset-password', { token, password: 'weak' })).status,
        400,
      );
      assert.equal(calls, 0);
      const accepted = await post('/forgot-password', {
        email: 'couple@example.com',
      });
      assert.equal(accepted.status, 202);
      assert.match(accepted.headers.get('cache-control'), /no-store/);
      assert.equal(accepted.headers.getSetCookie().length, 0);
      assert.equal(calls, 1);
    },
  );
});

test('public reset errors are safe; success clears auth cookies without creating a session', async () => {
  let fail = true;
  await withApi(
    {
      resetPassword: async () => {
        if (fail)
          throw new ApiError(400, 'INVALID_RESET_LINK', 'Request a new link.');
      },
    },
    async (post) => {
      const invalid = await post('/reset-password', {
        token,
        password: 'NewWedding123',
      });
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error.code, 'INVALID_RESET_LINK');
      fail = false;
      const success = await post('/reset-password', {
        token,
        password: 'NewWedding123',
      });
      assert.deepEqual((await success.json()).data, { passwordReset: true });
      assert.equal(success.headers.getSetCookie().length, 4);
      assert.ok(
        success.headers
          .getSetCookie()
          .every((value) => /Expires=Thu, 01 Jan 1970/i.test(value)),
      );
    },
  );
});

test('reset requests are rate limited independently of account existence', async () => {
  await withApi(
    { forgotPassword: async () => {} },
    async (post) => {
      await post('/forgot-password', { email: 'unknown@example.com' });
      const limited = await post('/forgot-password', {
        email: 'unknown@example.com',
      });
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers.get('retry-after')) > 0);
    },
    { authRateLimitMax: 1 },
  );
});

test('forgot acknowledgement does not await account lookup or sending, while shutdown drains the work', async () => {
  const deferred = Promise.withResolvers();
  const recovery = createPasswordRecovery({
    settings,
    now: () => new Date(),
    sendReset: async () => {},
    database: { connect: () => deferred.promise },
  });
  await recovery.forgot({ email: 'couple@example.com' });
  let drained = false;
  const closing = recovery.drain().then(() => {
    drained = true;
  });
  await Promise.resolve();
  assert.equal(drained, false);
  deferred.resolve({
    models: {
      User: { findOne: () => ({ lean: async () => null }) },
      AuthToken: {},
      Session: {},
    },
  });
  await closing;
  assert.equal(drained, true);
});

test('reset emails use trusted-origin fragment links, separate idempotency and safe provider failures', async () => {
  const messages = [];
  const request = async (_url, options) => {
    messages.push(options);
    return Response.json({ id: 'test-id' });
  };
  await createResetSender(
    settings,
    request,
  )({ email: 'couple@example.com', token, tokenHash: 'hash-only' });
  const email = JSON.parse(messages[0].body);
  const url = new URL(email.text.match(/https?:\/\/[^\s]+/)[0]);
  assert.equal(url.origin, settings.webOrigin);
  assert.equal(url.pathname, '/reset-password');
  assert.equal(url.search, '');
  assert.equal(new URLSearchParams(url.hash.slice(1)).get('token'), token);
  assert.match(email.text, /30 minutes/);
  assert.equal(
    messages[0].headers['Idempotency-Key'],
    'password-reset-hash-only',
  );
  await createPasswordChangedSender(
    settings,
    request,
  )({ email: 'couple@example.com', tokenHash: 'hash-only' });
  assert.equal(
    messages[1].headers['Idempotency-Key'],
    'password-changed-hash-only',
  );
  assert.ok(!messages[1].body.includes(token));
  const failure = createResetSender(settings, async () =>
    Response.json({ error: 'private-provider-detail' }, { status: 500 }),
  );
  await assert.rejects(
    failure({ email: 'couple@example.com', token, tokenHash: 'hash-only' }),
    (error) =>
      error.code === 'EMAIL_UNAVAILABLE' &&
      !error.message.includes('private-provider-detail'),
  );
});
