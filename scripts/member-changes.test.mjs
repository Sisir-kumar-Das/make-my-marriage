import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import {
  memberChangeInput,
  memberRelationship,
  memberVersion,
} from '../apps/api/src/members/validation.js';
import {
  signMemberPreview,
  checkMemberPreview,
} from '../apps/api/src/members/management-service.js';
import { createApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';

const instant = new Date('2026-10-29T06:00:00Z');
const settings = {
  ...config,
  webOrigin: 'http://localhost:3000',
  jwtSecret: randomBytes(48).toString('base64url'),
};
const body = {
  role: 'FAMILY_MEMBER',
  relationshipChoice: 'Friend',
  preview: `${instant.getTime()}.${'a'.repeat(64)}`,
};
test('member edits accept only approved roles, explicit relationships and bounded handover values', () => {
  assert.equal(memberChangeInput.parse(body).handoverToUserId, null);
  for (const change of [
    { role: 'MANAGER' },
    { relationshipChoice: 'Guessed label' },
    { customRelationship: 'x'.repeat(81) },
    { confirmHandover: 'true' },
    { handoverToUserId: { $ne: null } },
    { financeAccess: true },
    { preview: 'invalid' },
  ])
    assert.equal(
      memberChangeInput.safeParse({ ...body, ...change }).success,
      false,
    );
});
test('only the original creator is exempt; Other requires an explicit nonempty label', () => {
  assert.equal(
    memberRelationship(
      memberChangeInput.parse({ ...body, relationshipChoice: '' }),
      true,
    ),
    null,
  );
  assert.throws(() => memberRelationship(body, true), {
    code: 'VALIDATION_ERROR',
  });
  assert.throws(
    () =>
      memberRelationship(
        { relationshipChoice: '', customRelationship: '' },
        false,
      ),
    { code: 'VALIDATION_ERROR' },
  );
  assert.throws(
    () =>
      memberRelationship(
        { relationshipChoice: 'OTHER', customRelationship: '' },
        false,
      ),
    { code: 'VALIDATION_ERROR' },
  );
  const custom = memberChangeInput.parse({
    ...body,
    relationshipChoice: 'OTHER',
    customRelationship: '  Bride’s cousin  ',
  });
  assert.equal(memberRelationship(custom, false), 'Bride’s cousin');
});
test('member edits require a valid optimistic version', () => {
  assert.equal(memberVersion('0'), 0);
  assert.equal(memberVersion('"123"'), 123);
  assert.throws(() => memberVersion(), { code: 'PRECONDITION_REQUIRED' });
  for (const value of [
    '-1',
    '1.5',
    '"2',
    '2"',
    '*',
    '1,2',
    '9'.repeat(16),
    ['1'],
  ])
    assert.throws(() => memberVersion(value), { code: 'VALIDATION_ERROR' });
});
test('preview signatures bind scope/impact and expire after ten minutes without timing-dependent equality', () => {
  const issued = instant.getTime(),
    fingerprint = '[actor,wedding,member,version,impact]';
  const token = `${issued}.${signMemberPreview(settings, fingerprint, issued)}`;
  assert.doesNotThrow(() =>
    checkMemberPreview(settings, fingerprint, token, instant),
  );
  assert.doesNotThrow(() =>
    checkMemberPreview(settings, fingerprint, token, new Date(issued + 600000)),
  );
  for (const [scope, value, time] of [
    [fingerprint + 'changed', token, instant],
    [fingerprint, token, new Date(issued + 600001)],
    [fingerprint, token, new Date(issued - 1)],
    [fingerprint, token.slice(0, -1), instant],
  ])
    assert.throws(() => checkMemberPreview(settings, scope, value, time), {
      code: 'MEMBER_PREVIEW_STALE',
    });
  assert.throws(
    () => signMemberPreview({ jwtSecret: '' }, fingerprint, issued),
    { code: 'MEMBER_CHANGE_UNAVAILABLE' },
  );
});
test('member management routes enforce session, trusted origin, JSON/CSRF and forward exact version/key', async () => {
  let reads = 0,
    writes = 0;
  const app = createApp({
    settings,
    service: {
      session: async ({ accessToken }) => {
        if (accessToken !== 'eligible')
          throw new ApiError(401, 'SESSION_EXPIRED', 'Sign in.');
        return { user: { id: 'actor' } };
      },
    },
    members: {
      read: async (...args) => {
        reads++;
        assert.deepEqual(args.slice(0, 3), [
          'actor',
          'a'.repeat(24),
          'b'.repeat(24),
        ]);
        return { preview: 'safe' };
      },
      update: async (...args) => {
        writes++;
        assert.deepEqual(args.slice(0, 4), [
          'actor',
          'a'.repeat(24),
          'b'.repeat(24),
          body,
        ]);
        assert.deepEqual(args.slice(4), ['7', 'retry-original-key']);
        return { role: 'VIEWER' };
      },
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`,
    url = `${base}/weddings/${'a'.repeat(24)}/members/${'b'.repeat(24)}`;
  try {
    const guest = await fetch(url + '/management');
    assert.equal(guest.status, 401);
    await guest.arrayBuffer();
    const hostile = await fetch(url + '/management', {
      headers: {
        Cookie: 'mmm_access=eligible',
        Origin: 'https://hostile.invalid',
      },
    });
    assert.equal(hostile.status, 403);
    await hostile.arrayBuffer();
    const read = await fetch(url + '/management', {
      headers: { Cookie: 'mmm_access=eligible' },
    });
    assert.equal(read.status, 200);
    assert.match(read.headers.get('cache-control'), /no-store/);
    await read.arrayBuffer();
    const headers = {
      Cookie: 'mmm_access=eligible',
      Origin: settings.webOrigin,
      'Content-Type': 'application/json',
      'If-Match': '7',
      'Idempotency-Key': 'retry-original-key',
    };
    const missing = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
    assert.equal(missing.status, 403);
    await missing.arrayBuffer();
    const csrf = await fetch(base + '/auth/csrf');
    const cookies = csrf.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; '),
      token = (await csrf.json()).data.csrfToken;
    const good = await fetch(url, {
      method: 'PATCH',
      headers: {
        ...headers,
        Cookie: `${headers.Cookie}; ${cookies}`,
        'x-csrf-token': token,
      },
      body: JSON.stringify(body),
    });
    assert.equal(good.status, 200);
    await good.arrayBuffer();
    assert.equal(reads, 1);
    assert.equal(writes, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
