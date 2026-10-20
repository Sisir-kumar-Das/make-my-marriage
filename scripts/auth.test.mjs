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
  createVerificationSender,
  verificationEmail,
} from '../apps/api/src/auth/email.js';

const settings = {
  ...config,
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
  const sender = createVerificationSender(
    emailSettings,
    async (url, options) => {
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
  );
  await sender({ email: valid.email, token, tokenHash });
  assert.equal(calls, 1);
});

test('provider error content is neither logged nor sent back to the caller', async (t) => {
  let logs = 0;
  t.mock.method(console, 'error', () => {
    logs++;
  });
  const sender = createVerificationSender(settings, async () =>
    Response.json({ message: 'private-provider-response' }, { status: 422 }),
  );
  await assert.rejects(
    sender({ email: valid.email, token: generateToken(), tokenHash: 'hash' }),
    (error) =>
      error.code === 'EMAIL_UNAVAILABLE' &&
      !error.message.includes('private-provider-response'),
  );
  assert.equal(logs, 0);
});
