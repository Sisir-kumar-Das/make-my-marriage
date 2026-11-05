import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';

// HTTP boundary for the dashboard summary and the sidebar member count.
test('dashboard summary and member count routes require a session and trusted origin', async () => {
  const settings = {
    ...config,
    webOrigin: 'http://localhost:3000',
    jwtSecret: 'native-dashboard-test-secret-'.repeat(3),
    cookieSecure: false,
    cookieSameSite: 'lax',
  };
  const weddingId = 'a'.repeat(24);
  const calls = [];
  const app = createApp({
    settings,
    service: {
      session: async ({ accessToken }) => {
        if (accessToken !== 'fixture-access')
          throw new ApiError(401, 'SESSION_EXPIRED', 'Please sign in.');
        return { user: { id: 'actor' } };
      },
    },
    tasks: {
      summary: async (...args) => {
        calls.push(['summary', ...args]);
        return { counts: { total: 0 }, progress: 0, schedule: 'NOT_STARTED' };
      },
    },
    members: {
      count: async (...args) => {
        calls.push(['count', ...args]);
        return { counts: { ALL: 3, ADMIN: 1, FAMILY_MEMBER: 1, VIEWER: 1 } };
      },
      list: async () => {
        throw new Error('The badge must not load the full directory.');
      },
    },
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const request = (path, headers = {}) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, {
      headers: {
        Origin: settings.webOrigin,
        Cookie: 'mmm_access=fixture-access',
        ...headers,
      },
    });
  try {
    for (const path of [
      `/weddings/${weddingId}/tasks/summary`,
      `/weddings/${weddingId}/members/count`,
    ]) {
      assert.equal((await request(path, { Cookie: '' })).status, 401);
      assert.equal(
        (await request(path, { Origin: 'https://other.example' })).status,
        403,
      );
    }
    const summary = await request(`/weddings/${weddingId}/tasks/summary`);
    assert.equal(summary.status, 200);
    assert.equal(summary.headers.get('cache-control'), 'no-store');
    assert.equal((await summary.json()).data.schedule, 'NOT_STARTED');
    const count = await request(`/weddings/${weddingId}/members/count`);
    assert.equal(count.status, 200);
    assert.deepEqual((await count.json()).data, {
      counts: { ALL: 3, ADMIN: 1, FAMILY_MEMBER: 1, VIEWER: 1 },
    });
    assert.deepEqual(calls, [
      ['summary', 'actor', weddingId],
      ['count', 'actor', weddingId],
    ]);
  } finally {
    server.close();
  }
});
