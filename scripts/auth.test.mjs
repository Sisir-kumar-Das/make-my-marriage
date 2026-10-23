import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { createApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';
import { registerSchema } from '../apps/api/src/auth/validation.js';
import {
  generateToken,
  hashToken,
  createAuthService,
  createProductionAuthService,
} from '../apps/api/src/auth/service.js';
import { authModels } from '../apps/api/src/auth/models.js';
import {
  cancelVerificationAttempt,
  runVerificationAttempt,
  verificationState,
} from '../apps/web/src/features/auth/verification-state.js';
import {
  createVerificationSender,
  verificationEmail,
} from '../apps/api/src/auth/email.js';

const settings = {
  ...config,
  emailProvider: 'resend',
  mongodbUri: '',
  resendApiKey: '',
  emailFrom: '',
  authRateLimitMax: 10,
};
const valid = {
  name: 'Anya Sharma',
  email: 'anya@example.com',
  password: 'Wedding123',
};

test('replacement verification links discard another link’s error, success and pending state', () => {
  const previous = `#token=${'A'.repeat(43)}`;
  const replacement = `#token=${'B'.repeat(43)}`;
  for (const state of ['invalid', 'verified', 'pending', 'idle']) {
    const view = verificationState(replacement, {
      hash: previous,
      state,
      error: 'Previous link failed.',
    });
    assert.equal(view.token, 'B'.repeat(43));
    assert.equal(view.validToken, true);
    assert.equal(view.state, 'idle');
    assert.equal(view.error, '');
  }
  assert.equal(
    verificationState(replacement, { hash: '', state: 'verified', error: '' })
      .state,
    'idle',
  );
});

test('verification results stay scoped to the submitted fragment and successful token removal', () => {
  const hash = `#token=${'A'.repeat(43)}`;
  assert.equal(
    verificationState(hash, { hash, state: 'invalid', error: 'Expired.' })
      .error,
    'Expired.',
  );
  const verified = { hash: '', state: 'verified', error: '' };
  assert.equal(verificationState('', verified).state, 'verified');
  for (const fragment of ['#token=invalid', '#other=value', '']) {
    const view = verificationState(fragment, {
      hash,
      state: 'invalid',
      error: 'Expired.',
    });
    assert.equal(view.validToken, false);
    assert.equal(view.error, '');
    assert.equal(view.state, 'idle');
  }
});

test('A → B → A after cancellation restores an idle verification action instead of a stranded pending state', () => {
  const hashA = `#token=${'A'.repeat(43)}`;
  const hashB = `#token=${'B'.repeat(43)}`;
  const operation = { hash: hashA, controller: new AbortController() };
  let attempt = { hash: hashA, state: 'pending', error: '', operation };
  assert.equal(verificationState(hashA, attempt).state, 'pending');
  assert.equal(verificationState(hashB, attempt).state, 'idle');
  operation.controller.abort();
  attempt = cancelVerificationAttempt(attempt, operation);
  assert.equal(attempt, null);
  assert.equal(operation.controller.signal.aborted, true);
  const returned = verificationState(hashA, attempt);
  assert.equal(returned.state, 'idle');
  assert.equal(returned.error, '');
  assert.equal(returned.validToken, true);
});

test('cancellation clears only its own pending attempt and preserves newer or completed results', () => {
  const operationA = { controller: new AbortController() };
  const operationB = { controller: new AbortController() };
  const newer = {
    hash: '#token=B',
    state: 'pending',
    error: '',
    operation: operationB,
  };
  assert.equal(cancelVerificationAttempt(newer, operationA), newer);
  for (const state of ['idle', 'invalid', 'verified']) {
    const completed = { hash: '', state, error: '', operation: operationA };
    assert.equal(cancelVerificationAttempt(completed, operationA), completed);
  }
  assert.equal(cancelVerificationAttempt(null, operationA), null);
});

const applyQueuedUpdates = (attempt, updates) =>
  updates.reduce(
    (previous, update) =>
      typeof update === 'function' ? update(previous) : update,
    attempt,
  );

test('a stale response finishing before cleanup releases A’s pending state for A → B → A', async () => {
  const hashA = `#token=${'A'.repeat(43)}`;
  const hashB = `#token=${'B'.repeat(43)}`;
  for (const cleanupFirst of [false, true]) {
    for (const rejects of [false, true]) {
      const operation = { hash: hashA, controller: new AbortController() };
      const request = { current: operation };
      const initial = { hash: hashA, state: 'pending', error: '', operation };
      const updates = [];
      const response = Promise.withResolvers();
      let hash = hashA;
      let verifiedActions = 0;
      const completion = runVerificationAttempt({
        operation,
        request,
        setAttempt: (update) => updates.push(update),
        readHash: () => hash,
        send: () => response.promise,
        onVerified: () => {
          verifiedActions++;
        },
      });
      hash = hashB;
      if (cleanupFirst) {
        request.current = null;
        operation.controller.abort();
        updates.push((previous) =>
          cancelVerificationAttempt(previous, operation),
        );
      }
      if (rejects)
        response.reject(
          Object.assign(new Error('Old link failed.'), {
            code: 'INVALID_VERIFICATION_LINK',
          }),
        );
      else response.resolve();
      await completion;
      assert.equal(request.current, null);
      assert.equal(hash, hashB);
      assert.equal(verifiedActions, 0);
      const attempt = applyQueuedUpdates(initial, updates);
      assert.equal(
        verificationState(hashA, attempt).state,
        'idle',
        `cleanupFirst=${cleanupFirst}, rejects=${rejects}`,
      );
      assert.equal(verificationState(hashA, attempt).error, '');
    }
  }
});

test('stale completion preserves a newer pending request, including a fresh attempt for the same link', async () => {
  const hashA = `#token=${'A'.repeat(43)}`;
  for (const hash of [hashA, `#token=${'B'.repeat(43)}`]) {
    const operation = { hash: hashA, controller: new AbortController() };
    const request = { current: operation };
    const initial = { hash: hashA, state: 'pending', error: '', operation };
    const updates = [];
    const response = Promise.withResolvers();
    const completion = runVerificationAttempt({
      operation,
      request,
      setAttempt: (update) => updates.push(update),
      readHash: () => hash,
      send: () => response.promise,
      onVerified: () =>
        assert.fail('Old completion overwrote the current link.'),
    });
    const newer = { hash, controller: new AbortController() };
    request.current = newer;
    const newerAttempt = {
      hash,
      state: 'pending',
      error: '',
      operation: newer,
    };
    updates.push(newerAttempt);
    response.resolve();
    await completion;
    assert.equal(request.current, newer);
    assert.equal(applyQueuedUpdates(initial, updates), newerAttempt);
  }
});

test('request finalization preserves accepted verification success and retryable/invalid errors', async () => {
  for (const code of [null, 'INVALID_VERIFICATION_LINK', 'NETWORK_ERROR']) {
    let hash = `#token=${'A'.repeat(43)}`;
    const operation = { hash, controller: new AbortController() };
    const request = { current: operation };
    const initial = { hash, state: 'pending', error: '', operation };
    const updates = [];
    await runVerificationAttempt({
      operation,
      request,
      setAttempt: (update) => updates.push(update),
      readHash: () => hash,
      send: async () => {
        if (code) throw Object.assign(new Error('Request failed.'), { code });
      },
      onVerified: () => {
        hash = '';
      },
    });
    const view = verificationState(hash, applyQueuedUpdates(initial, updates));
    assert.equal(
      view.state,
      code === null
        ? 'verified'
        : code === 'INVALID_VERIFICATION_LINK'
          ? 'invalid'
          : 'idle',
    );
    assert.equal(view.error, code ? 'Request failed.' : '');
    assert.equal(request.current, null);
  }
});

async function withApi(service, run, overrides = {}) {
  const app = createApp({ service, settings: { ...settings, ...overrides } });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const request = (path, body, headers = {}) =>
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
    await run(request);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('registration normalizes email and rejects weak passwords or injected account state', () => {
  const result = registerSchema.parse({
    ...valid,
    name: '  Anya Sharma  ',
    email: ' ANYA@EXAMPLE.COM ',
  });
  assert.equal(result.name, valid.name);
  assert.equal(result.email, valid.email);
  assert.equal(
    registerSchema.safeParse({ ...valid, password: 'weakpass' }).success,
    false,
  );
  assert.equal(
    registerSchema.safeParse({
      ...valid,
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
    }).success,
    false,
  );
  assert.equal(
    registerSchema.safeParse({ ...valid, password: 'A'.repeat(129) }).success,
    false,
  );
});

test('registration requires the exact frontend origin and JSON before invoking the service', async () => {
  let calls = 0;
  await withApi(
    {
      register: async () => {
        calls++;
      },
    },
    async (request) => {
      assert.equal(
        (
          await request('/register', valid, {
            Origin: 'https://untrusted.example',
          })
        ).status,
        403,
      );
      assert.equal(
        (await request('/register', valid, { 'Content-Type': 'text/plain' }))
          .status,
        415,
      );
      assert.equal(calls, 0);
      const response = await request('/register', valid);
      assert.equal(response.status, 202);
      const payload = await response.json();
      assert.equal(payload.success, true);
      assert.equal(
        payload.data.retryAfterSeconds,
        settings.verificationCooldownSeconds,
      );
      assert.equal(
        payload.data.verificationTtlHours,
        settings.verificationTtlHours,
      );
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(calls, 1);
      assert.equal(JSON.stringify(payload).includes(valid.password), false);
    },
  );
});

test('field validation and malformed tokens do not reach database services', async () => {
  let calls = 0;
  await withApi(
    {
      register: async () => {
        calls++;
      },
      verify: async () => {
        calls++;
      },
    },
    async (request) => {
      const invalid = await request('/register', {
        ...valid,
        password: 'weak',
      });
      assert.equal(invalid.status, 400);
      const payload = await invalid.json();
      assert.equal(payload.error.code, 'VALIDATION_ERROR');
      assert.ok(payload.error.details.fields.password);
      assert.equal(payload.requestId, invalid.headers.get('x-request-id'));
      assert.equal(
        (await request('/verify-email', { token: 'not-a-token' })).status,
        400,
      );
      assert.equal(calls, 0);
    },
  );
});

test('existing-email registration and a concurrent duplicate return a sign-in conflict without sending mail', async (t) => {
  const connection = mongoose.createConnection();
  const { User } = authModels(connection);
  let exists = true;
  let transactionCalls = 0;
  let deliveryCalls = 0;
  t.mock.method(User, 'exists', async (filter) => {
    assert.equal(filter.emailNormalized, valid.email);
    return exists ? { _id: new mongoose.Types.ObjectId() } : null;
  });
  t.mock.method(connection, 'transaction', async () => {
    transactionCalls++;
    exists = true;
    throw Object.assign(new Error('duplicate key'), { code: 11000 });
  });
  const service = createAuthService({
    settings: {
      ...settings,
      resendApiKey: 'test-key',
      emailFrom: 'test@example.com',
    },
    database: {
      connect: async () => connection,
      close: () => connection.close(),
    },
    sendVerification: async () => {
      deliveryCalls++;
    },
  });
  try {
    await withApi(service, async (request) => {
      for (const concurrent of [false, true]) {
        exists = !concurrent;
        const response = await request('/register', {
          ...valid,
          email: ' ANYA@EXAMPLE.COM ',
        });
        const payload = await response.json();
        assert.equal(response.status, 409);
        assert.equal(payload.error.code, 'EMAIL_ALREADY_REGISTERED');
        assert.match(payload.error.message, /Sign in/);
        assert.equal(response.headers.get('set-cookie'), null);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(payload.error.details, undefined);
        assert.equal(JSON.stringify(payload).includes(valid.password), false);
        assert.equal(payload.data, undefined);
      }
    });
    assert.equal(transactionCalls, 1);
    assert.equal(deliveryCalls, 0);
  } finally {
    await service.close();
  }
});

test('verification exposes no identity, cookie or raw token in its response', async () => {
  await withApi({ verify: async () => {} }, async (request) => {
    const token = generateToken();
    const response = await request('/verify-email', { token });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      data: { emailVerified: true },
    });
    assert.equal(response.headers.get('set-cookie'), null);
  });
});

