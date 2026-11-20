import assert from 'node:assert/strict';
import test from 'node:test';
import { readChecklistCatalog } from '../apps/api/src/checklist/catalog.js';
import { createApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';
import { checklistHistoryQuery } from '../apps/api/src/checklist/history-service.js';
import {
  checklistPlan,
  checklistSelectionSchema,
  checklistGenerateSchema,
} from '../apps/api/src/checklist/generation.js';

test('versioned checklist content has stable unique identities, accurate counts and valid preview timing', () => {
  const { templates, plannedTemplates } = readChecklistCatalog();
  assert.deepEqual(
    templates.map((row) => row.id),
    [
      'initial-planning',
      'venue-logistics',
      'photography-video',
      'attire-jewellery',
    ],
  );
  for (const template of templates) {
    assert.match(template.id, /^[a-z][a-z-]+$/);
    assert.match(template.version, /^[1-9]\d*$/);
    assert.equal(template.itemCount, template.items.length);
    assert.ok(template.itemCount > 0 && template.itemCount <= 100);
    assert.equal(
      new Set(template.items.map((row) => row.key)).size,
      template.itemCount,
    );
    for (const row of template.items) {
      assert.match(row.key, /^[a-z][a-z-]+$/);
      assert.ok(row.title.length > 0 && row.title.length <= 160);
      assert.ok(row.description.length > 0 && row.description.length <= 2000);
      assert.ok(['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(row.priority));
      assert.ok(
        Number.isInteger(row.daysBeforeWedding) &&
          row.daysBeforeWedding >= 0 &&
          row.daysBeforeWedding <= 365,
      );
      assert.equal(
        'dueAt' in row,
        false,
        'A generic preview must not assert a saved wedding deadline',
      );
      assert.equal('assigneeIds' in row, false);
    }
  }
  assert.equal(plannedTemplates.length, 1);
  assert.equal(plannedTemplates[0].id, 'odia-rituals');
  assert.equal('items' in plannedTemplates[0], false);
  assert.equal(
    'itemCount' in plannedTemplates[0],
    false,
    'No fabricated count for a planned pack',
  );
});

test('catalog callers cannot mutate later reads or source item identities', () => {
  const first = readChecklistCatalog();
  const original = structuredClone(first);
  first.templates[0].items[0].title = 'Changed by a caller';
  first.templates[0].items.splice(1);
  first.plannedTemplates[0].name = 'Changed planned pack';
  assert.deepEqual(readChecklistCatalog(), original);
});

test('generation contracts accept only a current selection and preview fingerprint, never injected task/actor/date fields', () => {
  const input = {
    templateId: 'initial-planning',
    templateVersion: '1',
    previewHash: 'a'.repeat(64),
  };
  assert.equal(checklistGenerateSchema.safeParse(input).success, true);
  assert.equal(
    checklistSelectionSchema.safeParse({
      templateId: input.templateId,
      templateVersion: '1',
    }).success,
    true,
  );
  for (const patch of [
    { templateId: { $ne: null } },
    { templateVersion: 1 },
    { previewHash: '' },
    { items: [] },
    { weddingId: 'other' },
    { createdBy: 'other' },
    { dueAt: '2027-01-01T00:00:00Z' },
    { force: true },
  ])
    assert.equal(
      checklistGenerateSchema.safeParse({ ...input, ...patch }).success,
      false,
    );
});

test('generation preview uses exact IST day ends, preserves edited tasks and conceals deleted record details', () => {
  const template = {
    id: 'fixture',
    version: '1',
    name: 'Fixture',
    items: ['new', 'kept', 'removed'].map((key) => ({
      key,
      title: 'Catalog ' + key,
      description: 'Catalog notes',
      priority: 'MEDIUM',
      daysBeforeWedding: 1,
    })),
  };
  const wedding = { mainDate: '2028-03-01', taskRevision: 3 };
  const existing = [
    {
      _id: 'not-exposed',
      source: { itemKey: 'kept' },
      title: 'Edited and completed',
      description: 'Family notes',
      priority: 'HIGH',
      dueAt: null,
      status: 'COMPLETED',
    },
    {
      _id: 'deleted-id',
      source: { itemKey: 'removed' },
      title: 'Private removed title',
      description: 'Private removed notes',
      deletedAt: new Date('2028-01-01'),
      dueAt: new Date('2020-01-01'),
    },
  ];
  const result = checklistPlan(
    template,
    wedding,
    existing,
    new Date('2028-03-01T18:30:00Z'),
  );
  assert.deepEqual(result.counts, {
    toAdd: 1,
    kept: 1,
    deleted: 1,
    pastDue: 1,
  });
  assert.equal(result.items[0].dueAt, '2028-02-29T18:29:59.999Z');
  assert.equal(result.items[1].title, 'Edited and completed');
  assert.equal(result.items[1].dueAt, null);
  assert.equal(result.items[2].title, 'Catalog removed');
  assert.equal(result.items[2].dueAt, null);
  assert.equal(JSON.stringify(result).includes('Private removed'), false);
  assert.equal(JSON.stringify(result).includes('deleted-id'), false);
  assert.notEqual(
    checklistPlan(
      template,
      { ...wedding, taskRevision: 4 },
      existing,
      new Date('2028-03-01T18:30:00Z'),
    ).previewHash,
    result.previewHash,
  );
  assert.notEqual(
    checklistPlan(template, wedding, existing, new Date('2028-03-02T18:30:00Z'))
      .previewHash,
    result.previewHash,
  );
});

test('generation HTTP writes require session, trusted Origin, JSON and CSRF; authenticated actor/key reach the service', async () => {
  const settings = {
    ...config,
    jwtSecret: 'generation-test-only-signing-key-that-is-long-enough',
    cookieSecure: false,
  };
  let writes = 0,
    received;
  const service = {
    session: async ({ accessToken }) => {
      if (accessToken !== 'fixture-access')
        throw new ApiError(401, 'SESSION_EXPIRED', 'Sign in.');
      return { user: { id: 'actor' } };
    },
  };
  const tasks = {
    checklistGenerations: async (...args) => {
      received = args;
      return { generations: [], pagination: { page: 1, total: 0 } };
    },
    checklistGeneration: async (...args) => {
      received = args;
      return { generation: { id: args[2] } };
    },
    previewChecklist: async (...args) => {
      received = args;
      return { counts: { toAdd: 6, kept: 0, deleted: 0 } };
    },
    generateChecklist: async (...args) => {
      received = args;
      writes++;
      return { generation: { added: 6 }, replayed: false };
    },
  };
  const server = await new Promise((resolve) => {
    const listener = createApp({ service, tasks, settings }).listen(
      0,
      '127.0.0.1',
      () => resolve(listener),
    );
  });
  const jar = new Map([['mmm_access', 'fixture-access']]);
  async function request(path, options = {}) {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/v1` + path,
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
    const base = '/weddings/123456789012345678901234/checklists';
    assert.equal(
      (await request(base + '/preview', { headers: { Cookie: '' } })).status,
      401,
    );
    assert.equal(
      (
        await request(base + '/generate', {
          method: 'POST',
          body: '{}',
          headers: { Origin: 'https://other.example' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(base + '/generate', {
          method: 'POST',
          body: 'text',
          headers: { 'Content-Type': 'text/plain' },
        })
      ).status,
      415,
    );
    assert.equal(
      (await request(base + '/generate', { method: 'POST', body: '{}' }))
        .status,
      403,
    );
    assert.equal(writes, 0);
    assert.equal(
      (
        await request(
          base + '/preview?templateId=initial-planning&templateVersion=1',
        )
      ).status,
      200,
    );
    assert.equal(received[0], 'actor');
    assert.equal(received[1], '123456789012345678901234');
    const csrf = (await (await request('/auth/csrf')).json()).data.csrfToken;
    const key = '11111111-1111-4111-8111-111111111111';
    assert.equal(
      (
        await request(base + '/generate', {
          method: 'POST',
          headers: { 'X-CSRF-Token': csrf, 'Idempotency-Key': key },
          body:
            '{"templateId":"initial-planning","templateVersion":"1","previewHash":"' +
            'a'.repeat(64) +
            '"}',
        })
      ).status,
      201,
    );
    assert.equal(writes, 1);
    assert.equal(received[3], key);
    assert.equal(
      (await request(base + '/generations?page=2&limit=5')).status,
      200,
    );
    assert.deepEqual(
      [...received.slice(0, 2), { ...received[2] }],
      ['actor', '123456789012345678901234', { page: '2', limit: '5' }],
    );
    const id = '123456789012345678901235';
    const details = await request(base + '/generations/' + id);
    assert.equal(details.status, 200);
    assert.equal(details.headers.get('cache-control'), 'no-store');
    assert.deepEqual(
      [...received.slice(0, 3), { ...received[3] }],
      ['actor', '123456789012345678901234', id, {}],
    );
    assert.equal(
      (await request(base + '/generations', { headers: { Cookie: '' } }))
        .status,
      401,
    );
    assert.equal(
      (
        await request(base + '/generations/' + id, {
          headers: { Origin: 'https://other.example' },
        })
      ).status,
      403,
    );
    for (const method of ['POST', 'PATCH', 'DELETE'])
      assert.equal(
        (await request(base + '/generations/' + id, { method, body: '{}' }))
          .status,
        404,
      );
    assert.equal(writes, 1, 'History routes never invoke task generation');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('history pagination rejects arrays, injections, unsupported filters and unbounded pages', () => {
  assert.deepEqual(checklistHistoryQuery.parse({}), { page: 1, limit: 20 });
  assert.deepEqual(checklistHistoryQuery.parse({ page: '2', limit: '100' }), {
    page: 2,
    limit: 100,
  });
  for (const raw of [
    { page: ['1'] },
    { limit: { $gt: 0 } },
    { page: '1.5' },
    { page: '1e2' },
    { page: ' 2 ' },
    { page: '0' },
    { page: -1 },
    { page: 100001 },
    { limit: 101 },
    { templateId: 'private' },
    { weddingId: 'other' },
    { includeDeleted: 'true' },
  ])
    assert.equal(checklistHistoryQuery.safeParse(raw).success, false);
});

test('global catalog reads require a session, support every member role and expose no wedding data or catalog writes', async () => {
  const settings = {
    ...config,
    jwtSecret: 'catalog-test-only-signing-key-that-is-long-enough',
    cookieSecure: false,
  };
  let reads = 0;
  const service = {
    async session({ accessToken }) {
      if (!['ADMIN', 'FAMILY_MEMBER', 'VIEWER'].includes(accessToken))
        throw new ApiError(401, 'SESSION_EXPIRED', 'Sign in to continue.');
      reads++;
      return {
        user: { id: 'private-account' },
        wedding: { id: 'private-wedding', role: accessToken },
      };
    },
  };
  const app = createApp({ service, settings });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1/checklist-templates`;
  const request = (path = '', options = {}) => fetch(base + path, options);
  try {
    assert.equal((await request()).status, 401);
    for (const role of ['ADMIN', 'FAMILY_MEMBER', 'VIEWER']) {
      const response = await request('', {
        headers: { Cookie: `mmm_access=${role}`, Origin: settings.webOrigin },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.ok(response.headers.get('x-request-id'));
      const body = await response.json();
      assert.deepEqual(body.data, readChecklistCatalog());
      assert.equal(JSON.stringify(body).includes('private-account'), false);
      assert.equal(JSON.stringify(body).includes('private-wedding'), false);
    }
    assert.equal(
      (
        await request('?templateId=other', {
          headers: { Cookie: 'mmm_access=ADMIN' },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request('', {
          headers: {
            Cookie: 'mmm_access=ADMIN',
            Origin: 'https://other.example',
          },
        })
      ).status,
      403,
    );
    const before = reads;
    assert.equal(
      (
        await request('', {
          method: 'POST',
          headers: {
            Cookie: 'mmm_access=ADMIN',
            'Content-Type': 'application/json',
          },
          body: '{}',
        })
      ).status,
      404,
    );
    assert.equal(
      reads,
      before,
      'The global catalog endpoint remains read-only',
    );
    assert.equal(
      (
        await request('/not-a-template', {
          headers: { Cookie: 'mmm_access=ADMIN' },
        })
      ).status,
      404,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
