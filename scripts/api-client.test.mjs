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

async function browserClient(t, suffix) {
  const browser = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: browser,
  });
  t.after(() => {
    delete globalThis.window;
  });
  return {
    browser,
    ...(await import(
      `../apps/web/src/lib/api-client.js?browser-test=${suffix}`
    )),
  };
}

test('browser mutations recover a stale CSRF token once and keep the rotated login token only in memory', async (t) => {
  const { apiRequest: call } = await browserClient(t, 'csrf');
  let bootstraps = 0;
  let logins = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.startsWith('/api/v1/'));
    if (url.endsWith('/csrf')) {
      bootstraps++;
      return Response.json({
        success: true,
        data: { csrfToken: `csrf-${bootstraps}` },
      });
    }
    if (url.endsWith('/login')) {
      logins++;
      assert.equal(options.headers['X-CSRF-Token'], `csrf-${logins}`);
      if (logins === 1)
        return Response.json(
          {
            success: false,
            error: { code: 'CSRF_INVALID', message: 'Retry.' },
          },
          { status: 403 },
        );
      return Response.json({
        success: true,
        data: { csrfToken: 'csrf-after-login' },
      });
    }
    assert.ok(url.endsWith('/logout'));
    assert.equal(options.headers['X-CSRF-Token'], 'csrf-after-login');
    return Response.json({ success: true, data: { loggedOut: true } });
  });
  await call('/auth/login', { method: 'POST', body: '{}' });
  await call('/auth/logout', { method: 'POST', body: '{}' });
  assert.equal(bootstraps, 2);
  assert.equal(logins, 2);
});

test('concurrent browser requests renew an expired session once and retry without a redirect', async (t) => {
  const { apiRequest: call, browser } = await browserClient(t, 'refresh');
  let renewed = false;
  let refreshes = 0;
  let lost = 0;
  browser.addEventListener('mmm:session-expired', () => lost++);
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/csrf'))
      return Response.json({ success: true, data: { csrfToken: 'test-csrf' } });
    if (url.endsWith('/refresh')) {
      refreshes++;
      renewed = true;
      return Response.json({ success: true, data: {} });
    }
    if (!renewed)
      return Response.json(
        {
          success: false,
          error: { code: 'SESSION_EXPIRED', message: 'Sign in.' },
        },
        { status: 401 },
      );
    return Response.json({ success: true, data: { restored: true } });
  });
  const results = await Promise.all([
    call('/auth/session'),
    call('/auth/session'),
  ]);
  assert.equal(refreshes, 1);
  assert.equal(lost, 0);
  assert.ok(results.every((result) => result.data.restored));
});

test('an API outage during session renewal does not announce a logout', async (t) => {
  const { apiRequest: call, browser } = await browserClient(t, 'outage');
  let lost = 0;
  browser.addEventListener('mmm:session-expired', () => lost++);
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/csrf'))
      return Response.json({ success: true, data: { csrfToken: 'test-csrf' } });
    if (url.endsWith('/refresh')) throw new TypeError('Network unavailable');
    return Response.json(
      {
        success: false,
        error: { code: 'SESSION_EXPIRED', message: 'Sign in.' },
      },
      { status: 401 },
    );
  });
  await assert.rejects(call('/auth/session'), { code: 'NETWORK_ERROR' });
  assert.equal(lost, 0);
});