test('expired and replayed token errors use the normal safe error contract', async () => {
  await withApi(
    {
      verify: async () => {
        throw new ApiError(
          400,
          'INVALID_VERIFICATION_LINK',
          'Request another verification email.',
        );
      },
    },
    async (request) => {
      const response = await request('/verify-email', {
        token: generateToken(),
      });
      const payload = await response.json();
      assert.equal(response.status, 400);
      assert.equal(payload.error.code, 'INVALID_VERIFICATION_LINK');
      assert.equal(payload.requestId, response.headers.get('x-request-id'));
      assert.equal(payload.error.stack, undefined);
    },
  );
});

test('sensitive endpoints enforce a server-side limit and advertise retry time', async () => {
  let calls = 0;
  await withApi(
    {
      register: async () => {
        calls++;
      },
    },
    async (request) => {
      await request('/register', valid);
      await request('/register', valid);
      const response = await request('/register', valid);
      const payload = await response.json();
      assert.equal(response.status, 429);
      assert.equal(payload.error.code, 'RATE_LIMITED');
      assert.ok(Number(response.headers.get('Retry-After')) > 0);
      assert.match(
        response.headers.get('access-control-expose-headers'),
        /Retry-After/,
      );
      assert.equal(calls, 2);
    },
    { authRateLimitMax: 2 },
  );
});

