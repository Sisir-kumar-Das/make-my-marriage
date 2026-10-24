import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';
import { createEventService } from '../apps/api/src/events/service.js';
import {
  createEventSchema,
  patchEventSchema,
  eventListSchema,
  eventVersion,
} from '../apps/api/src/events/validation.js';
import {
  eventFormSchema,
  eventInput,
  indiaParts,
  nextDate,
  mapsLink,
  initialEvent,
  eventRange,
} from '../apps/web/src/features/events/form-data.js';

const weddingId = '123456789012345678901234',
  eventId = 'abcdef123456789012345678';
const input = {
  name: ' Haldi ',
  type: 'HALDI',
  startAt: '2020-02-20T23:00:00+05:30',
  endAt: '2020-02-21T02:00:00+05:30',
};
test('events accept past and overnight timings and normalize equivalent instants; reject invalid time order and injected fields', () => {
  const parsed = createEventSchema.parse(input);
  assert.equal(parsed.name, 'Haldi');
  assert.equal(parsed.startAt, '2020-02-20T17:30:00.000Z');
  assert.equal(parsed.venue, null);
  assert.equal(parsed.status, 'PLANNED');
  for (const patch of [
    { endAt: input.startAt },
    { endAt: '2020-02-19T02:00:00+05:30' },
    { startAt: '2027-02-29T12:00:00Z' },
    { type: 'PARTY' },
    { weddingId: 'another' },
    { createdBy: 'attacker' },
    { activities: [] },
    { venue: { source: 'GOOGLE', googlePlaceId: 'unverified' } },
    { status: 'DELETED' },
  ])
    assert.equal(
      createEventSchema.safeParse({ ...input, ...patch }).success,
      false,
    );
  assert.equal(patchEventSchema.safeParse({}).success, false);
  assert.equal(patchEventSchema.safeParse({ version: 3 }).success, false);
});
test('event form/serializer round-trip India times across midnight, allow past dates, and clear optional venues', () => {
  const values = {
    ...initialEvent({ mainDate: '2027-02-20' }),
    name: 'Mehendi',
    type: 'MEHENDI',
    startDate: '2020-02-20',
    startTime: '23:00',
    endDate: '2020-02-21',
    endTime: '02:30',
  };
  const api = eventInput(values);
  assert.equal(createEventSchema.safeParse(api).success, true);
  const roundtrip = initialEvent({}, api);
  assert.equal(roundtrip.startDate, values.startDate);
  assert.equal(roundtrip.endTime, values.endTime);
  assert.equal(api.venue, null);
  for (const patch of [
    { startDate: '2027-02-29' },
    { startTime: '24:00' },
    { endDate: '2020-02-20', endTime: '22:00' },
  ])
    assert.equal(
      eventFormSchema.safeParse({ ...values, ...patch }).success,
      false,
    );
  assert.equal(nextDate('2028-02-28'), '2028-02-29');
  assert.equal(nextDate('2027-12-31'), '2028-01-01');
  assert.equal(nextDate('bad'), '');
  assert.deepEqual(indiaParts('2020-02-20T18:30:00Z'), {
    date: '2020-02-21',
    time: '00:00',
  });
  assert.match(
    eventRange({
      startAt: '2027-12-31T23:00:00+05:30',
      endAt: '2028-01-01T01:00:00+05:30',
    }),
    /1 Jan 2028/,
  );
});
test('manual map links encode venue text as a Google Maps query rather than accepting a redirect URL', () => {
  assert.equal(mapsLink(null), null);
  const address = {
    name: 'A & B # Hall',
    formattedAddress: 'javascript:alert(1)',
    city: 'Cuttack',
  };
  const url = new URL(mapsLink(address));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(
    url.searchParams.get('query'),
    'A & B # Hall, javascript:alert(1), Cuttack',
  );
});
test('pagination and If-Match validation are bounded; invalid saves never open a database', async () => {
  assert.deepEqual(eventListSchema.parse({}), { page: 1, limit: 20 });
  for (const query of [
    { page: 0 },
    { limit: 101 },
    { status: 'CONFIRMED' },
    { page: { $ne: 0 } },
  ])
    assert.equal(eventListSchema.safeParse(query).success, false);
  assert.equal(eventVersion('"0"'), 0);
  for (const value of [undefined, '*', 'W/"1"', '1', '"-1"'])
    assert.equal(eventVersion(value), null);
  const service = createEventService({
    database: { connect: () => assert.fail('invalid input reached database') },
  });
  await assert.rejects(
    service.create(
      'actor',
      weddingId,
      { ...input, role: 'ADMIN' },
      crypto.randomUUID(),
    ),
    { code: 'VALIDATION_ERROR' },
  );
  await assert.rejects(service.create('actor', weddingId, input, 'bad'), {
    code: 'IDEMPOTENCY_KEY_REQUIRED',
  });
  await assert.rejects(
    service.update(
      'actor',
      weddingId,
      eventId,
      { name: 'New' },
      crypto.randomUUID(),
      undefined,
    ),
    { code: 'VERSION_REQUIRED' },
  );
});

