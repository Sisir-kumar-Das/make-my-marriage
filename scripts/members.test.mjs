import assert from 'node:assert/strict';
import test from 'node:test';
import {
  memberListQuery,
  memberDirectoryRow,
  createMemberService,
} from '../apps/api/src/members/service.js';
import { createApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';
import { refreshState } from '../apps/web/src/lib/refresh-state.js';

test('background refresh retains the last same-scope counts and rows until replacement', () => {
  const data = { counts: { total: 9 }, rows: [{ id: 'saved-row' }] };
  const result = { scope: 'same-query', key: 'attempt-1', data };
  assert.deepEqual(refreshState(result, 'same-query', 'attempt-2'), {
    data,
    error: '',
    loading: false,
    refreshing: true,
  });
  const replacement = { counts: { total: 10 }, rows: [{ id: 'new-row' }] };
  assert.deepEqual(
    refreshState(
      { scope: 'same-query', key: 'attempt-2', data: replacement },
      'same-query',
      'attempt-2',
    ),
    { data: replacement, error: '', loading: false, refreshing: false },
  );
  assert.equal(result.data, data);
});

test('refresh never carries rows or private counts across account, wedding, role, filters or pages', () => {
  const context = ['wedding-a', 'account-a', 'ADMIN', 'ALL', 1];
  const scope = JSON.stringify(context);
  const result = { scope, key: 'old', data: { email: 'private@example.com' } };
  for (const [index, value] of [
    [0, 'wedding-b'],
    [1, 'account-b'],
    [2, 'VIEWER'],
    [3, 'FAMILY_MEMBER'],
    [4, 2],
  ]) {
    const next = [...context];
    next[index] = value;
    assert.deepEqual(refreshState(result, JSON.stringify(next), 'next'), {
      data: null,
      error: '',
      loading: true,
      refreshing: false,
    });
  }
});

test('failed refresh shows its error and retry returns to loading without reviving old data', () => {
  const result = {
    scope: 'members',
    key: 'failed',
    error: 'Could not refresh.',
  };
  assert.deepEqual(refreshState(result, 'members', 'failed'), {
    data: null,
    error: 'Could not refresh.',
    loading: false,
    refreshing: false,
  });
  assert.deepEqual(refreshState(result, 'members', 'retry'), {
    data: null,
    error: '',
    loading: true,
    refreshing: false,
  });
});

test('initial and empty-list refresh states distinguish unavailable data from a real zero', () => {
  assert.deepEqual(refreshState(null, 'tasks', 'first'), {
    data: null,
    error: '',
    loading: true,
    refreshing: false,
  });
  const data = { counts: { total: 0 }, rows: [] };
  assert.deepEqual(
    refreshState({ scope: 'tasks', key: 'first', data }, 'tasks', 'next'),
    {
      data,
      error: '',
      loading: false,
      refreshing: true,
    },
  );
});

test('member queries are strict, bounded and reject injected or duplicate values', () => {
  assert.deepEqual(memberListQuery.parse({}), { page: 1, limit: 20 });
  assert.deepEqual(
    memberListQuery.parse({ role: 'VIEWER', page: '2', limit: '100' }),
    { role: 'VIEWER', page: 2, limit: 100 },
  );
  for (const query of [
    { role: 'OWNER' },
    { role: ['ADMIN', 'VIEWER'] },
    { role: { $ne: null } },
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: '01' },
    { page: '100001' },
    { limit: '101' },
    { limit: ['1', '2'] },
    { includeEmail: 'true' },
    { weddingId: 'other' },
    { search: 'email' },
  ])
    assert.equal(memberListQuery.safeParse(query).success, false);
});