test('missing email configuration fails clearly without exposing private configuration', async () => {
  const service = createProductionAuthService(settings);
  await withApi(service, async (request) => {
    const response = await request('/register', valid);
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.error.code, 'AUTH_UNAVAILABLE');
    assert.equal(JSON.stringify(payload).includes('MONGODB'), false);
    assert.equal(JSON.stringify(payload).includes('RESEND'), false);
  });
  await service.close();
});

test('resend delivery failures keep the same public acknowledgement as ineligible accounts', async (t) => {
  // Disconnected models keep this regression independent of Atlas and Resend.
  const connection = mongoose.createConnection();
  const { User, AuthToken } = authModels(connection);
  let user = null;
  let tokenHash;
  let attempts = 0;
  const released = [];
  const logs = [];
  t.mock.method(User, 'findOne', () => ({ lean: async () => user }));
  t.mock.method(AuthToken, 'findOneAndUpdate', async (_filter, update) => {
    tokenHash = update.$set.tokenHash;
    return update.$set;
  });
  t.mock.method(AuthToken, 'deleteOne', async (filter) => {
    released.push(filter);
  });
  t.mock.method(console, 'error', (...args) => logs.push(args));
  const service = createAuthService({
    settings: {
      ...settings,
      resendApiKey: 'test-key',
      emailFrom: 'test@example.com',
    },
    database: {
      connect: async () => connection,
      close: () => connection.close(),
    },
    sendVerification: async () => {
      attempts++;
      throw new ApiError(503, 'EMAIL_UNAVAILABLE', 'private-provider-error');
    },
  });
  try {
    await withApi(service, async (request) => {
      const ineligible = await request('/resend-verification', {
        email: valid.email,
      });
      const acknowledgement = await ineligible.json();
      user = { _id: new mongoose.Types.ObjectId(), email: valid.email };
      const failed = await request('/resend-verification', {
        email: valid.email,
      });
      assert.equal(ineligible.status, 202);
      assert.equal(failed.status, 202);
      assert.deepEqual(await failed.json(), acknowledgement);
      assert.equal(failed.headers.get('cache-control'), 'no-store');
      assert.equal(attempts, 1);
      assert.deepEqual(released, [{ tokenHash }]);
      assert.deepEqual(logs, [['Verification email delivery failed.']]);
    });
  } finally {
    await service.close();
  }
});

