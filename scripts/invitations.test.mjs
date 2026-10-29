import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { config } from '../apps/api/src/config.js';
import {
  invitationInput,
  invitationTokenInput,
  invitationChange,
  invitationPage,
} from '../apps/api/src/invitations/validation.js';
import {
  hashInvitation,
  invitationToken,
  newInvitationToken,
  invitationUrl,
} from '../apps/api/src/invitations/tokens.js';
import {
  invitationState,
  invitationRow,
  createInvitationService,
} from '../apps/api/src/invitations/service.js';
import {
  invitationAuthHref,
  invitationHref,
  readInvitation,
} from '../apps/web/src/features/invitations/invitation-data.js';
import {
  createInvitationSender,
  verificationEmail,
} from '../apps/api/src/auth/email.js';
import { createApp } from '../apps/api/src/app.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';
const settings = {
  ...config,
  jwtSecret: 'invitation-test-secret-'.repeat(3),
  webOrigin: 'http://localhost:3000',
  emailProvider: 'gmail',
  smtpUser: 'fixture@gmail.com',
  smtpAppPassword: 'abcdefghijklmnop',
};
const input = {
  email: ' Recipient@Example.COM ',
  role: 'FAMILY_MEMBER',
  relationshipChoice: 'OTHER',
  customRelationship: ' Bride’s childhood friend ',
};
test('invitation input requires real roles and explicit bounded relationships, with no mass assignment', () => {
  assert.equal(invitationInput.parse(input).email, 'recipient@example.com');
  assert.equal(
    invitationInput.parse(input).customRelationship,
    'Bride’s childhood friend',
  );
  for (const patch of [
    { role: 'MANAGER' },
    { relationshipChoice: '' },
    { relationshipChoice: 'OTHER', customRelationship: '  ' },
    { customRelationship: 'x'.repeat(81) },
    { email: { $ne: null } },
    { status: 'ACCEPTED' },
    { financeAccess: true },
  ])
    assert.equal(
      invitationInput.safeParse({ ...input, ...patch }).success,
      false,
    );
  for (const raw of [
    { version: -1 },
    { version: '0' },
    { version: 0, role: 'ADMIN' },
  ])
    assert.equal(invitationChange.safeParse(raw).success, false);
  for (const raw of [{ page: '0' }, { page: ['1'] }, { limit: '1000' }])
    assert.equal(invitationPage.safeParse(raw).success, false);
  assert.equal(
    invitationTokenInput.safeParse({
      token: 'x'.repeat(43),
      email: 'other@example.com',
    }).success,
    false,
  );
});
test('copyable invitation tokens require the server secret and rotate without plaintext storage', () => {
  const id = 'a'.repeat(24),
    issued = newInvitationToken(settings, id),
    token = invitationToken(settings, id, issued.nonce);
  assert.equal(token.length, 43);
  assert.equal(hashInvitation(token), issued.tokenHash);
  assert.notEqual(issued.nonce, token);
  assert.equal(Object.hasOwn(issued, 'token'), false);
  assert.notEqual(
    invitationToken(
      { ...settings, jwtSecret: 'different'.repeat(8) },
      id,
      issued.nonce,
    ),
    token,
  );
  assert.notEqual(newInvitationToken(settings, id).tokenHash, issued.tokenHash);
  assert.throws(() => invitationToken({ jwtSecret: '' }, id, issued.nonce), {
    code: 'INVITATION_UNAVAILABLE',
  });
});
test('invite URLs and auth continuation use fixed local routes and fragment-only tokens', () => {
  const token = 'A'.repeat(43),
    url = new URL(invitationUrl(settings.webOrigin, token));
  assert.equal(url.pathname, '/invite');
  assert.equal(url.search, '');
  assert.equal(readInvitation(url.hash, 'token'), token);
  assert.equal(readInvitation(`#invite=${token}&invite=${token}`), '');
  assert.equal(readInvitation('#invite=https://untrusted.example'), '');
  assert.equal(
    invitationAuthHref('https://untrusted.example', token),
    '/login',
  );
  assert.equal(
    invitationAuthHref('/login?from=registration', token),
    `/login?from=registration#invite=${token}`,
  );
  assert.equal(invitationHref(token), `/invite#token=${token}`);
});
test('expiry is enforced on reads and private token material is excluded from list rows', () => {
  const instant = new Date('2026-10-28T12:00:00Z');
  const row = {
    _id: 'id',
    email: 'a@example.com',
    status: 'PENDING',
    createdAt: instant,
    lastSentAt: instant,
    expiresAt: instant,
    tokenHash: 'private',
    nonce: 'private',
    acceptedBy: 'private',
    __v: 2,
  };
  assert.equal(invitationState(row, instant), 'EXPIRED');
  const data = invitationRow(row, instant);
  assert.equal(data.version, 2);
  assert.equal(data.retryAfterSeconds, 45);
  for (const field of ['nonce', 'tokenHash', 'acceptedBy'])
    assert.equal(Object.hasOwn(data, field), false);
});
test('Gmail invitation email and verification continuation carry exact email-bound fragment routes', async () => {
  let message;
  await createInvitationSender(settings, {
    createTransport: () => ({
      sendMail: async (value) => {
        message = value;
        return { accepted: ['recipient@example.com'], rejected: [] };
      },
    }),
    request: () => assert.fail('No HTTP fallback'),
  })({
    email: 'recipient@example.com',
    token: 'T'.repeat(43),
    tokenHash: 'private-hash',
    weddingName: 'Anya weds Kabir',
    role: 'VIEWER',
    relationship: 'Friend',
  });
  assert.match(message.text, /explicitly/);
  assert.match(message.text, /seven days/);
  assert.match(message.text, /Viewer/);
  assert.equal(JSON.stringify(message).includes('private-hash'), false);
  const link = new URL(
    verificationEmail({
      to: 'recipient@example.com',
      token: 'V'.repeat(43),
      invitation: 'I'.repeat(43),
      webOrigin: settings.webOrigin,
      ttlHours: 24,
    }).text.match(/https?:\/\/\S+/)[0],
  );
  assert.equal(link.pathname, '/verify-email');
  assert.equal(link.search, '');
  assert.equal(readInvitation(link.hash), 'I'.repeat(43));
});
test('invalid invitation inputs cannot reach persistence', async () => {
  const service = createInvitationService({
    settings,
    database: { connect: () => assert.fail('No database access') },
  });
  await assert.rejects(
    service.create(
      'u',
      'a'.repeat(24),
      { ...input, role: 'OWNER' },
      randomUUID(),
    ),
    { code: 'VALIDATION_ERROR' },
  );
  await assert.rejects(service.accept('u', { token: 'bad' }, randomUUID()), {
    code: 'VALIDATION_ERROR',
  });
  await assert.rejects(service.create('u', 'a'.repeat(24), input, ''), {
    code: 'IDEMPOTENCY_KEY_REQUIRED',
  });
});
test('invitation routes enforce origin, JSON, authenticated CSRF and no-store without tokens in URL', async () => {
  const calls = [];
  const service = {
    session: async ({ accessToken }) => {
      if (accessToken !== 'signed')
        throw new ApiError(401, 'SESSION_EXPIRED', 'Sign in');
      return { user: { id: 'actor' } };
    },
  };
  const invitations = Object.fromEntries(
    ['preview', 'accept', 'list', 'create', 'copyLink', 'resend', 'revoke'].map(
      (name) => [
        name,
        async (...args) => {
          calls.push([name, ...args]);
          return { state: 'PENDING' };
        },
      ],
    ),
  );
  const server = createApp({ settings, service, invitations }).listen(
    0,
    '127.0.0.1',
  );
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    const publicResponse = await fetch(`${base}/member-invitations/preview`, {
      method: 'POST',
      headers: {
        Origin: settings.webOrigin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: 'T'.repeat(43) }),
    });
    assert.equal(publicResponse.status, 200);
    assert.match(publicResponse.headers.get('cache-control'), /no-store/);
    await publicResponse.arrayBuffer();
    for (const [headers, expected] of [
      [
        {
          Origin: 'https://untrusted.example',
          'Content-Type': 'application/json',
        },
        403,
      ],
      [{ Origin: settings.webOrigin }, 415],
    ]) {
      const response = await fetch(`${base}/member-invitations/preview`, {
        method: 'POST',
        headers,
        body: '{}',
      });
      assert.equal(response.status, expected);
      await response.arrayBuffer();
    }
    const csrf = await fetch(`${base}/auth/csrf`);
    const csrfPayload = await csrf.json();
    const cookie = csrf.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const mutationHeaders = {
      Origin: settings.webOrigin,
      'Content-Type': 'application/json',
      Cookie: `${cookie}; mmm_access=signed`,
      'X-CSRF-Token': csrfPayload.data.csrfToken,
      'Idempotency-Key': randomUUID(),
    };
    const denied = await fetch(`${base}/member-invitations/accept`, {
      method: 'POST',
      headers: { ...mutationHeaders, 'X-CSRF-Token': '' },
      body: '{}',
    });
    assert.equal(denied.status, 403);
    await denied.arrayBuffer();
    const accepted = await fetch(`${base}/member-invitations/accept`, {
      method: 'POST',
      headers: mutationHeaders,
      body: JSON.stringify({ token: 'T'.repeat(43) }),
    });
    assert.equal(accepted.status, 200);
    await accepted.arrayBuffer();
    const list = await fetch(`${base}/weddings/${'a'.repeat(24)}/invitations`, {
      headers: { Cookie: 'mmm_access=signed' },
    });
    assert.equal(list.status, 200);
    await list.arrayBuffer();
    assert.deepEqual(
      calls.map(([name]) => name),
      ['preview', 'accept', 'list'],
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('current invitation login completion and missing-account guidance remain usable', async () => {
  const { runLoginRequest } =
    await import('../apps/web/src/features/auth/login-request.js');
  const request = { current: null },
    token = 'A'.repeat(43),
    context = `/login/${token}`,
    routes = [];
  await runLoginRequest({
    request,
    context,
    readContext: () => context,
    send: async () => ({ data: { wedding: null } }),
    onSuccess: () => routes.push(invitationHref(token)),
    onFailure: () => assert.fail('Unexpected failure'),
  });
  await runLoginRequest({
    request,
    context,
    readContext: () => context,
    send: async () => {
      throw Object.assign(new Error('Account missing'), {
        code: 'ACCOUNT_NOT_FOUND',
      });
    },
    onSuccess: () => assert.fail('Unexpected success'),
    onFailure: (failure) => {
      assert.equal(failure.code, 'ACCOUNT_NOT_FOUND');
      routes.push(invitationAuthHref('/register?from=login', token));
    },
  });
  assert.deepEqual(routes, [
    `/invite#token=${token}`,
    `/register?from=login#invite=${token}`,
  ]);
  assert.equal(request.current, null);
});

for (const outcome of ['success', 'missing-account'])
  test(`stale ${outcome} login cannot navigate after the invitation changes before cleanup`, async () => {
    const { runLoginRequest } =
      await import('../apps/web/src/features/auth/login-request.js');
    const request = { current: null };
    let context = '/login/A',
      settle;
    const callbacks = [];
    const response = new Promise((resolve, reject) => {
      settle = outcome === 'success' ? resolve : reject;
    });
    const pending = runLoginRequest({
      request,
      context,
      readContext: () => context,
      send: () => response,
      onSuccess: () => callbacks.push('old invite redirect'),
      onFailure: () => callbacks.push('old registration redirect'),
    });
    context = '/login/B';
    settle(
      outcome === 'success'
        ? { data: {} }
        : Object.assign(new Error('Account missing'), {
            code: 'ACCOUNT_NOT_FOUND',
          }),
    );
    await pending;
    assert.deepEqual(callbacks, []);
    assert.equal(request.current, null);
  });

test('cancelled A → B → A login never revives its abandoned redirect, even if the transport finishes', async () => {
  const { runLoginRequest, cancelLoginRequest } =
    await import('../apps/web/src/features/auth/login-request.js');
  const request = { current: null };
  let context = '/login/A',
    finish,
    signal;
  const pending = runLoginRequest({
    request,
    context,
    readContext: () => context,
    send: (value) => {
      signal = value;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    onSuccess: () => assert.fail('Old A must stay canceled'),
    onFailure: () => assert.fail('No stale error'),
  });
  context = '/login/B';
  cancelLoginRequest(request);
  context = '/login/A';
  finish({ data: {} });
  await pending;
  assert.equal(signal.aborted, true);
  assert.equal(request.current, null);
});

test('a late old login cannot clear or redirect a newer invitation attempt', async () => {
  const { runLoginRequest } =
    await import('../apps/web/src/features/auth/login-request.js');
  const request = { current: null };
  let context = '/login/A',
    finishA,
    finishB;
  const redirects = [];
  const options = (name) => ({
    request,
    context,
    readContext: () => context,
    send: () =>
      new Promise((resolve) => {
        if (name === 'A') finishA = resolve;
        else finishB = resolve;
      }),
    onSuccess: () => redirects.push(name),
    onFailure: () => assert.fail('Unexpected error'),
  });
  const a = runLoginRequest(options('A'));
  context = '/login/B';
  const b = runLoginRequest(options('B'));
  const currentB = request.current;
  finishA({ data: {} });
  await a;
  assert.equal(request.current, currentB);
  finishB({ data: {} });
  await b;
  assert.deepEqual(redirects, ['B']);
  assert.equal(request.current, null);
});

test('unmount cancels a pending login and rejects late failure feedback', async () => {
  const { runLoginRequest, cancelLoginRequest } =
    await import('../apps/web/src/features/auth/login-request.js');
  const request = { current: null };
  let reject;
  const pending = runLoginRequest({
    request,
    context: '/login/A',
    readContext: () => '/login/A',
    send: () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    onSuccess: () => assert.fail('Unmounted'),
    onFailure: () => assert.fail('Unmounted feedback'),
  });
  cancelLoginRequest(request);
  reject(new Error('Late network failure'));
  await pending;
  assert.equal(request.current, null);
});
