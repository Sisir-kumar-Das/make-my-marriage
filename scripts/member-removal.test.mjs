import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { memberRemovalInput } from '../apps/api/src/members/validation.js';
import {
  remainingAssignees,
  removalTaskFilter,
} from '../apps/api/src/members/removal-work.js';
import { createApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';

const preview = `${Date.now()}.${'a'.repeat(64)}`,
  departing = 'a'.repeat(24),
  recipient = 'b'.repeat(24);
const body = { preview, policy: 'UNASSIGN', confirmRemoval: true };
test('removal requires explicit confirmation and consistent assignment/handover choices', () => {
  assert.equal(memberRemovalInput.parse(body).replacementUserId, null);
  assert.equal(
    memberRemovalInput.safeParse({ ...body, policy: null }).success,
    true,
  );
  assert.equal(
    memberRemovalInput.safeParse({
      ...body,
      policy: 'REASSIGN',
      replacementUserId: recipient,
      handoverToUserId: recipient,
      confirmHandover: true,
    }).success,
    true,
  );
  for (const changes of [
    { confirmRemoval: false },
    { confirmRemoval: undefined },
    { policy: undefined },
    { policy: 'AUTOMATIC' },
    { policy: 'REASSIGN' },
    { replacementUserId: recipient },
    { handoverToUserId: recipient },
    { confirmHandover: true },
    { replacementUserId: { $ne: null } },
    { deleteUser: true },
  ])
    assert.equal(
      memberRemovalInput.safeParse({ ...body, ...changes }).success,
      false,
    );
});
test('unassignment is an empty array for a sole assignee; shared assignments retain other people', () => {
  assert.deepEqual(remainingAssignees([departing], departing), []);
  assert.deepEqual(remainingAssignees([departing, recipient], departing), [
    recipient,
  ]);
  assert.deepEqual(
    remainingAssignees([departing, recipient, recipient], departing, recipient),
    [recipient],
  );
  assert.deepEqual(
    remainingAssignees([departing, recipient], departing, 'c'.repeat(24)),
    [recipient, 'c'.repeat(24)],
  );
});
test('unfinished assignment scope includes overdue/missing deadlines and excludes completed/deleted/retired records', () => {
  assert.deepEqual(removalTaskFilter('wedding', 'person'), {
    weddingId: 'wedding',
    assigneeIds: 'person',
    status: { $in: ['TODO', 'IN_PROGRESS'] },
    deletedAt: null,
    recurrenceExcluded: { $ne: true },
  });
  assert.equal(
    Object.hasOwn(removalTaskFilter('wedding', 'person'), 'dueAt'),
    false,
  );
});
test('removal HTTP routes require current session, trusted Origin, JSON and CSRF, preserving version/retry headers', async () => {
  const settings = {
    ...config,
    webOrigin: 'http://localhost:3000',
    jwtSecret: randomBytes(48).toString('base64url'),
  };
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
      readRemoval: async (...args) => {
        reads++;
        assert.deepEqual(args.slice(0, 3), ['actor', departing, recipient]);
        return { preview };
      },
      remove: async (...args) => {
        writes++;
        assert.deepEqual(args, [
          'actor',
          departing,
          recipient,
          body,
          '3',
          'disposable-removal-key',
        ]);
        return { status: 'REMOVED' };
      },
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`,
    url = `${base}/weddings/${departing}/members/${recipient}`;
  try {
    for (const [headers, status] of [
      [{}, 401],
      [
        { Cookie: 'mmm_access=eligible', Origin: 'https://hostile.invalid' },
        403,
      ],
      [{ Cookie: 'mmm_access=eligible' }, 200],
    ]) {
      const response = await fetch(url + '/removal', { headers });
      assert.equal(response.status, status);
      assert.match(response.headers.get('cache-control'), /no-store/);
      await response.arrayBuffer();
    }
    const headers = {
      Cookie: 'mmm_access=eligible',
      Origin: settings.webOrigin,
      'Content-Type': 'application/json',
      'If-Match': '3',
      'Idempotency-Key': 'disposable-removal-key',
    };
    for (const [change, status] of [
      [{}, 403],
      [{ Origin: 'https://hostile.invalid' }, 403],
      [{ 'Content-Type': 'text/plain' }, 415],
    ]) {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { ...headers, ...change },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, status);
      await response.arrayBuffer();
    }
    const csrf = await fetch(base + '/auth/csrf'),
      cookies = csrf.headers
        .getSetCookie()
        .map((row) => row.split(';')[0])
        .join('; '),
      token = (await csrf.json()).data.csrfToken;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        ...headers,
        Cookie: `${headers.Cookie}; ${cookies}`,
        'x-csrf-token': token,
      },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.status, 'REMOVED');
    assert.equal(reads, 1);
    assert.equal(writes, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
