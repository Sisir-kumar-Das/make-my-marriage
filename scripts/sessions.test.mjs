import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';

const settings = {
  ...config,
  jwtSecret: 'test-only-session-secret-'.repeat(3),
  authRateLimitMax: 10,
  cookieSecure: false,
  cookieSameSite: 'lax',
};
const data = {
  user: {
    id: 'test-user',
    email: 'couple@example.com',
    displayName: 'Test Couple',
    emailVerified: true,
  },
  session: { expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() },
  wedding: null,
};
const issued = () => ({
  data,
  accessToken: 'test-access',
  refreshToken: 'test-refresh',
  accessExpiresAt: new Date(Date.now() + 900000),
  expiresAt: new Date(data.session.expiresAt),
});
async function withApi(run, overrides = {}, serviceOverrides = {}) {
  const service = {
    login: async () => issued(),
    refresh: async () => issued(),
    logout: async () => {},
    session: async ({ accessToken }) => {
      if (accessToken !== 'test-access')
        throw new ApiError(401, 'SESSION_EXPIRED', 'Sign in.');
      return data;
    },
    ...serviceOverrides,
  };
  const app = createApp({ service, settings: { ...settings, ...overrides } });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const jar = new Map();
  const request = async (
    path,
    { method = 'GET', body, headers = {}, useCookies = true } = {},
  ) => {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/v1/auth${path}`,
      {
        method,
        headers: {
          Origin: settings.webOrigin,
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          ...(useCookies
            ? {
                Cookie: [...jar.values()]
                  .filter((cookie) =>
                    `/api/v1/auth${path}`.startsWith(cookie.path),
                  )
                  .map((cookie) => cookie.pair)
                  .join('; '),
              }
            : {}),
          ...headers,
        },
        ...(method === 'POST' ? { body: JSON.stringify(body || {}) } : {}),
        signal: AbortSignal.timeout(5000),
      },
    );
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(';')[0];
      const name = pair.split('=')[0];
      if (/Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(value)) jar.delete(name);
      else
        jar.set(name, {
          pair,
          path: value.match(/; Path=([^;]+)/i)?.[1] || '/',
        });
    }
    return response;
  };
  const csrf = async () =>
    (await (await request('/csrf')).json()).data.csrfToken;
  try {
    await run({ request, csrf, jar });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('login requires exact Origin, JSON and a signed CSRF header/cookie pair', async () => {
  let calls = 0;
  await withApi(
    async ({ request, csrf }) => {
      const token = await csrf();
      const body = { email: 'couple@example.com', password: 'Wedding123' };
      assert.equal(
        (await request('/login', { method: 'POST', body })).status,
        403,
      );
      assert.equal(
        (
          await request('/login', {
            method: 'POST',
            body,
            headers: { 'X-CSRF-Token': token },
            useCookies: false,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request('/login', {
            method: 'POST',
            body,
            headers: {
              'X-CSRF-Token': token,
              Origin: 'https://untrusted.example',
            },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request('/login', {
            method: 'POST',
            body,
            headers: { 'X-CSRF-Token': token, 'Content-Type': 'text/plain' },
          })
        ).status,
        415,
      );
      assert.equal(calls, 0);
      assert.equal(
        (
          await request('/login', {
            method: 'POST',
            body,
            headers: { 'X-CSRF-Token': token },
          })
        ).status,
        200,
      );
      assert.equal(calls, 1);
    },
    {},
    {
      login: async () => {
        calls++;
        return issued();
      },
    },
  );
});

test('login issues persistent HttpOnly cookies, rotates CSRF context and never returns auth tokens', async () => {
  await withApi(async ({ request, csrf, jar }) => {
    const oldToken = await csrf();
    const response = await request('/login', {
      method: 'POST',
      body: { email: 'couple@example.com', password: 'Wedding123' },
      headers: { 'X-CSRF-Token': oldToken },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.ok(!JSON.stringify(payload).includes('test-access'));
    assert.ok(!JSON.stringify(payload).includes('test-refresh'));
    assert.ok(payload.data.csrfToken !== oldToken);
    for (const cookie of response.headers.getSetCookie())
      assert.match(cookie, /HttpOnly/);
    assert.equal(jar.get('mmm_access').path, '/');
    assert.equal(jar.get('mmm_refresh').path, '/api/v1/auth');
    const refreshCookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith('mmm_refresh='));
    assert.ok(
      Date.parse(refreshCookie.match(/Expires=([^;]+)/)[1]) - Date.now() >
        29 * 86400000,
    );
    assert.equal(
      (
        await request('/logout', {
          method: 'POST',
          headers: { 'X-CSRF-Token': oldToken },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request('/logout', {
          method: 'POST',
          headers: { 'X-CSRF-Token': payload.data.csrfToken },
        })
      ).status,
      200,
    );
    assert.equal(jar.size, 0);
  });
});

test('production cookie attributes use secure host-scoped names and narrowly scoped refresh', async () => {
  await withApi(
    async ({ request, csrf }) => {
      const response = await request('/login', {
        method: 'POST',
        body: { email: 'couple@example.com', password: 'Wedding123' },
        headers: { 'X-CSRF-Token': await csrf() },
      });
      const cookies = response.headers.getSetCookie();
      assert.ok(
        cookies.some((cookie) => cookie.startsWith('__Host-mmm_access=')),
      );
      assert.ok(
        cookies.some(
          (cookie) =>
            cookie.startsWith('__Secure-mmm_refresh=') &&
            cookie.includes('Path=/api/v1/auth'),
        ),
      );
      for (const cookie of cookies) {
        assert.match(cookie, /; Secure/);
        assert.match(cookie, /SameSite=None/);
        assert.doesNotMatch(cookie, /; Domain=/);
      }
    },
    { cookieSecure: true, cookieSameSite: 'none' },
  );
});

test('session reads require authentication and normal page checks do not consume the login limit', async () => {
  await withApi(
    async ({ request, csrf }) => {
      assert.equal((await request('/session')).status, 401);
      const response = await request('/login', {
        method: 'POST',
        body: { email: 'couple@example.com', password: 'Wedding123' },
        headers: { 'X-CSRF-Token': await csrf() },
      });
      await response.json();
      for (let index = 0; index < 12; index++) {
        const session = await request('/session', { headers: { Origin: '' } });
        assert.equal(session.status, 200);
        assert.deepEqual((await session.json()).data, data);
        assert.equal(session.headers.get('cache-control'), 'no-store');
      }
    },
    { authRateLimitMax: 2 },
  );
});

test('refresh is CSRF-protected and expired sessions clear credentials', async () => {
  await withApi(
    async ({ request, csrf, jar }) => {
      assert.equal((await request('/refresh', { method: 'POST' })).status, 403);
      const token = await csrf();
      const response = await request('/refresh', {
        method: 'POST',
        headers: { 'X-CSRF-Token': token },
      });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, 'SESSION_EXPIRED');
      assert.equal(jar.size, 0);
    },
    {},
    {
      refresh: async () => {
        throw new ApiError(401, 'SESSION_EXPIRED', 'Sign in.');
      },
    },
  );
});
