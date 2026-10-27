import assert from 'node:assert/strict';
import { taskRecoveryScope } from '../apps/api/src/tasks/lifecycle-service.js';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';
import {
  createTaskSchema,
  patchTaskSchema,
  taskFieldsSchema,
  taskListSchema,
  taskVersion,
  taskWarnings,
} from '../apps/api/src/tasks/validation.js';
import { createTaskService } from '../apps/api/src/tasks/service.js';
import {
  initialTask,
  taskInput,
  taskFormSchema,
  draftTaskWarnings,
  isOverdue,
  dueLabel,
} from '../apps/web/src/features/tasks/form-data.js';
const weddingId = '123456789012345678901234',
  taskId = 'abcdef123456789012345678';
test('task contracts accept optional fields and historical deadlines; reject injected scope, invalid assignees, lifecycle and recurrence', () => {
  assert.deepEqual(createTaskSchema.parse({ title: ' Family preparation ' }), {
    title: 'Family preparation',
    description: '',
    assigneeIds: [],
    status: 'TODO',
    priority: 'MEDIUM',
    dueAt: null,
    dueDateOnly: false,
    eventId: null,
  });
  for (const extra of [
    { title: '' },
    { title: 'a'.repeat(161) },
    { priority: 'CRITICAL' },
    { status: 'DELETED' },
    { weddingId },
    { createdBy: taskId },
    { assigneeIds: [{ $ne: null }] },
    { source: { type: 'CHECKLIST' } },
    { seriesId: taskId },
    { deletedAt: new Date().toISOString() },
    { eventId: { $ne: null } },
    { dueAt: 'not-a-date' },
    { dueAt: '2027-02-29T12:00:00Z' },
    { dueDateOnly: true },
  ])
    assert.equal(
      createTaskSchema.safeParse({ title: 'Task', ...extra }).success,
      false,
    );
  assert.equal(
    createTaskSchema.safeParse({
      title: 'Historical',
      dueAt: '2000-01-01T00:00:00Z',
    }).success,
    true,
  );
  assert.equal(patchTaskSchema.safeParse({}).success, false);
  assert.equal(
    patchTaskSchema.safeParse({ completedBy: taskId }).success,
    false,
  );
});
test('date-only deadlines use India day end and preserve the empty optional time across edits; exact midnight is a timed deadline', () => {
  const values = {
    ...initialTask(),
    title: 'Photo list',
    dueDate: '2026-10-25',
  };
  const input = taskInput(values);
  assert.equal(input.dueAt, '2026-10-25T18:29:59.999Z');
  assert.equal(input.dueDateOnly, true);
  assert.deepEqual(initialTask(input), values);
  assert.equal(createTaskSchema.safeParse(input).success, true);
  const timed = taskInput({ ...values, dueTime: '00:00' });
  assert.equal(timed.dueAt, '2026-10-24T18:30:00.000Z');
  assert.equal(timed.dueDateOnly, false);
  assert.equal(initialTask(timed).dueTime, '00:00');
  assert.equal(taskInput({ ...values, dueDate: '' }).dueAt, null);
  assert.equal(
    taskFormSchema.safeParse({ ...values, dueDate: '', dueTime: '10:00' })
      .success,
    false,
  );
  assert.equal(
    taskFormSchema.safeParse({ ...values, dueDate: '2027-02-29' }).success,
    false,
  );
  assert.equal(
    createTaskSchema.safeParse({ ...input, dueAt: timed.dueAt }).success,
    false,
  );
  assert.equal(
    taskFieldsSchema.safeParse({ ...input, dueAt: null }).success,
    false,
  );
  assert.equal(dueLabel({ dueAt: null }), 'No deadline');
});
test('overdue boundaries and prominent non-blocking warnings agree on web/API; completed tasks are not overdue', () => {
  const wedding = { mainDate: '2026-10-20' };
  const values = {
    ...initialTask(),
    title: 'Existing overdue work',
    dueDate: '2026-10-25',
  };
  const input = taskInput(values),
    instant = new Date('2026-10-25T18:30:00.000Z');
  assert.deepEqual(
    draftTaskWarnings(values, wedding, instant),
    taskWarnings(input, wedding, instant),
  );
  assert.deepEqual(
    taskWarnings(input, wedding, instant).map((w) => w.code),
    ['PAST_DUE_DATE', 'AFTER_WEDDING_DATE'],
  );
  assert.equal(isOverdue(input, Date.parse(input.dueAt)), false);
  assert.equal(isOverdue(input, instant), true);
  assert.equal(isOverdue({ ...input, status: 'COMPLETED' }, instant), false);
  const completed = { ...input, status: 'COMPLETED' };
  const completedGuidance = taskWarnings(completed, wedding, instant);
  assert.deepEqual(
    completedGuidance.map((warning) => warning.code),
    ['AFTER_WEDDING_DATE'],
  );
  assert.equal(completedGuidance[0].severity, 'info');
  assert.match(completedGuidance[0].message, /No action is needed/);
  assert.deepEqual(
    draftTaskWarnings({ ...values, status: 'COMPLETED' }, wedding, instant),
    completedGuidance,
  );
  assert.deepEqual(
    taskWarnings(completed, { mainDate: '2026-10-30' }, instant),
    [],
  );
  assert.deepEqual(
    draftTaskWarnings(
      { ...values, status: 'COMPLETED' },
      { mainDate: '2026-10-30' },
      instant,
    ),
    [],
  );
  assert.ok(
    taskWarnings(input, wedding, instant).every(
      (warning) => warning.severity !== 'info',
    ),
  );
  assert.deepEqual(
    taskWarnings({ ...input, dueAt: null }, wedding, instant),
    [],
  );
  assert.equal(createTaskSchema.safeParse(input).success, true);
  assert.deepEqual(
    draftTaskWarnings({ ...values, title: '' }, wedding, instant),
    taskWarnings(input, wedding, instant),
  );
});
test('strict pagination, versions and invalid writes fail before database access', async () => {
  assert.deepEqual(taskListSchema.parse({}), { page: 1, limit: 20 });
  for (const query of [
    { limit: 101 },
    { page: 0 },
    { status: 'DELETED' },
    { page: { $ne: null } },
  ])
    assert.equal(taskListSchema.safeParse(query).success, false);
  assert.equal(taskVersion('"0"'), 0);
  for (const value of ['0', '*', 'W/"1"', undefined, '"-1"'])
    assert.equal(taskVersion(value), null);
  const service = createTaskService({
    database: { connect: () => assert.fail('Invalid input reached database') },
  });
  await assert.rejects(
    service.create(
      'user',
      weddingId,
      { title: 'Task', assigneeIds: ['bad-id'] },
      randomUUID(),
    ),
    { code: 'VALIDATION_ERROR' },
  );
  await assert.rejects(
    service.create('user', weddingId, { title: 'Task' }, 'bad'),
    { code: 'IDEMPOTENCY_KEY_REQUIRED' },
  );
  await assert.rejects(
    service.update(
      'user',
      weddingId,
      taskId,
      { title: 'Changed' },
      randomUUID(),
    ),
    { code: 'VERSION_REQUIRED' },
  );
});
test('task HTTP routes enforce verified session, Origin, JSON and CSRF, forwarding retry/version and bounded page reads', async () => {
  const settings = {
    ...config,
    jwtSecret: 'native-task-test-secret-'.repeat(3),
    cookieSecure: false,
    cookieSameSite: 'lax',
  };
  let received,
    writes = 0;
  const tasks = {
    list: async (...args) => {
      received = args;
      return { tasks: [], meta: { page: 1, total: 0 } };
    },
    my: async (...args) => {
      received = args;
      return { tasks: [], meta: { page: 1, total: 0 } };
    },
    assignees: async (...args) => {
      received = args;
      return {
        members: [{ id: taskId, name: 'Family', role: 'FAMILY_MEMBER' }],
        meta: { page: 1, total: 1 },
      };
    },
    listDeleted: async (...args) => {
      received = args;
      return { tasks: [], meta: { page: 1, total: 0 } };
    },
    readDeleted: async (...args) => {
      received = args;
      return {
        task: { id: taskId, version: 3, deletedAt: '2027-01-01T00:00:00Z' },
      };
    },
    remove: async (...args) => {
      writes++;
      received = args;
      return {
        task: { id: taskId, version: 4, deletedAt: '2027-01-01T00:00:00Z' },
        warnings: [],
      };
    },
    restore: async (...args) => {
      writes++;
      received = args;
      return {
        task: { id: taskId, version: 5, deletedAt: null },
        warnings: [],
      };
    },
    read: async () => ({ task: { id: taskId, version: 3 }, warnings: [] }),
    readSeries: async (...args) => {
      received = args;
      return { series: { id: taskId, version: 3 } };
    },
    updateSeries: async (...args) => {
      writes++;
      received = args;
      return { series: { id: taskId, version: 4 } };
    },
    create: async (...args) => {
      writes++;
      received = args;
      return { task: { id: taskId, version: 0 }, warnings: [] };
    },
    update: async (...args) => {
      writes++;
      received = args;
      return { task: { id: taskId, version: 4 }, warnings: [] };
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
    const server = createApp({ service, tasks, settings }).listen(
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
          Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
          'Content-Type': 'application/json',
          ...options.headers,
        },
      },
    );
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0],
        at = pair.indexOf('=');
      jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return response;
  }
  try {
    const base = `/weddings/${weddingId}/tasks`;
    assert.equal(
      (await request(base, { headers: { Cookie: '' } })).status,
      401,
    );
    assert.equal(
      (
        await request(base, {
          method: 'POST',
          body: '{}',
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
      (await request(base, { method: 'POST', body: '{}' })).status,
      403,
    );
    assert.equal(writes, 0);
    const token = (await (await request('/auth/csrf')).json()).data.csrfToken;
    const key = randomUUID(),
      headers = { 'X-CSRF-Token': token, 'Idempotency-Key': key };
    const created = await request(base, {
      method: 'POST',
      headers,
      body: '{"title":"Task"}',
    });
    assert.equal(created.status, 201);
    assert.equal(created.headers.get('etag'), '"0"');
    assert.equal(received[3], key);
    const updated = await request(`${base}/${taskId}`, {
      method: 'PATCH',
      headers: { ...headers, 'If-Match': '"3"' },
      body: '{"status":"COMPLETED"}',
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.headers.get('etag'), '"4"');
    assert.equal(received[5], '"3"');
    const list = await request(`${base}?page=2&limit=10`);
    assert.equal(list.status, 200);
    assert.equal(received[2].page, '2');
    const my = await request(`${base}/my?page=2&limit=10`);
    assert.equal(my.status, 200);
    assert.equal(received[0], 'actor');
    assert.equal(received[1], weddingId);
    assert.equal(received[2].page, '2');
    const candidates = await request(`${base}/assignees?page=1&limit=50`);
    assert.equal(candidates.status, 200);
    assert.equal((await candidates.json()).data.members[0].name, 'Family');
    assert.equal(
      (await request(`${base}/my`, { headers: { Cookie: '' } })).status,
      401,
    );
    const seriesRead = await request(`${base}/${taskId}/series`);
    assert.equal(seriesRead.status, 200);
    assert.equal(seriesRead.headers.get('etag'), '"3"');
    assert.equal(
      (
        await request(`${base}/${taskId}/series`, {
          method: 'PATCH',
          body: '{}',
        })
      ).status,
      403,
    );
    const seriesWrite = await request(`${base}/${taskId}/series`, {
      method: 'PATCH',
      headers: { ...headers, 'If-Match': '"3"' },
      body: '{}',
    });
    assert.equal(seriesWrite.status, 200);
    assert.equal(seriesWrite.headers.get('etag'), '"4"');
    assert.equal(received[5], '"3"');
    const read = await request(`${base}/${taskId}`);
    assert.equal(read.headers.get('etag'), '"3"');
    for (const [method, suffix] of [
      ['DELETE', ''],
      ['POST', '/restore'],
    ]) {
      assert.equal(
        (await request(`${base}/${taskId}${suffix}`, { method, body: '{}' }))
          .status,
        403,
      );
      assert.equal(
        (
          await request(`${base}/${taskId}${suffix}`, {
            method,
            body: '{}',
            headers: { ...headers, Origin: 'https://other.example' },
          })
        ).status,
        403,
      );
      const response = await request(`${base}/${taskId}${suffix}`, {
        method,
        body: '{}',
        headers: { ...headers, 'If-Match': '"3"' },
      });
      assert.equal(response.status, 200);
      assert.equal(received[2], taskId);
      assert.equal(received[4], key);
      assert.equal(received[5], '"3"');
      assert.ok(response.headers.get('etag'));
    }
    assert.equal((await request(`${base}/deleted?page=2`)).status, 200);
    assert.equal(received[2].page, '2');
    const recovery = await request(`${base}/${taskId}/recovery`);
    assert.equal(recovery.status, 200);
    assert.equal(recovery.headers.get('etag'), '"3"');
    assert.equal(received[2], taskId);
    assert.equal(
      (await request(`${base}/deleted`, { headers: { Cookie: '' } })).status,
      401,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('assignment contracts deduplicate and canonicalize IDs, enforce bounds, and round-trip empty/multiple selections', () => {
  const ids = ['aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb'];
  const input = createTaskSchema.parse({
    title: 'Share this task',
    assigneeIds: [ids[1], ids[0], ids[1]],
  });
  assert.deepEqual(input.assigneeIds, ids);
  assert.deepEqual(patchTaskSchema.parse({ assigneeIds: [] }), {
    assigneeIds: [],
  });
  for (const assigneeIds of [
    null,
    'all',
    [{ $ne: null }],
    Array.from({ length: 51 }, (_, i) => i.toString(16).padStart(24, '0')),
  ])
    assert.equal(
      createTaskSchema.safeParse({ title: 'Task', assigneeIds }).success,
      false,
    );
  const fields = initialTask({ assigneeIds: ids });
  assert.deepEqual(
    taskInput({ ...fields, title: 'Round trip' }).assigneeIds,
    ids,
  );
  assert.deepEqual(
    taskInput({ ...fields, title: 'Unassign', assigneeIds: [] }).assigneeIds,
    [],
  );
});

test('task filters validate literal text, explicit IDs, real India dates and strict bounded parameters', async () => {
  const { taskPageSchema } =
    await import('../apps/api/src/tasks/validation.js');
  const { taskQueryFilter } = await import('../apps/api/src/tasks/query.js');
  const input = taskListSchema.parse({
    q: '  [ritual].*  ',
    status: 'TODO',
    priority: 'HIGH',
    assigneeId: 'unassigned',
    eventId: 'none',
    from: '2027-01-02',
    to: '2027-01-02',
    overdue: 'true',
  });
  assert.equal(input.q, '[ritual].*');
  const query = taskQueryFilter(
    input,
    weddingId,
    taskId,
    true,
    new Date('2027-01-02T12:00:00Z'),
  );
  const terms = query.$and;
  assert.equal(String(terms[0].weddingId), weddingId);
  assert.equal(String(terms[1].assigneeIds), taskId);
  assert.deepEqual(
    terms.find((x) => x.assigneeIds?.$size !== undefined),
    { assigneeIds: { $size: 0 } },
  );
  const text = terms.find((x) => x.$or)?.$or[0].title;
  assert.equal(new RegExp(text.$regex, text.$options).test('[RITUAL].*'), true);
  assert.equal(
    new RegExp(text.$regex, text.$options).test('ritual ANYTHING'),
    false,
  );
  const range = terms.find((x) => x.dueAt?.$gte)?.dueAt;
  assert.equal(range.$gte.toISOString(), '2027-01-01T18:30:00.000Z');
  assert.equal(range.$lt.toISOString(), '2027-01-02T18:30:00.000Z');
  for (const raw of [
    { q: 'x'.repeat(161) },
    { q: 'a\nb' },
    { q: { $ne: null } },
    { status: ['TODO'] },
    { priority: 'critical' },
    { assigneeId: { $ne: null } },
    { eventId: 'bad' },
    { overdue: true },
    { from: '2027-02-29' },
    { from: '2027-01-03', to: '2027-01-02' },
    { from: '0999-01-01' },
    { sort: '$where' },
    { limit: 101 },
    { page: [] },
    { userId: taskId },
  ])
    assert.equal(
      taskListSchema.safeParse(raw).success,
      false,
      JSON.stringify(raw),
    );
  assert.equal(taskPageSchema.safeParse({ status: 'TODO' }).success, false);
  assert.equal(
    taskListSchema.safeParse({ from: '2028-02-29', to: '9999-12-31' }).success,
    true,
  );
});
test('task filter links round-trip view, page and applied filters; reject invalid links without silently dropping them', async () => {
  const {
    emptyTaskFilters,
    taskFilterSchema,
    taskFilterParams,
    readTaskFilters,
    taskFilterUrl,
    hasTaskFilters,
  } = await import('../apps/web/src/features/tasks/filters.js');
  const filters = {
    ...emptyTaskFilters,
    view: 'my',
    q: 'Ritual & flowers',
    status: 'TODO',
    priority: 'HIGH',
    assigneeId: taskId,
    eventId: 'none',
    from: '2027-01-02',
    to: '2027-01-04',
    overdue: 'true',
    page: 3,
  };
  const params = taskFilterParams(filters);
  assert.deepEqual(readTaskFilters(params).filters, filters);
  assert.equal(readTaskFilters(params).error, '');
  assert.equal(taskFilterParams(filters, true).has('view'), false);
  assert.equal(hasTaskFilters(filters), true);
  assert.equal(
    hasTaskFilters({ ...emptyTaskFilters, view: 'my', page: 2 }),
    false,
  );
  assert.equal(taskFilterUrl(emptyTaskFilters), '/tasks');
  for (const link of [
    'q=a&q=b',
    'q[regex]=.*',
    'page=0',
    'from=2027-01-04&to=2027-01-02',
    'view=other',
    'from=2027-02-29',
  ])
    assert.ok(readTaskFilters(new URLSearchParams(link)).error, link);
  assert.equal(
    taskFilterSchema.safeParse({ ...filters, assigneeId: 'unassigned' })
      .success,
    true,
  );
});

test('task recovery scopes permit Admin access and restrict Family Members to the original creator', () => {
  assert.deepEqual(taskRecoveryScope('ADMIN', 'admin'), {});
  assert.deepEqual(taskRecoveryScope('FAMILY_MEMBER', 'family'), {
    createdBy: 'family',
  });
  for (const role of ['VIEWER', 'MANAGER', null])
    assert.throws(() => taskRecoveryScope(role, 'user'), { code: 'FORBIDDEN' });
});

test('task shortcuts separate UI intents from API filters and preserve ceremony return context', async () => {
  const {
    ceremonyTasksUrl,
    ceremonyReturnUrl,
    consumeTaskIntent,
    readTaskNavigation,
  } = await import('../apps/web/src/features/tasks/navigation.js');
  const { readTaskFilters, taskFilterParams, taskFilterUrl } =
    await import('../apps/web/src/features/tasks/filters.js');
  const url = ceremonyTasksUrl(weddingId, { create: true });
  const params = new URL(url, 'http://localhost:3000').searchParams;
  const parsed = readTaskFilters(params);
  assert.equal(parsed.error, '');
  assert.equal(parsed.filters.eventId, weddingId);
  assert.deepEqual(readTaskNavigation(params), {
    create: true,
    taskId: null,
    fromEvent: weddingId,
    error: '',
  });
  const api = taskFilterParams(parsed.filters, true);
  assert.equal(api.get('eventId'), weddingId);
  for (const name of ['create', 'task', 'fromEvent'])
    assert.equal(api.has(name), false);
  const consumed = consumeTaskIntent('http://localhost:3000' + url);
  assert.equal(
    new URL(consumed, 'http://localhost:3000').searchParams.has('create'),
    false,
  );
  assert.equal(
    readTaskFilters(new URLSearchParams(consumed.split('?')[1])).key,
    parsed.key,
  );
  assert.equal(ceremonyReturnUrl(weddingId), '/events?event=' + weddingId);
  const changed = taskFilterUrl(
    { ...parsed.filters, q: 'Flowers', page: 2 },
    weddingId,
  );
  assert.equal(
    new URL(changed, 'http://localhost:3000').searchParams.get('fromEvent'),
    weddingId,
  );
  const detail = new URL(
    ceremonyTasksUrl(weddingId, { taskId }),
    'http://localhost:3000',
  );
  assert.equal(readTaskNavigation(detail.searchParams).taskId, taskId);
  assert.equal(readTaskFilters(new URLSearchParams('create=1')).error, '');
});

test('task shortcuts reject duplicate, malformed, conflicting and arbitrary redirect parameters', async () => {
  const { readTaskFilters } =
    await import('../apps/web/src/features/tasks/filters.js');
  const { ceremonyTasksUrl, ceremonyReturnUrl } =
    await import('../apps/web/src/features/tasks/navigation.js');
  for (const query of [
    'create=0',
    'create=1&create=1',
    'task=wrong',
    'fromEvent=https://example.com',
    `create=1&task=${taskId}`,
    `fromEvent=${weddingId}&fromEvent=${weddingId}`,
    'returnTo=https://example.com',
  ]) {
    assert.ok(readTaskFilters(new URLSearchParams(query)).error, query);
  }
  assert.throws(() => ceremonyTasksUrl('https://example.com'));
  assert.throws(() => ceremonyTasksUrl(weddingId, { taskId: '../other' }));
  assert.throws(() => ceremonyReturnUrl('//example.com'));
});

test('ceremony shortcut preselection round-trips into a new task without overriding an existing task link', () => {
  const ceremony = { id: weddingId, name: 'Haldi' };
  const draft = { ...initialTask(null, ceremony), title: 'Confirm flowers' };
  assert.equal(draft.eventId, weddingId);
  assert.equal(taskInput(draft).eventId, weddingId);
  assert.equal(
    initialTask({ title: 'Existing wedding-wide', eventId: null }, ceremony)
      .eventId,
    '',
  );
  assert.equal(initialTask().eventId, '');
});

test('page correction preserves pending create/detail shortcuts until a slower lookup opens the drawer', async () => {
  const { taskPageCorrectionUrl, readTaskNavigation, consumeTaskIntent } =
    await import('../apps/web/src/features/tasks/navigation.js');
  for (const intent of ['create=1', `task=${taskId}`]) {
    let href = `http://localhost:3000/tasks?eventId=${weddingId}&fromEvent=${weddingId}&${intent}&page=99&q=flowers#main-content`;
    let resolveLookup;
    const lookup = new Promise((resolve) => {
      resolveLookup = resolve;
    });
    let drawerOpened = false;
    const loaded = lookup.then(() => {
      const navigation = readTaskNavigation(new URL(href).searchParams);
      drawerOpened = navigation.create || navigation.taskId === taskId;
      if (drawerOpened) href = new URL(consumeTaskIntent(href), href).href;
    });
    href = new URL(taskPageCorrectionUrl(href, 1), href).href;
    const corrected = new URL(href);
    assert.equal(corrected.searchParams.has('page'), false);
    assert.equal(corrected.searchParams.get('q'), 'flowers');
    assert.equal(corrected.searchParams.get('fromEvent'), weddingId);
    assert.equal(corrected.hash, '#main-content');
    resolveLookup();
    await loaded;
    assert.equal(drawerOpened, true);
    assert.equal(new URL(href).searchParams.has('create'), false);
    assert.equal(new URL(href).searchParams.has('task'), false);
  }
});

test('late pagination correction does not revive an already consumed or dismissed shortcut', async () => {
  const { taskPageCorrectionUrl, consumeTaskIntent } =
    await import('../apps/web/src/features/tasks/navigation.js');
  for (const intent of ['create=1', `task=${taskId}`]) {
    const original = `http://localhost:3000/tasks?eventId=${weddingId}&fromEvent=${weddingId}&${intent}&page=99`;
    const consumed = new URL(consumeTaskIntent(original), original);
    const corrected = new URL(
      taskPageCorrectionUrl(consumed.href, 2),
      consumed,
    );
    assert.equal(corrected.searchParams.get('page'), '2');
    assert.equal(corrected.searchParams.get('eventId'), weddingId);
    assert.equal(corrected.searchParams.get('fromEvent'), weddingId);
    assert.equal(corrected.searchParams.has('create'), false);
    assert.equal(corrected.searchParams.has('task'), false);
  }
});
