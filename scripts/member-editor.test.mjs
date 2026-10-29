import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, Script } from 'node:vm';
import { loadBindings, transform } from 'next/dist/build/swc/index.js';
import * as invitationData from '../apps/web/src/features/invitations/invitation-data.js';

// Exercise the actual JSX component's hooks and handlers with controlled API
// promises. No browser, network, React test framework or application rewrite.
await loadBindings();
const { code } = await transform(
  await readFile(
    new URL(
      '../apps/web/src/features/members/member-editor.jsx',
      import.meta.url,
    ),
    'utf8',
  ),
  {
    filename: 'member-editor.jsx',
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      target: 'es2022',
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  },
);
const preview = () => ({
  member: {
    id: 'member',
    userId: 'rahul',
    name: 'Rahul Test',
    role: 'FAMILY_MEMBER',
    relationship: 'Friend',
    isCreator: false,
    isYou: false,
    version: 3,
  },
  adminCount: 2,
  openTaskCount: 2,
  pendingInvitations: 0,
  managedRepeats: { count: 1, sample: [{ id: 'rule', title: 'Check plans' }] },
  handoverCandidates: [{ userId: 'admin', name: 'Acting Admin' }],
  preview: 'original-signed-preview',
});

function probe(t) {
  let cells = [],
    mountedKey;
  const requests = [],
    saved = [];
  const session = {
    user: { id: 'admin' },
    wedding: { id: 'wedding' },
    connectionError: '',
    retrySession() {},
  };
  let cursor = 0,
    dirty = true,
    effects = [],
    tree;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in cells))
        cells[index] = {
          value: typeof initial === 'function' ? initial() : initial,
        };
      const cell = cells[index];
      return [
        cell.value,
        (next) => {
          const value = typeof next === 'function' ? next(cell.value) : next;
          if (!Object.is(value, cell.value)) {
            cell.value = value;
            if (cells[index] === cell) dirty = true;
          }
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      cells[index] ||= { current: initial };
      return cells[index];
    },
    useEffect(callback, deps) {
      const index = cursor++,
        previous = cells[index];
      if (
        !previous ||
        deps.some((dep, i) => !Object.is(dep, previous.deps[i]))
      ) {
        cells[index] = { deps, cleanup: previous?.cleanup };
        effects.push(() => {
          previous?.cleanup?.();
          cells[index].cleanup = callback();
        });
      }
    },
  };
  const element = (type, props, key) => ({ type, props: props || {}, key });
  const css = {
    __esModule: true,
    default: new Proxy({}, { get: (_target, name) => String(name) }),
  };
  const imports = {
    react: hooks,
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'radix-ui': {
      Dialog: new Proxy(
        {},
        { get: (_target, name) => `Dialog.${String(name)}` },
      ),
    },
    'lucide-react': {
      X: 'X',
      ShieldCheck: 'ShieldCheck',
      AlertTriangle: 'AlertTriangle',
    },
    '@/features/auth/session-provider': { useSession: () => session },
    '@/features/tasks/discard-changes-dialog': {
      DiscardChangesDialog: 'DiscardChangesDialog',
    },
    '@/features/invitations/invitation-data': invitationData,
    '@/features/invitations/invitations.module.css': css,
    './member-editor.module.css': css,
    '@/lib/api-client': {
      apiRequest: (path, options) => {
        const deferred = Promise.withResolvers();
        requests.push({ path, options, ...deferred });
        return deferred.promise;
      },
    },
  };
  const exports = {};
  const context = createContext({
    exports,
    require(name) {
      assert.ok(name in imports, `Unexpected component import ${name}`);
      return imports[name];
    },
    AbortController,
    crypto: globalThis.crypto,
  });
  new Script(code, { filename: 'member-editor.jsx' }).runInContext(context);
  const props = {
    memberId: 'member',
    onClose() {},
    onSaved: (value) => saved.push(value),
    onReturnFocus() {},
  };
  function render() {
    let passes = 0;
    do {
      assert.ok(++passes < 20, 'Component did not settle');
      dirty = false;
      cursor = 0;
      effects = [];
      const root = exports.MemberEditor(props);
      if (root.key !== mountedKey) {
        for (const cell of cells) cell.cleanup?.();
        cells = [];
        mountedKey = root.key;
      }
      tree = root.type(root.props);
      for (const effect of effects) effect();
    } while (dirty);
  }
  const nodes = (value) =>
    !value || typeof value !== 'object'
      ? []
      : Array.isArray(value)
        ? value.flatMap((child) => nodes(child))
        : [value, ...nodes(value.props?.children)];
  const text = (value) =>
    value == null || typeof value === 'boolean'
      ? ''
      : Array.isArray(value)
        ? value.map(text).join('')
        : typeof value === 'object'
          ? text(value.props?.children)
          : String(value);
  const find = (predicate) => nodes(tree).find(predicate);
  const button = (name) =>
    find((node) => node.type === 'button' && text(node) === name);
  const submit = () =>
    find((node) => node.type === 'form').props.onSubmit({
      preventDefault() {},
    });
  const flush = async () => {
    await new Promise(setImmediate);
    render();
  };
  render();
  t.after(() => {
    for (const cell of cells) cell.cleanup?.();
  });
  return {
    props,
    session,
    requests,
    saved,
    render,
    flush,
    find,
    button,
    submit,
    text: () => text(tree),
  };
}
async function uncertainSave(t) {
  const p = probe(t);
  p.requests[0].resolve({ data: preview() });
  await p.flush();
  p.find((node) => node.props.id === 'member-role').props.onChange({
    target: { value: 'VIEWER' },
  });
  p.render();
  p.find(
    (node) => node.type === 'input' && node.props.type === 'checkbox',
  ).props.onChange({ target: { checked: true } });
  p.render();
  assert.equal(p.button('Save member changes').props.disabled, false);
  const sending = p.submit();
  p.render();
  const original = p.requests.at(-1);
  original.reject(
    Object.assign(new Error('Save response lost'), { code: 'NETWORK_ERROR' }),
  );
  await sending;
  await p.flush();
  p.session.connectionError = 'Temporary session outage';
  p.render();
  assert.equal(p.button('Retry unchanged save').props.disabled, true);
  p.session.connectionError = '';
  p.render();
  return { p, original, recovery: p.requests.at(-1) };
}
test('role retry retains the real draft and exact request when session recovery preview returns 503', async (t) => {
  const { p, original, recovery } = await uncertainSave(t);
  recovery.reject(
    Object.assign(new Error('Member preview unavailable'), {
      code: 'MEMBER_CHANGE_UNAVAILABLE',
    }),
  );
  await p.flush();
  assert.equal(
    p.find((node) => node.props.id === 'member-role').props.value,
    'VIEWER',
  );
  assert.equal(p.find((node) => node.type === 'fieldset').props.disabled, true);
  assert.equal(p.button('Retry unchanged save').props.disabled, false);
  assert.match(p.text(), /Your submitted choices are kept/);
  const retrying = p.submit(),
    retry = p.requests.at(-1);
  p.render();
  assert.equal(retry.options.body, original.options.body);
  assert.equal(
    retry.options.headers['Idempotency-Key'],
    original.options.headers['Idempotency-Key'],
  );
  assert.equal(
    retry.options.headers['If-Match'],
    original.options.headers['If-Match'],
  );
  retry.resolve({ data: { replayed: true, role: 'VIEWER' } });
  await retrying;
  await p.flush();
  assert.equal(p.saved.length, 1);
  assert.equal(p.saved[0].replayed, true);
});
test('retrying the preview itself does not discard an uncertain role-save request or key', async (t) => {
  const { p, original, recovery } = await uncertainSave(t);
  recovery.reject(
    Object.assign(new Error('Preview unavailable'), {
      code: 'MEMBER_CHANGE_UNAVAILABLE',
    }),
  );
  await p.flush();
  p.button('Retry member preview').props.onClick();
  p.render();
  assert.equal(p.button('Retry unchanged save').props.disabled, false);
  p.requests.at(-1).reject(
    Object.assign(new Error('Still unavailable'), {
      code: 'MEMBER_CHANGE_UNAVAILABLE',
    }),
  );
  await p.flush();
  const sending = p.submit(),
    retry = p.requests.at(-1);
  assert.equal(retry.options.body, original.options.body);
  assert.equal(
    retry.options.headers['Idempotency-Key'],
    original.options.headers['Idempotency-Key'],
  );
  retry.resolve({ data: { replayed: true } });
  await sending;
});
test('a confirmed preview access denial blocks the retained role draft and cannot submit a retry', async (t) => {
  const { p, recovery } = await uncertainSave(t);
  recovery.reject(
    Object.assign(new Error('Only an Admin can change member access.'), {
      code: 'ADMIN_REQUIRED',
    }),
  );
  await p.flush();
  assert.equal(p.button('Retry unchanged save').props.disabled, true);
  const count = p.requests.length;
  await p.submit();
  assert.equal(p.requests.length, count);
  assert.equal(p.saved.length, 0);
});
test('retained submitted role details are not shown after the acting account changes', async (t) => {
  const { p, recovery } = await uncertainSave(t);
  recovery.reject(
    Object.assign(new Error('Preview unavailable'), {
      code: 'MEMBER_CHANGE_UNAVAILABLE',
    }),
  );
  await p.flush();
  p.session.user = { id: 'another-account' };
  p.render();
  assert.equal(
    p.find((node) => node.type === 'fieldset'),
    undefined,
  );
  assert.equal(p.button('Save member changes').props.disabled, true);
  assert.equal(p.text().includes('Rahul Test'), false);
});
test('a new account preview starts a fresh draft, confirmation and retry key, including switching back', async (t) => {
  const { p, recovery, original } = await uncertainSave(t);
  p.session.user = { id: 'another-account' };
  p.render();
  const next = preview();
  next.preview = 'new-account-preview';
  next.handoverCandidates = [
    { userId: 'another-account', name: 'Another Admin' },
  ];
  p.requests.at(-1).resolve({ data: next });
  recovery.resolve({ data: preview() });
  await p.flush();
  assert.equal(
    p.find((node) => node.props.id === 'member-role').props.value,
    'FAMILY_MEMBER',
  );
  assert.equal(p.button('Retry unchanged save'), undefined);
  assert.equal(p.button('Save member changes').props.disabled, true);
  p.find((node) => node.props.id === 'member-role').props.onChange({
    target: { value: 'VIEWER' },
  });
  p.render();
  assert.equal(
    p.find((node) => node.props.id === 'member-repeat-manager').props.value,
    'another-account',
  );
  p.find(
    (node) => node.type === 'input' && node.props.type === 'checkbox',
  ).props.onChange({ target: { checked: true } });
  p.render();
  const sending = p.submit(),
    request = p.requests.at(-1);
  assert.notEqual(
    request.options.headers['Idempotency-Key'],
    original.options.headers['Idempotency-Key'],
  );
  assert.equal(
    JSON.parse(request.options.body).handoverToUserId,
    'another-account',
  );
  assert.equal(JSON.parse(request.options.body).preview, 'new-account-preview');
  p.session.user = { id: 'admin' };
  p.render();
  request.resolve({ data: { role: 'VIEWER' } });
  p.requests.at(-1).resolve({ data: preview() });
  await sending;
  await p.flush();
  assert.equal(
    p.saved.length,
    0,
    'An unmounted account cannot finish the new editor',
  );
  assert.equal(p.button('Retry unchanged save'), undefined);
  assert.equal(
    p.find((node) => node.props.id === 'member-role').props.value,
    'FAMILY_MEMBER',
  );
});
test('changing the wedding or target member also clears submitted draft and request state', async (t) => {
  const { p } = await uncertainSave(t);
  for (const change of [
    () => {
      p.session.wedding = { id: 'other-wedding' };
    },
    () => {
      p.props.memberId = 'other-member';
    },
  ]) {
    change();
    p.render();
    assert.equal(
      p.find((node) => node.type === 'fieldset'),
      undefined,
    );
    p.requests.at(-1).resolve({ data: preview() });
    await p.flush();
    assert.equal(p.button('Retry unchanged save'), undefined);
    assert.equal(p.button('Save member changes').props.disabled, true);
    p.find((node) => node.props.id === 'member-role').props.onChange({
      target: { value: 'VIEWER' },
    });
    p.render();
  }
});
test('confirmed denial remains locked while preview retries load or fail transiently, until authorized success', async (t) => {
  const { p, recovery, original } = await uncertainSave(t);
  recovery.reject(
    Object.assign(new Error('Admin access required'), {
      code: 'ADMIN_REQUIRED',
    }),
  );
  await p.flush();
  for (let i = 0; i < 2; i++) {
    p.button('Retry member preview').props.onClick();
    p.render();
    assert.equal(p.button('Retry unchanged save').props.disabled, true);
    assert.equal(
      p.find((node) => node.type === 'fieldset').props.disabled,
      true,
    );
    const count = p.requests.length;
    await p.submit();
    assert.equal(p.requests.length, count);
    if (i === 0) {
      const failedPreview = p.requests.at(-1);
      failedPreview.reject(
        Object.assign(new Error('Temporary preview error'), {
          code: 'MEMBER_CHANGE_UNAVAILABLE',
        }),
      );
      await p.flush();
      assert.equal(p.button('Retry unchanged save').props.disabled, true);
    }
  }
  p.requests.at(-1).resolve({ data: preview() });
  await p.flush();
  assert.equal(p.button('Retry unchanged save').props.disabled, false);
  const sending = p.submit(),
    retry = p.requests.at(-1);
  assert.equal(retry.options.body, original.options.body);
  assert.equal(
    retry.options.headers['Idempotency-Key'],
    original.options.headers['Idempotency-Key'],
  );
  retry.resolve({ data: { replayed: true } });
  await sending;
  await p.flush();
  assert.equal(p.saved.length, 1);
});
test('explicit draft reload cannot clear a permission denial before successful revalidation', async (t) => {
  const { p, recovery } = await uncertainSave(t);
  recovery.reject(
    Object.assign(new Error('Access denied'), { code: 'FORBIDDEN' }),
  );
  await p.flush();
  p.button('Reload latest details (replaces unsaved choices)').props.onClick();
  p.render();
  assert.equal(p.button('Save member changes').props.disabled, true);
  assert.match(p.text(), /Access denied/);
  p.requests.at(-1).resolve({ data: preview() });
  await p.flush();
  assert.equal(
    p.find((node) => node.type === 'fieldset').props.disabled,
    false,
  );
  assert.equal(p.button('Save member changes').props.disabled, true);
});
