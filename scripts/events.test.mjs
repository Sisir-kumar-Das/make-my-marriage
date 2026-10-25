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
  createActivitySchema,
  patchActivitySchema,
  activityLimit,
  eventLifecycleSchema,
  eventRecoveryListSchema,
} from '../apps/api/src/events/validation.js';
import {
  eventFormSchema,
  eventFormValidation,
  eventStatusTiming,
  eventInput,
  indiaParts,
  nextDate,
  mapsLink,
  initialEvent,
  eventRange,
} from '../apps/web/src/features/events/form-data.js';
import { activityTimingWarnings as serverActivityWarnings } from '../apps/api/src/events/activities.js';
import {
  activityFormSchema,
  activityInput,
  activityEditValues,
  activityWriteBody,
  activityDuration,
  newActivity,
  activityDraftWarnings,
  activityTimingWarnings as clientActivityWarnings,
} from '../apps/web/src/features/events/activity-data.js';
import { eventListFilter } from '../apps/api/src/events/list-filter.js';
import {
  readEventFilters,
  eventFilterUrl,
  emptyEventFilters,
  filtersForCreatedEvent,
} from '../apps/web/src/features/events/filters.js';

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
    {
      activities: [{ name: 'Injected', startAt: input.startAt, role: 'ADMIN' }],
    },
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
    { status: 'UNKNOWN' },
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
    received,
    receivedList;
  const events = {
    list: async (...args) => {
      receivedList = args;
      return {
        events: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
    },
    read: async () => ({ event: { id: eventId, version: 3 }, warnings: [] }),
    listDeleted: async (...args) => {
      received = args;
      return {
        events: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
    },
    readRecovery: async (...args) => {
      received = args;
      return { event: { id: eventId, version: 7 }, warnings: [] };
    },
    changeLifecycle: async (...args) => {
      calls++;
      received = args;
      return { event: { id: eventId, version: 8 }, warnings: [] };
    },
    create: async (...args) => {
      calls++;
      received = args;
      return { event: { id: eventId, version: 0 }, warnings: [] };
    },
    changeActivity: async (...args) => {
      received = args;
      return { event: { id: eventId, version: 5 }, warnings: [] };
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
    for (const [method, suffix, operation] of [
      ['POST', '/activities', 'ADD'],
      ['PATCH', '/activities/' + eventId, 'EDIT'],
      ['DELETE', '/activities/' + eventId, 'REMOVE'],
    ]) {
      const response = await request(base + '/' + eventId + suffix, {
        method,
        headers: { ...headers, 'If-Match': '"4"' },
        body: '{}',
      });
      assert.equal(response.status, method === 'POST' ? 201 : 200);
      assert.equal(response.headers.get('etag'), '"5"');
      assert.equal(received[0], operation);
      assert.equal(received[3], eventId);
      assert.equal(received[6], key);
      assert.equal(received[7], '"4"');
    }
    for (const [method, suffix, operation] of [
      ['DELETE', '', 'DELETE_EVENT'],
      ['POST', '/restore', 'RESTORE_EVENT'],
    ]) {
      const before = calls;
      assert.equal(
        (await request(base + '/' + eventId + suffix, { method, body: '{}' }))
          .status,
        403,
      );
      assert.equal(calls, before);
      const response = await request(base + '/' + eventId + suffix, {
        method,
        headers: { ...headers, 'If-Match': '"7"' },
        body: '{}',
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('etag'), '"8"');
      assert.equal(received[0], operation);
      assert.equal(received[2], weddingId);
      assert.equal(received[3], eventId);
      assert.equal(received[5], key);
      assert.equal(received[6], '"7"');
    }
    assert.equal(
      (await request(base + '/deleted?page=2&limit=10')).status,
      200,
    );
    assert.equal(received[0], 'actor');
    assert.equal(received[1], weddingId);
    assert.deepEqual({ ...received[2] }, { page: '2', limit: '10' });
    assert.equal(
      (await request(base + '/' + eventId + '/recovery')).headers.get('etag'),
      '"7"',
    );
    assert.equal(received[2], eventId);
    const read = await request(base + '/' + eventId);
    assert.equal(read.headers.get('etag'), '"3"');
    assert.equal(read.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await (await request(base)).json()).data.events, []);
    await request(
      base + '?q=A%26B&status=CONFIRMED&from=2028-02-20&to=2028-02-21&page=2',
    );
    assert.equal(receivedList[0], 'actor');
    assert.equal(receivedList[1], weddingId);
    assert.deepEqual(
      { ...receivedList[2] },
      {
        q: 'A&B',
        status: 'CONFIRMED',
        from: '2028-02-20',
        to: '2028-02-21',
        page: '2',
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('event query filters reject injected/unbounded/duplicate-shaped input and invalid calendar ranges before database access', async () => {
  const service = createEventService({
    database: { connect: () => assert.fail('Invalid filters reached MongoDB') },
  });
  const invalid = [
    { q: 'x'.repeat(161) },
    { q: 'Hall\u0000name' },
    { q: { $ne: '' } },
    { q: ['a', 'b'] },
    { status: ['PLANNED', 'CONFIRMED'] },
    { from: '2027-02-29' },
    { from: 'today' },
    { from: '2028-02-21', to: '2028-02-20' },
    { to: '2028-02-20T00:00:00Z' },
    { from: '0000-01-01' },
    { locate: 'another-wedding' },
    { sort: '$where' },
  ];
  for (const query of invalid)
    await assert.rejects(service.list('actor', weddingId, query), {
      code: 'VALIDATION_ERROR',
    });
  assert.equal(
    eventListSchema.parse({
      q: '  Haldi  ',
      status: 'CONFIRMED',
      from: '2028-02-29',
    }).q,
    'Haldi',
  );
});

test('literal search escapes regex syntax and India date bounds include overnight overlap without midnight adjacency', () => {
  const filter = eventListFilter(weddingId, {
    q: 'A.* [Hall] + (B)?',
    from: '2028-01-01',
    to: '2028-01-01',
  });
  const condition = filter.$or[0].name;
  const pattern = new RegExp(condition.$regex, condition.$options);
  assert.equal(pattern.test('a.* [hall] + (b)?'), true);
  assert.equal(pattern.test('Anything Hall B'), false);
  assert.equal(filter.endAt.$gt.toISOString(), '2027-12-31T18:30:00.000Z');
  assert.equal(filter.startAt.$lt.toISOString(), '2028-01-01T18:30:00.000Z');
  assert.equal(filter.weddingId, weddingId);
  assert.equal(filter.deletedAt, null);
});

test('event filter URLs round-trip search/date/status/page while preserving unrelated parameters and fragments', () => {
  const filters = {
    q: 'A & B + Hall',
    status: 'PLANNED',
    from: '2028-02-20',
    to: '2028-02-21',
    page: 2,
  };
  const href = eventFilterUrl(
    'http://localhost:3000/events?other=keep&page=9&q=old#schedule',
    filters,
  );
  const url = new URL(href, 'http://localhost:3000');
  assert.deepEqual(readEventFilters(url.searchParams).filters, filters);
  assert.equal(url.searchParams.get('other'), 'keep');
  assert.equal(url.hash, '#schedule');
  assert.equal(
    readEventFilters(new URLSearchParams('status=PLANNED&status=CONFIRMED'))
      .error.length > 0,
    true,
  );
  assert.equal(
    readEventFilters(new URLSearchParams('from=2028-02-21&to=2028-02-20')).error
      .length > 0,
    true,
  );
  const cleared = new URL(
    eventFilterUrl(url.href, emptyEventFilters),
    url.origin,
  );
  assert.equal(cleared.search, '?other=keep');
  assert.equal(cleared.hash, '#schedule');
});

test('creation clears only incompatible filters and leaves compatible overnight/search/status filters for server-side location', () => {
  const event = {
    name: 'Sangeet',
    status: 'CONFIRMED',
    venue: { name: 'A.* Hall', city: 'Cuttack' },
    startAt: '2028-02-20T23:00:00+05:30',
    endAt: '2028-02-21T02:00:00+05:30',
  };
  const compatible = {
    q: 'a.*',
    status: 'CONFIRMED',
    from: '2028-02-21',
    to: '2028-02-21',
    page: 4,
  };
  assert.deepEqual(filtersForCreatedEvent(compatible, event), {
    ...compatible,
    page: 1,
  });
  assert.deepEqual(
    filtersForCreatedEvent(
      {
        ...compatible,
        q: 'Mehendi',
        status: 'PLANNED',
        from: '2028-02-22',
        to: '',
      },
      event,
    ),
    emptyEventFilters,
  );
  assert.equal(
    filtersForCreatedEvent({ ...emptyEventFilters, to: '2028-02-19' }, event)
      .to,
    '',
  );
  const endsAtMidnight = { ...event, endAt: '2028-02-21T00:00:00+05:30' };
  assert.equal(filtersForCreatedEvent(compatible, endsAtMidnight).from, '');
});

test('event status timing uses IST instants, warns only after overnight ends and preserves past Planned/Confirmed choices', () => {
  const now = new Date('2026-10-24T18:30:00Z'); // 25 October 00:00 IST
  const values = {
    ...initialEvent({ mainDate: '2026-10-25' }),
    name: 'Sangeet',
    startTime: '23:00',
    endTime: '23:30',
  };
  assert.deepEqual(eventStatusTiming(values, now), {
    future: true,
    reviewStatus: false,
  });
  const overnight = {
    ...values,
    startDate: '2026-10-24',
    endDate: '2026-10-25',
    endTime: '02:00',
  };
  assert.deepEqual(eventStatusTiming(overnight, now), {
    future: false,
    reviewStatus: false,
  });
  const ended = new Date('2026-10-24T20:30:00Z'); // 25 October 02:00 IST
  for (const status of ['PLANNED', 'CONFIRMED']) {
    assert.equal(
      eventStatusTiming({ ...overnight, status }, ended).reviewStatus,
      true,
    );
    assert.equal(
      eventFormValidation({ now: () => ended }).safeParse({
        ...overnight,
        status,
      }).success,
      true,
    );
  }
  for (const status of ['COMPLETED', 'CANCELLED'])
    assert.equal(
      eventStatusTiming({ ...overnight, status }, ended).reviewStatus,
      false,
    );
  assert.equal(
    eventStatusTiming({ ...values, startTime: '' }, now).future,
    false,
  );
  assert.equal(
    eventStatusTiming(
      { ...values, startDate: '2026-10-26', startTime: '' },
      now,
    ).future,
    true,
  );
});

test('future completion validation rechecks fresh time, permits started ceremonies and exempts only unchanged attempted retries', () => {
  let clock = new Date('2026-10-24T03:30:00Z'); // 09:00 IST
  const values = {
    ...initialEvent({ mainDate: '2026-10-24' }),
    name: 'Haldi',
    status: 'COMPLETED',
    startTime: '10:00',
    endTime: '11:00',
  };
  const schema = eventFormValidation({ now: () => clock });
  assert.equal(schema.safeParse(values).success, false);
  assert.equal(schema.safeParse(values).error.issues[0].path[0], 'status');
  const body = JSON.stringify(eventInput(values));
  const retry = eventFormValidation({
    now: () => clock,
    canRetry: (parsed) => JSON.stringify(eventInput(parsed)) === body,
  });
  assert.equal(retry.safeParse(values).success, true);
  assert.equal(retry.safeParse({ ...values, name: 'Changed' }).success, false);
  assert.equal(retry.safeParse({ ...values, endTime: '09:00' }).success, false);
  clock = new Date('2026-10-24T04:30:00Z'); // exactly 10:00 IST
  assert.equal(schema.safeParse(values).success, true);
  assert.equal(JSON.stringify(eventInput(values)), body);
});

test('activity contracts bound arrays, reject injected IDs/state and validate optional/partial end times', () => {
  const row = { name: ' Entry ', startAt: '2028-02-20T23:00:00+05:30' };
  assert.deepEqual(createActivitySchema.parse(row), {
    name: 'Entry',
    startAt: '2028-02-20T17:30:00.000Z',
    endAt: null,
    description: '',
  });
  assert.equal(
    createActivitySchema.safeParse({ ...row, endAt: row.startAt }).success,
    false,
  );
  assert.equal(
    createActivitySchema.safeParse({ ...row, duration: 30 }).success,
    false,
  );
  assert.equal(patchActivitySchema.safeParse({ endAt: null }).success, true);
  assert.equal(patchActivitySchema.safeParse({}).success, false);
  assert.equal(
    createEventSchema.safeParse({
      ...input,
      activities: Array.from({ length: activityLimit + 1 }, () => row),
    }).success,
    false,
  );
  assert.equal(
    createEventSchema.safeParse({
      ...input,
      activities: [
        { ...row, id: eventId },
        { ...row, id: eventId },
      ],
    }).success,
    false,
  );
});

test('activity forms round-trip overnight UTC times, derive duration and explicitly clear optional ends', () => {
  const row = {
    ...newActivity({ startDate: '2028-02-20', startTime: '23:00' }),
    name: 'Dinner',
    hasEnd: true,
    endDate: '2028-02-21',
    endTime: '00:30',
  };
  const body = activityInput(row);
  assert.equal(body.startAt, '2028-02-20T17:30:00.000Z');
  assert.equal(body.endAt, '2028-02-20T19:00:00.000Z');
  assert.equal(activityDuration(body), '1 hr 30 min');
  assert.equal(activityInput({ ...row, hasEnd: false }).endAt, null);
  assert.equal(activityDuration({ ...body, endAt: null }), null);
  assert.equal(
    activityFormSchema.safeParse({ ...row, endDate: '', endTime: '' }).success,
    false,
  );
  assert.equal(
    activityFormSchema.safeParse({
      ...row,
      endDate: '2028-02-20',
      endTime: '22:00',
    }).success,
    false,
  );
  const parent = initialEvent(
    {},
    {
      ...createEventSchema.parse(input),
      activities: [{ id: eventId, ...body }],
    },
  );
  assert.equal(parent.activities[0].activityId, eventId);
  assert.equal(parent.activities[0].endDate, '2028-02-21');
  assert.equal(eventInput(parent).activities[0].endAt, body.endAt);
});

test('activity warnings agree between preview/server, respect adjacency and bound incomplete-duration summaries', () => {
  const at = (hour) => `2028-02-20T${hour}:00:00Z`;
  const row = (id, start, end) => ({
    _id: id,
    name: id,
    startAt: at(start),
    endAt: end ? at(end) : null,
  });
  const event = {
    startAt: at('10'),
    endAt: at('15'),
    activities: [row('a', '10', '11'), row('b', '11', '12')],
  };
  assert.deepEqual(serverActivityWarnings(event), []);
  event.activities.push(
    row('c', '10', null),
    row('d', '09', null),
    row('e', '10', '13'),
    row('f', '12', null),
  );
  const warnings = serverActivityWarnings(event);
  assert.deepEqual(clientActivityWarnings(event), warnings);
  assert.ok(
    warnings.some(
      (w) => w.code === 'ACTIVITY_OUTSIDE_EVENT' && w.activityIds.includes('d'),
    ),
  );
  assert.ok(warnings.some((w) => w.code === 'ACTIVITY_OVERLAP'));
  assert.ok(warnings.some((w) => w.code === 'ACTIVITY_SAME_START'));
  assert.ok(warnings.some((w) => w.code === 'ACTIVITY_START_DURING'));
  assert.ok(warnings.length <= 4);
  const dense = {
    ...event,
    activities: Array.from({ length: activityLimit }, (_, i) =>
      row(String(i), '10', '13'),
    ),
  };
  assert.equal(serverActivityWarnings(dense).length, 1);
  assert.equal(serverActivityWarnings(dense)[0].count, 1225);
  assert.deepEqual(
    activityDraftWarnings({ startDate: 'bad', activities: [] }),
    [],
  );
});

test('individual activity editing restores IST values and sends only endpoint fields, including explicit end clearing', () => {
  const saved = {
    id: eventId,
    name: 'Couple entry',
    startAt: '2028-02-20T18:15:00Z',
    endAt: '2028-02-20T19:00:00Z',
    description: 'Family welcome',
  };
  const editing = activityEditValues(saved, {});
  assert.equal(editing.startDate, '2028-02-20');
  assert.equal(editing.startTime, '23:45');
  assert.equal(editing.endDate, '2028-02-21');
  assert.equal(editing.endTime, '00:30');
  const body = activityWriteBody(editing);
  assert.equal(body.id, undefined);
  assert.deepEqual(body, {
    name: saved.name,
    startAt: saved.startAt.replace('Z', '.000Z'),
    endAt: saved.endAt.replace('Z', '.000Z'),
    description: saved.description,
  });
  assert.equal(createActivitySchema.safeParse(body).success, true);
  assert.equal(patchActivitySchema.safeParse(body).success, true);
  assert.equal(activityWriteBody({ ...editing, hasEnd: false }).endAt, null);
  assert.equal(activityEditValues({ ...saved, endAt: null }, {}).hasEnd, false);
  assert.deepEqual(
    activityEditValues(null, { startDate: '2028-02-21', startTime: '01:15' }),
    newActivity({ startDate: '2028-02-21', startTime: '01:15' }),
  );
});

test('event lifecycle input is empty and recovery queries are bounded without accepting caller ownership or mutation fields', async () => {
  assert.deepEqual(eventLifecycleSchema.parse({}), {});
  for (const body of [
    null,
    [],
    { deletedAt: null },
    { weddingId },
    { status: 'COMPLETED' },
  ])
    assert.equal(eventLifecycleSchema.safeParse(body).success, false);
  assert.deepEqual(eventRecoveryListSchema.parse({}), { page: 1, limit: 20 });
  for (const query of [
    { page: 0 },
    { limit: 101 },
    { page: '1.5' },
    { deletedAt: null },
    { q: 'anything' },
    { page: { $gt: 1 } },
  ])
    assert.equal(eventRecoveryListSchema.safeParse(query).success, false);
  const service = createEventService({
    database: {
      connect: () => assert.fail('invalid lifecycle requests must not connect'),
    },
  });
  await assert.rejects(
    service.changeLifecycle(
      'DELETE_EVENT',
      'user',
      weddingId,
      eventId,
      { deletedAt: null },
      crypto.randomUUID(),
      '"0"',
    ),
    { code: 'VALIDATION_ERROR' },
  );
  await assert.rejects(
    service.changeLifecycle(
      'RESTORE_EVENT',
      'user',
      weddingId,
      eventId,
      {},
      'bad-key',
      '"0"',
    ),
    { code: 'IDEMPOTENCY_KEY_REQUIRED' },
  );
  await assert.rejects(
    service.changeLifecycle(
      'DELETE_EVENT',
      'user',
      weddingId,
      eventId,
      {},
      crypto.randomUUID(),
      '*',
    ),
    { code: 'VERSION_REQUIRED' },
  );
});