const row = {
  _id: 'membership',
  userId: 'member-user',
  name: 'Ramesh',
  email: 'private@example.invalid',
  relationship: ' Bride’s father ',
  role: 'FAMILY_MEMBER',
  passwordHash: 'never-return',
  financeAccess: true,
};
test('only the current Admin or account owner receives a member email', () => {
  for (const viewerRole of ['FAMILY_MEMBER', 'VIEWER']) {
    const other = memberDirectoryRow(
      row,
      { viewerId: 'other-user', viewerRole, creatorId: 'creator' },
      3,
    );
    assert.equal(Object.hasOwn(other, 'email'), false);
    assert.equal(JSON.stringify(other).includes(row.email), false);
    assert.equal(other.relationship, 'Bride’s father');
    assert.equal(other.openTaskCount, 3);
    assert.equal(Object.hasOwn(other, 'passwordHash'), false);
    assert.equal(Object.hasOwn(other, 'financeAccess'), false);
    assert.equal(
      memberDirectoryRow(row, {
        viewerId: row.userId,
        viewerRole,
        creatorId: 'creator',
      }).email,
      row.email,
    );
  }
  assert.equal(
    memberDirectoryRow(row, {
      viewerId: 'admin',
      viewerRole: 'ADMIN',
      creatorId: 'creator',
    }).email,
    row.email,
  );
});
test('the original creator exception follows wedding creation, not an Admin role or inferred name', () => {
  const creator = memberDirectoryRow(row, {
    viewerId: row.userId,
    viewerRole: 'ADMIN',
    creatorId: row.userId,
  });
  assert.equal(creator.isCreator, true);
  assert.equal(creator.isYou, true);
  assert.equal(creator.relationship, null);
  const laterAdmin = memberDirectoryRow(
    { ...row, role: 'ADMIN' },
    { viewerId: 'other', viewerRole: 'VIEWER', creatorId: 'creator' },
  );
  assert.equal(laterAdmin.isCreator, false);
  assert.equal(laterAdmin.relationship, 'Bride’s father');
  assert.equal(
    memberDirectoryRow(
      { ...row, relationship: null },
      { viewerId: 'other', viewerRole: 'VIEWER', creatorId: 'creator' },
    ).relationship,
    null,
  );
});
test('invalid directory IDs and filters fail before database access', async () => {
  const members = createMemberService({
    database: {
      connect: () => {
        throw new Error('Must not connect');
      },
    },
  });
  await assert.rejects(members.list('user', 'bad-id'), {
    code: 'WEDDING_NOT_FOUND',
  });
  await assert.rejects(
    members.list('user', 'a'.repeat(24), { includeRemoved: 'true' }),
    { code: 'VALIDATION_ERROR' },
  );
});
test('the member route requires authentication/trusted origin and exposes only its GET service', async () => {
  let reads = 0;
  const app = createApp({
    settings: { ...config, webOrigin: 'http://localhost:3000' },
    service: {
      session: async ({ accessToken }) => {
        if (accessToken !== 'eligible')
          throw new ApiError(401, 'SESSION_EXPIRED', 'Please sign in.');
        return { user: { id: 'viewer' } };
      },
    },
    members: {
      list: async (userId, weddingId, query) => {
        reads++;
        assert.equal(userId, 'viewer');
        assert.equal(weddingId, 'a'.repeat(24));
        assert.equal(query.role, 'VIEWER');
        return {
          members: [],
          counts: { ALL: 1, ADMIN: 1, FAMILY_MEMBER: 0, VIEWER: 0 },
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        };
      },
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/v1/weddings/${'a'.repeat(24)}/members?role=VIEWER`;
    const guest = await fetch(url);
    assert.equal(guest.status, 401);
    await guest.arrayBuffer();
    const hostile = await fetch(url, {
      headers: {
        Origin: 'https://untrusted.example',
        Cookie: 'mmm_access=eligible',
      },
    });
    assert.equal(hostile.status, 403);
    await hostile.arrayBuffer();
    assert.equal(reads, 0);
    const response = await fetch(url, {
      headers: {
        Origin: 'http://localhost:3000',
        Cookie: 'mmm_access=eligible',
      },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.ok(response.headers.get('x-request-id'));
    assert.deepEqual((await response.json()).data.members, []);
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const unsupported = await fetch(url, {
        method,
        headers: {
          Origin: 'http://localhost:3000',
          Cookie: 'mmm_access=eligible',
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      assert.equal(unsupported.status, 404);
      await unsupported.arrayBuffer();
    }
    assert.equal(reads, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
