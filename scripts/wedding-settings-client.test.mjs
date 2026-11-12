import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, Script } from 'node:vm';
import { loadBindings, transform } from 'next/dist/build/swc/index.js';
import * as data from '../apps/web/src/features/weddings/settings-data.js';
import * as formData from '../apps/web/src/features/weddings/form-data.js';

// Run the real hooks and event handlers with controlled API promises. No network
// or test framework; private bindings are exposed only in the compiled test copy.
await loadBindings();
const { code } = await transform(
  await readFile(
    new URL(
      '../apps/web/src/features/weddings/wedding-settings.jsx',
      import.meta.url,
    ),
    'utf8',
  ),
  {
    filename: 'wedding-settings.jsx',
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      target: 'es2022',
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  },
);
function fixture(t, component = 'SettingsForm') {
  const session = {
    user: { id: 'account' },
    wedding: {
      id: 'wedding',
      name: 'Our day',
      brideName: 'Anya',
      groomName: 'Kabir',
      mainDate: '2027-01-01',
      tradition: 'ODIA',
      location: { city: 'Puri', state: 'Odisha' },
      version: 0,
    },
    membership: { role: 'ADMIN', financeAccess: true },
    applySavedWedding: () => saved++,
    retrySession: () => rechecks++,
  };
  const requests = [],
    cells = [],
    effects = [];
  let saved = 0,
    rechecks = 0,
    denied = 0,
    cursor = 0,
    dirty = true,
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
        (value) => {
          const next = typeof value === 'function' ? value(cell.value) : value;
          if (!Object.is(cell.value, next)) {
            cell.value = next;
            dirty = true;
          }
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      return (cells[index] ||= { current: initial });
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
  const imports = {
    react: hooks,
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'lucide-react': new Proxy({}, { get: (_, name) => String(name) }),
    '@/features/auth/session-provider': { useSession: () => session },
    '@/features/dashboard/planning-previews': {
      WeddingSettingsLayout: 'Layout',
    },
    '@/lib/api-client': {
      apiRequest: (path, options) => {
        const request = { ...Promise.withResolvers(), path, options };
        requests.push(request);
        return request.promise;
      },
    },
    '@/lib/idempotency-key': {
      newIdempotencyKey: () => 'fixed-settings-save-key',
    },
    './form-data': formData,
    './settings-data': data,
    './settings.module.css': {
      __esModule: true,
      default: new Proxy({}, { get: (_, name) => String(name) }),
    },
  };
  const exports = {};
  const context = createContext({
    exports,
    require: (name) => {
      assert.ok(name in imports, name);
      return imports[name];
    },
    AbortController,
  });
  new Script(
    code +
      '\nexports.ProbeForm=SettingsForm;exports.ProbeWorkspace=SettingsWorkspace;',
  ).runInContext(context);
  function render() {
    dirty = true;
    for (let count = 0; dirty; count++) {
      assert.ok(count < 20, 'Render should settle');
      dirty = false;
      cursor = 0;
      tree = (
        component === 'SettingsForm'
          ? exports.ProbeForm
          : exports.ProbeWorkspace
      )({ session, onAccessDenied: () => denied++ });
      while (effects.length) effects.shift()();
    }
    return tree;
  }
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap((child) => nodes(child));
    return [node, ...nodes(node.props?.children)];
  }
  function text(node) {
    if (node == null || node === false) return '';
    if (Array.isArray(node)) return node.map(text).join(' ');
    return typeof node === 'object' ? text(node.props?.children) : String(node);
  }
  const button = (label) =>
    nodes(tree).find(
      (node) => node.type === 'button' && text(node).trim() === label,
    );
  const input = (name) =>
    nodes(tree).find((node) => node.props?.id === 'settings-' + name);
  const submit = () =>
    nodes(tree)
      .find((node) => node.type === 'form')
      .props.onSubmit({ preventDefault() {} });
  t.after(() => cells.forEach((cell) => cell.cleanup?.()));
  render();
  return {
    session,
    requests,
    render,
    button,
    input,
    submit,
    text: () => text(tree),
    edit(name, value) {
      input(name).props.onChange({ target: { name, value } });
      render();
    },
    stats: () => ({ saved, rechecks, denied }),
    unmount() {
      cells.forEach((cell) => cell.cleanup?.());
    },
  };
}
async function conflict(p) {
  p.edit('name', 'My retained draft');
  const pending = p.submit();
  p.render();
  p.requests.shift().reject(
    Object.assign(new Error('Changed since opening.'), {
      status: 409,
      code: 'VERSION_CONFLICT',
    }),
  );
  await pending;
  p.render();
}

