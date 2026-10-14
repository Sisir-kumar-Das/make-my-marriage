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

  const home = await request(webUrl);
  assert.equal(home.status, 200);
  assert.equal(new URL(home.url).pathname, '/dashboard');
  await home.arrayBuffer();

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
      html.includes('All planning content is sample data.'),
      `/${route} should identify sample content`,
    );
    assert.ok(
      html.includes(
        route === 'dashboard'
          ? 'Your wedding, taking shape.'
          : 'This is a placeholder.',
      ),
      `/${route} should render its content`,
    );
  }
  const unknownPage = await request(`${webUrl}/does-not-exist`);
  assert.equal(unknownPage.status, 404);
  await unknownPage.arrayBuffer();
  console.info(
    'PASS: home redirect, all eight explicit web routes, sample/placeholder labels and unknown-page 404.',
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
