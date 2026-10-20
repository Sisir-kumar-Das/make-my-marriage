import assert from 'node:assert/strict';
import test from 'node:test';
import { apiRequest } from '../apps/web/src/lib/api-client.js';

function waitForAbort(signal) {
  return new Promise((_resolve, reject) => {
    const rejectAbort = () => reject(signal.reason);
    if (signal.aborted) rejectAbort();
    else signal.addEventListener('abort', rejectAbort, { once: true });
  });
}

function stallResponseBody(t) {
  const { promise: reading, resolve: startedReading } = Promise.withResolvers();
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => ({
    ok: true,
    headers: new Headers({ 'x-request-id': 'header-id' }),
    json() {
      startedReading();
      return waitForAbort(signal);
    },
  }));
  return reading;
}

test('successful responses retain the request ID', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      { success: true, data: { status: 'ok' } },
      { headers: { 'x-request-id': 'header-id' } },
    ),
  );
  assert.equal((await apiRequest('/health')).requestId, 'header-id');
});

test('validation details and rate-limit retry timing reach the form', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Please wait.',
          details: { fields: { email: 'Check email.' } },
        },
      },
      { status: 429, headers: { 'Retry-After': '45' } },
    ),
  );
  await assert.rejects(apiRequest('/auth/register'), {
    code: 'RATE_LIMITED',
    retryAfterSeconds: 45,
    details: { fields: { email: 'Check email.' } },
  });
});

test('longer auth deadlines are bounded and are not forwarded as fetch options', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.timeoutMs, undefined);
    return Response.json({ success: true, data: {} });
  });
  await apiRequest('/auth/register', { timeoutMs: 20000 });
});

test('malformed JSON remains INVALID_RESPONSE with the request ID', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('{', { headers: { 'x-request-id': 'header-id' } }),
  );
  await assert.rejects(apiRequest('/health'), {
    code: 'INVALID_RESPONSE',
    requestId: 'header-id',
  });
});

test('API errors retain their code and payload request ID', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Endpoint not found.' },
        requestId: 'payload-id',
      },
      { status: 404, headers: { 'x-request-id': 'header-id' } },
    ),
  );
  await assert.rejects(apiRequest('/missing'), {
    code: 'NOT_FOUND',
    requestId: 'payload-id',
  });
});

test('a timeout before response headers returns TIMEOUT', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', (_url, { signal }) =>
    waitForAbort(signal),
  );
  const pending = apiRequest('/health');
  t.mock.timers.tick(5000);
  await assert.rejects(pending, { code: 'TIMEOUT', requestId: undefined });
});

for (const scenario of ['timeout', 'caller first', 'timeout first']) {
  test(`body reading: ${scenario} preserves cancellation type and request ID`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const reading = stallResponseBody(t);
    const caller = new AbortController();
    const pending = apiRequest('/health', { signal: caller.signal });
    await reading;

    if (scenario === 'caller first') caller.abort();
    t.mock.timers.tick(5000);
    if (scenario === 'timeout first') caller.abort();

    await assert.rejects(pending, {
      name: scenario === 'caller first' ? 'AbortError' : 'Error',
      code: scenario === 'caller first' ? 'ABORTED' : 'TIMEOUT',
      requestId: 'header-id',
    });
  });
}

test('an already cancelled request returns ABORTED', async (t) => {
  t.mock.method(globalThis, 'fetch', (_url, { signal }) =>
    waitForAbort(signal),
  );
  const caller = new AbortController();
  caller.abort();
  await assert.rejects(apiRequest('/health', { signal: caller.signal }), {
    name: 'AbortError',
    code: 'ABORTED',
  });
});

test('other fetch aborts remain cancellation rather than network errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new DOMException('Aborted', 'AbortError');
  });
  await assert.rejects(apiRequest('/health'), {
    name: 'AbortError',
    code: 'ABORTED',
  });
});