test('failed latest-settings recovery keeps draft, conflict and denial locks until authorized success', async (t) => {
  const p = fixture(t);
  await conflict(p);
  for (const failure of [
    Object.assign(new Error('Temporary outage'), { status: 503 }),
    Object.assign(new Error('Access denied'), { status: 403 }),
    Object.assign(new Error('Still offline'), { status: 503 }),
  ]) {
    const pending = p.button('Discard draft and load latest').props.onClick();
    p.render();
    p.requests.shift().reject(failure);
    await pending;
    p.render();
    assert.equal(p.input('name').props.value, 'My retained draft');
    assert.equal(p.input('name').props.readOnly, true);
    assert.equal(p.button('Save Wedding Settings').props.disabled, true);
    assert.ok(p.button('Discard draft and load latest'));
  }
  assert.equal(p.stats().denied, 1);
  const pending = p.button('Discard draft and load latest').props.onClick();
  p.render();
  p.requests.shift().resolve({
    data: {
      wedding: { ...p.session.wedding, name: 'Current title', version: 2 },
      membership: { role: 'ADMIN', financeAccess: true },
    },
  });
  await pending;
  p.render();
  assert.equal(p.input('name').props.value, 'Current title');
  assert.equal(p.input('name').props.readOnly, false);
});
test('uncertain retries keep exact body, version and key through repeated network failures', async (t) => {
  const p = fixture(t);
  p.edit('name', 'Uncertain draft');
  let pending = p.submit();
  p.render();
  const first = p.requests.shift();
  first.reject(Object.assign(new Error('Offline'), { status: 503 }));
  await pending;
  p.render();
  assert.equal(p.input('name').props.readOnly, true);
  pending = p.submit();
  p.render();
  const retry = p.requests.shift();
  for (const field of ['body', 'headers'])
    assert.equal(
      JSON.stringify(retry.options[field]),
      JSON.stringify(first.options[field]),
    );
  retry.reject(new Error('Still offline'));
  await pending;
  p.render();
  assert.ok(p.button('Retry unchanged save'));
});
test('unmounted callbacks cannot apply saved settings to another context', async (t) => {
  const p = fixture(t);
  p.edit('name', 'Late change');
  const pending = p.submit();
  const request = p.requests.shift();
  p.unmount();
  request.resolve({
    data: {
      wedding: { ...p.session.wedding, name: 'Late change', version: 1 },
      membership: p.session.membership,
    },
  });
  await pending;
  assert.equal(p.stats().saved, 0);
});
test('role changes leave explanatory feedback outside the remounted form', (t) => {
  const p = fixture(t, 'SettingsWorkspace');
  p.session.membership = { role: 'FAMILY_MEMBER', financeAccess: false };
  p.render();
  assert.match(
    p.text(),
    /Your access changed.*Only Admins can save wedding settings/,
  );
});

test('server field errors highlight their flat form controls without losing the draft', async (t) => {
  const p = fixture(t);
  p.edit('city', 'My City');
  const pending = p.submit();
  p.render();
  p.requests.shift().reject(
    Object.assign(new Error('Please check your details.'), {
      status: 400,
      code: 'VALIDATION_ERROR',
      details: {
        fields: {
          'location.city': 'Check the city.',
          'location.state': 'Check the state.',
          'estimatedBudget.amountMinor': 'Check the budget.',
          tradition: 'Choose a tradition.',
        },
      },
    }),
  );
  await pending;
  p.render();
  assert.equal(p.input('city').props.value, 'My City');
  for (const field of ['city', 'state', 'budget', 'tradition'])
    assert.equal(p.input(field).props['aria-invalid'], true, field);
  assert.match(
    p.input('budget').props['aria-describedby'],
    /settings-budget-error/,
  );
  assert.match(p.text(), /Check the city/);
  assert.match(p.text(), /Check the budget/);
});

test('invalid fractional commas prevent any API write', async (t) => {
  const p = fixture(t);
  p.edit('budget', '1,000.50,');
  await p.submit();
  p.render();
  assert.equal(p.requests.length, 0);
  assert.equal(p.input('budget').props['aria-invalid'], true);
});
