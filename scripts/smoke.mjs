import assert from 'node:assert/strict';

const apiUrl = (
  process.env.SMOKE_API_BASE_URL || 'http://localhost:4000/api/v1'
).replace(/\/$/, '');
const webUrl = (process.env.SMOKE_WEB_URL || 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const origin = new URL(webUrl).origin;
const request = (url, options) =>
  fetch(url, { ...options, signal: AbortSignal.timeout(15000) });

try {
  const health = await request(`${apiUrl}/health`, {
    headers: { Origin: origin },
  });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('access-control-allow-origin'), origin);
  assert.equal(health.headers.get('access-control-allow-credentials'), 'true');
  assert.match(
    health.headers.get('access-control-expose-headers'),
    /x-request-id/i,
  );
  assert.match(health.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  assert.deepEqual(await health.json(), {
    success: true,
    data: { status: 'ok', service: 'make-my-marriage-api' },
  });

  const blockedOrigin = await request(`${apiUrl}/health`, {
    headers: { Origin: 'https://untrusted.example' },
  });
  assert.equal(blockedOrigin.headers.get('access-control-allow-origin'), null);
  assert.notEqual(
    blockedOrigin.headers.get('x-request-id'),
    health.headers.get('x-request-id'),
  );
  await blockedOrigin.arrayBuffer();

  const preflight = await request(`${apiUrl}/health`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.ok(preflight.headers.get('x-request-id'));

  for (const [options, status, code] of [
    [{}, 404, 'NOT_FOUND'],
    [
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      },
      400,
      'INVALID_JSON',
    ],
    [
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'x'.repeat(103000) }),
      },
      413,
      'PAYLOAD_TOO_LARGE',
    ],
  ]) {
    const response = await request(`${apiUrl}/missing`, options);
    const payload = await response.json();
    assert.equal(response.status, status);
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, code);
    assert.equal(payload.requestId, response.headers.get('x-request-id'));
    assert.equal(payload.error.stack, undefined);
  }
  console.info(
    'PASS: API health, request IDs, CORS/preflight, 404, malformed JSON and payload limit.',
  );

  const relayedHealth = await request(`${webUrl}/api/v1/health`);
  assert.equal(relayedHealth.status, 200);
  assert.ok(relayedHealth.headers.get('x-request-id'));
  assert.equal((await relayedHealth.json()).data.status, 'ok');
  const csrf = await request(`${webUrl}/api/v1/auth/csrf`);
  assert.equal(csrf.status, 200);
  assert.equal(csrf.headers.getSetCookie().length, 2);
  assert.match(csrf.headers.get('cache-control'), /no-store/);
  assert.ok((await csrf.json()).data.csrfToken);
  const anonymousSession = await request(`${webUrl}/api/v1/auth/session`);
  assert.equal(anonymousSession.status, 401);
  assert.equal((await anonymousSession.json()).error.code, 'SESSION_EXPIRED');
  const largeRelayBody = await request(`${webUrl}/api/v1/missing`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'x'.repeat(103000) }),
  });
  assert.equal(largeRelayBody.status, 413);
  assert.equal((await largeRelayBody.json()).error.code, 'PAYLOAD_TOO_LARGE');
  console.info(
    'PASS: same-origin API relay, CSRF cookies, anonymous session denial and relay body limit.',
  );

  const home = await request(webUrl);
  assert.equal(home.status, 200);
  assert.equal(new URL(home.url).pathname, '/');
  const homeHtml = await home.text();
  assert.ok(homeHtml.includes('Plan every moment.'));
  assert.ok(homeHtml.includes('Product preview'));
  assert.ok(homeHtml.includes('id="wedding-website"'));
  assert.ok(homeHtml.includes('Planned'));
  assert.ok(homeHtml.includes('href="/register"'));
  assert.match(
    homeHtml,
    /<button[^>]*disabled=""[^>]*>\s*RSVP Now\s*<\/button>/,
    'Future guest RSVP actions must remain disabled',
  );
  for (const [asset, type] of [
    ['/brand/make-my-marriage-logo.png', 'image/png'],
    ['/images/sample-couple.webp', 'image/webp'],
  ]) {
    const response = await request(`${webUrl}${asset}`);
    assert.equal(response.status, 200, `${asset} should be available locally`);
    assert.ok(response.headers.get('content-type').includes(type));
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }

  for (const [route, title] of [
    ['register', 'Create your wedding account.'],
    ['verify-email', 'Check your inbox.'],
    ['login', 'Welcome back.'],
    ['forgot-password', 'Reset your password.'],
    ['reset-password', 'Set a new password.'],
  ]) {
    const response = await request(`${webUrl}/${route}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(title));
    assert.ok(html.includes('name="robots" content="noindex, nofollow"'));
  }

  const malformedVerification = await request(`${apiUrl}/auth/verify-email`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'invalid' }),
  });
  assert.equal(malformedVerification.status, 400);
  assert.equal(
    (await malformedVerification.json()).error.code,
    'VALIDATION_ERROR',
  );

  const malformedReset = await request(`${apiUrl}/auth/reset-password`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'invalid', password: 'weak' }),
  });
  assert.equal(malformedReset.status, 400);
  assert.equal((await malformedReset.json()).error.code, 'VALIDATION_ERROR');

  for (const route of [
    'dashboard',
    'events',
    'tasks',
    'checklist',
    'members',
    'profile',
    'settings',
    'recovery',
  ]) {
    const page = await request(`${webUrl}/${route}`);
    assert.equal(page.status, 200, `/${route} should respond successfully`);
    const html = await page.text();
    assert.ok(
      html.includes('Checking your session'),
      `/${route} should require a session`,
    );
    assert.ok(
      !html.includes('Your wedding, taking shape.'),
      'Anonymous responses must not embed workspace content',
    );
    assert.ok(
      !html.includes('All planning content is sample data.'),
      'Anonymous responses must not embed the workspace shell',
    );
  }
  const unknownPage = await request(`${webUrl}/does-not-exist`);
  assert.equal(unknownPage.status, 404);
  await unknownPage.arrayBuffer();
  console.info(
    'PASS: public homepage/auth routes, planned previews, local assets, all eight workspace gates and unknown-page 404.',
  );
  console.info(
    'Browser connectivity, API-unavailable states and responsive navigation require browser verification.',
  );
} catch (error) {
  console.error(`Smoke check failed: ${error.message}`);
  console.error(
    'Start both applications first. See docs/DEVELOPMENT.md for custom URLs.',
  );
  process.exitCode = 1;
}