test('verification emails use an opaque fragment token and provider idempotency', async () => {
  const token = generateToken();
  const tokenHash = hashToken(token);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(generateToken(), token);
  const emailSettings = {
    ...settings,
    resendApiKey: 'test-key',
    emailFrom: 'Make My Marriage <verify@example.com>',
  };
  const mail = verificationEmail({
    to: valid.email,
    token,
    from: emailSettings.emailFrom,
    webOrigin: settings.webOrigin,
    ttlHours: 24,
  });
  const link = new URL(mail.text.match(/http[^\s]+/)[0]);
  assert.equal(link.pathname, '/verify-email');
  assert.equal(link.search, '');
  assert.ok(new URLSearchParams(link.hash.slice(1)).get('token') === token);
  let calls = 0;
  const sender = createVerificationSender(emailSettings, {
    request: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(
        options.headers['Idempotency-Key'],
        `email-verify-${tokenHash}`,
      );
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      assert.deepEqual(JSON.parse(options.body).to, [valid.email]);
      return Response.json({ id: 'test-message-id' });
    },
  });
  await sender({ email: valid.email, token, tokenHash });
  assert.equal(calls, 1);
});

test('provider error content is neither logged nor sent back to the caller', async (t) => {
  let logs = 0;
  t.mock.method(console, 'error', () => {
    logs++;
  });
  const sender = createVerificationSender(
    { ...settings, resendApiKey: 'test-key', emailFrom: 'test@example.com' },
    {
      request: async () =>
        Response.json(
          { message: 'private-provider-response' },
          { status: 422 },
        ),
    },
  );
  await assert.rejects(
    sender({ email: valid.email, token: generateToken(), tokenHash: 'hash' }),
    (error) =>
      error.code === 'EMAIL_UNAVAILABLE' &&
      !error.message.includes('private-provider-response'),
  );
  assert.equal(logs, 0);
});