test('event HTTP routes preserve session/Origin/JSON/CSRF protection and carry retry/version headers', async () => {
  const settings = {
    ...config,
    jwtSecret: 'native-event-test-secret-'.repeat(3),
    cookieSecure: false,
    cookieSameSite: 'lax',
  };
  let calls = 0,
    received;
  const events = {
    list: async () => ({
      events: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    }),
    read: async () => ({ event: { id: eventId, version: 3 }, warnings: [] }),
    create: async (...args) => {
      calls++;
      received = args;
      return { event: { id: eventId, version: 0 }, warnings: [] };
    },
    update: async (...args) => {
      calls++;
      received = args;
      return { event: { id: eventId, version: 4 }, warnings: [] };
    },
  };
  const service = {
    session: async ({ accessToken }) => {
      if (accessToken !== 'fixture-access')
        throw new ApiError(401, 'SESSION_EXPIRED', 'Sign in.');
      return { user: { id: 'actor' } };
    },
  };
  const server = await new Promise((resolve) => {
    const server = createApp({ service, events, settings }).listen(
      0,
      '127.0.0.1',
      () => resolve(server),
    );
  });
  const jar = new Map([['mmm_access', 'fixture-access']]);
  async function request(path, options = {}) {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/v1${path}`,
      {
        ...options,
        headers: {
          Origin: settings.webOrigin,
          Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '),
          'Content-Type': 'application/json',
          ...options.headers,
        },
      },
    );
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const at = pair.indexOf('=');
      jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return response;
  }
  try {
    const base = `/weddings/${weddingId}/events`;
    assert.equal(
      (await request(base, { headers: { Cookie: '' } })).status,
      401,
    );
    assert.equal(
      (
        await request(base, {
          method: 'POST',
          body: JSON.stringify(input),
          headers: { Origin: 'https://other.example' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(base, {
          method: 'POST',
          body: 'a',
          headers: { 'Content-Type': 'text/plain' },
        })
      ).status,
      415,
    );
    assert.equal(
      (await request(base, { method: 'POST', body: JSON.stringify(input) }))
        .status,
      403,
    );
    assert.equal(calls, 0);
    const token = (await (await request('/auth/csrf')).json()).data.csrfToken;
    const key = crypto.randomUUID();
    const headers = { 'X-CSRF-Token': token, 'Idempotency-Key': key };
    const created = await request(base, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    assert.equal(created.status, 201);
    assert.equal(created.headers.get('etag'), '"0"');
    assert.equal(received[1], weddingId);
    assert.equal(received[3], key);
    const updated = await request(base + '/' + eventId, {
      method: 'PATCH',
      headers: { ...headers, 'If-Match': '"3"' },
      body: JSON.stringify({ name: 'Renamed' }),
    });
    assert.equal(updated.status, 200);
    assert.equal(received[2], eventId);
    assert.equal(received[5], '"3"');
    const read = await request(base + '/' + eventId);
    assert.equal(read.headers.get('etag'), '"3"');
    assert.equal(read.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await (await request(base)).json()).data.events, []);
    assert.equal(
      (
        await request(base + '/' + eventId, {
          method: 'DELETE',
          headers,
          body: '{}',
        })
      ).status,
      404,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
