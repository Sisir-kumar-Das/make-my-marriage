import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recoverySummary,
  changeLifecycle,
  readLifecycleResult,
  RECOVERY_MS,
} from '../apps/api/src/weddings/lifecycle.js';
import { WEDDING_CHILDREN } from '../apps/api/src/weddings/purge.js';
import { createApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';
import { lifecycleView } from '../apps/web/src/features/weddings/lifecycle-data.js';

test('recovery expires at the exact seven-day instant; permissions and DTO stay minimal', () => {
  const deletedAt = new Date('2026-11-15T18:30:00Z');
  const wedding = {
    _id: 'w',
    __v: 3,
    name: 'Wedding',
    deletedAt,
    purgeAfter: new Date(+deletedAt + RECOVERY_MS),
    estimatedBudget: { amountMinor: 123 },
    brideName: 'Private',
  };
  for (const role of ['ADMIN', 'FAMILY_MEMBER', 'VIEWER']) {
    const member = { role };
    const before = recoverySummary(
      wedding,
      member,
      new Date(+wedding.purgeAfter - 1),
    );
    assert.equal(before.state, 'RECOVERABLE');
    assert.equal(
      before.serverNow,
      new Date(+wedding.purgeAfter - 1).toISOString(),
    );
    assert.equal(before.canRestore, role === 'ADMIN');
    assert.equal(before.canDelete, false);
    assert.equal('estimatedBudget' in before, false);
    assert.equal('brideName' in before, false);
    const expired = recoverySummary(wedding, member, wedding.purgeAfter);
    assert.equal(expired.state, 'EXPIRED');
    assert.equal(expired.canRestore, false);
    assert.notEqual(expired.state, 'PURGED');
  }
  assert.equal(
    recoverySummary(
      { ...wedding, purgeState: 'PURGING' },
      { role: 'ADMIN' },
      deletedAt,
    ).canRestore,
    false,
  );
});

test('recovery presentation uses the server state and time sample, never the device date', () => {
  const originalNow = Date.now;
  const lifecycle = {
    state: 'RECOVERABLE',
    canRestore: true,
    serverNow: '2026-11-16T00:00:00Z',
    purgeAfter: '2026-11-23T00:00:00Z',
  };
  try {
    for (const skew of [-8, 8]) {
      Date.now = () => Date.parse(lifecycle.serverNow) + skew * 86400000;
      assert.deepEqual(lifecycleView(lifecycle, 1000), {
        active: false,
        canRestore: true,
        expired: false,
        remaining: RECOVERY_MS - 1000,
      });
      // An elapsed display sample never removes the server-authorized action.
      assert.deepEqual(lifecycleView(lifecycle, RECOVERY_MS + 1), {
        active: false,
        canRestore: true,
        expired: false,
        remaining: 0,
      });
      for (const state of ['EXPIRED', 'PURGING']) {
        const result = lifecycleView({ ...lifecycle, state });
        assert.equal(result.canRestore, false);
        assert.equal(result.expired, true);
      }
    }
  } finally {
    Date.now = originalNow;
  }
  assert.equal(
    lifecycleView({ ...lifecycle, canRestore: false }).canRestore,
    false,
  );
  assert.equal(lifecycleView({ state: 'ACTIVE' }).active, true);
  assert.equal(lifecycleView(null).remaining, null);
});

test('lifecycle confirmation, strict bodies, version and key reject before database access', async () => {
  const dependencies = {
    database: {
      connect() {
        throw new Error('Unexpected database access');
      },
    },
    now: () => new Date(),
  };
  const id = 'a'.repeat(24),
    key = 'b'.repeat(32);
  for (const [action, body, version, requestKey, code] of [
    ['DELETE', {}, '"0"', key, 'INVALID_CONFIRMATION'],
    ['DELETE', { confirmation: 'delete' }, '"0"', key, 'INVALID_CONFIRMATION'],
    ['RESTORE', { confirmation: 'DELETE' }, '"0"', key, 'INVALID_CONFIRMATION'],
    ['DELETE', { confirmation: 'DELETE' }, '0', key, 'VERSION_REQUIRED'],
    ['RESTORE', {}, '"0"', '', 'IDEMPOTENCY_KEY_REQUIRED'],
  ])
    await Promise.all([
      assert.rejects(
        changeLifecycle(
          dependencies,
          action,
          id,
          id,
          body,
          version,
          requestKey,
        ),
        { code },
      ),
      assert.rejects(
        readLifecycleResult(
          dependencies,
          id,
          id,
          { action, body },
          version,
          requestKey,
        ),
        { code },
      ),
    ]);
});

test('bounded purge collection allowlist excludes all global account/security/media data', () => {
  for (const name of ['users', 'sessions', 'authTokens', 'mediaAssets'])
    assert.equal(WEDDING_CHILDREN.includes(name), false);
  for (const name of [
    'tasks',
    'taskSeries',
    'memberInvitations',
    'activities',
    'weddingLifecycleRequests',
  ])
    assert.equal(WEDDING_CHILDREN.includes(name), true);
  assert.equal(new Set(WEDDING_CHILDREN).size, WEDDING_CHILDREN.length);
});

test('lifecycle write/result routes require session, Origin, JSON, CSRF and independent bounded lookup accounting', async () => {
  const settings = {
    ...config,
    jwtSecret: 'lifecycle-fixture-only-'.repeat(4),
  };
  const id = 'a'.repeat(24),
    actor = 'b'.repeat(24),
    calls = [];
  const service = {
    async session({ accessToken }) {
      if (accessToken !== 'fixture')
        throw new ApiError(401, 'SESSION_EXPIRED', 'Sign in.');
      return { user: { id: actor } };
    },
  };
  const weddings = Object.fromEntries(
    ['delete', 'restore', 'lifecycleResult'].map((action) => [
      action,
      async (...args) => {
        calls.push({ action, args });
        return { lifecycle: { id, state: 'RECOVERABLE' } };
      },
    ]),
  );
  const app = createApp({ settings, service, weddings });
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
        .join('; ') + '; mmm_access=fixture';
    const headers = {
      Origin: settings.webOrigin,
      'Content-Type': 'application/json',
      Cookie: cookie,
      'X-CSRF-Token': token,
      'If-Match': '"7"',
      'Idempotency-Key': 'lifecycle-request-key',
    };
    for (const [action, method, suffix, body] of [
      ['delete', 'DELETE', '', { confirmation: 'DELETE' }],
      ['restore', 'POST', '/restore', {}],
      [
        'lifecycleResult',
        'POST',
        '/lifecycle/result',
        { action: 'DELETE', body: { confirmation: 'DELETE' } },
      ],
    ]) {
      const request = (change = {}) =>
        fetch(base + '/weddings/' + id + suffix, {
          method,
          headers: { ...headers, ...change },
          body: JSON.stringify(body),
        });
      assert.equal(
        (await request({ Origin: 'https://other.example' })).status,
        403,
      );
      assert.equal(
        (await request({ 'Content-Type': 'text/plain' })).status,
        415,
      );
      assert.equal((await request({ Cookie: '' })).status, 401);
      assert.equal((await request({ 'X-CSRF-Token': '' })).status, 403);
      assert.equal((await request()).status, 200);
      assert.deepEqual(calls.at(-1), {
        action,
        args: [actor, id, body, '"7"', 'lifecycle-request-key'],
      });
    }
    assert.equal(calls.length, 3);
    const check = () =>
      fetch(base + '/weddings/' + id + '/lifecycle/result', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'DELETE',
          body: { confirmation: 'DELETE' },
        }),
      });
    for (let i = 1; i < 60; i++) {
      const response = await check();
      assert.equal(response.status, 200);
      await response.json();
    }
    const limited = await check();
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
    assert.equal(
      calls.filter((call) => call.action === 'lifecycleResult').length,
      60,
    );
    const deletion = await fetch(base + '/weddings/' + id, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ confirmation: 'DELETE' }),
    });
    assert.equal(
      deletion.status,
      200,
      'result queries must not consume Delete allowance',
    );
    await deletion.json();
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
