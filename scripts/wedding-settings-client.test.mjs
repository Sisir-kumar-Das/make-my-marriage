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
    effects = [],
    focuses = [];
  let mountedRefs = new Map();
  let saved = 0,
    rechecks = 0,
    denied = 0,
    cursor = 0,
    dirty = true,
    tree;
  let instant = new Date('2026-11-12T12:00:00Z');
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
    './settings-data': {
      ...data,
      settingsDateError: (saved, draft) =>
        data.settingsDateError(saved, draft, instant),
    },
    './date-change-dialog': { DateChangeDialog: 'DateChangeDialog' },
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
      const nextRefs = new Map();
      for (const node of nodes(tree)) {
        const ref = node.props?.ref;
        if (!ref || typeof ref !== 'object') continue;
        const element = mountedRefs.get(ref) ?? {
          focus: () => focuses.push(node.props.id),
          scrollIntoView() {},
        };
        element.isConnected = true;
        element.disabled = !!node.props.disabled;
        element.id = node.props.id;
        ref.current = element;
        nextRefs.set(ref, element);
      }
      for (const [ref, element] of mountedRefs)
        if (!nextRefs.has(ref)) {
          element.isConnected = false;
          ref.current = null;
        }
      mountedRefs = nextRefs;
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
    focuses,
    render,
    button,
    input,
    element: (id) => nodes(tree).find((node) => node.props?.id === id),
    submit,
    dialog: () =>
      nodes(tree).find((node) => node.type === 'DateChangeDialog').props,
    setNow: (value) => {
      instant = new Date(value);
    },
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

test('closing a saved or conflicted date confirmation chooses the result instead of disabled Save', async (t) => {
  const p = fixture(t);
  p.edit('mainDate', '2027-02-02');
  await p.submit();
  p.render();
  const pending = p.dialog().onConfirm();
  p.requests.shift().resolve({
    data: {
      wedding: { ...p.session.wedding, mainDate: '2027-02-02', version: 1 },
      membership: p.session.membership,
    },
  });
  await pending;
  p.render();
  const feedback = { isConnected: true };
  p.element('settings-save-feedback').props.ref.current = feedback;
  assert.equal(p.element('settings-save-feedback').props.tabIndex, -1);
  assert.equal(p.dialog().getCloseFocus(), feedback);
  assert.equal(p.button('Save Wedding Settings').props.disabled, true);
  p.edit('mainDate', '2027-03-03');
  await p.submit();
  p.render();
  assert.equal(
    p.dialog().getCloseFocus(),
    null,
    'Keep editing must still return to the original trigger',
  );
  const rejected = p.dialog().onConfirm();
  p.requests.shift().reject(
    Object.assign(new Error('Changed'), {
      status: 409,
      code: 'VERSION_CONFLICT',
    }),
  );
  await rejected;
  p.render();
  const recovery = { isConnected: true };
  p.element('settings-reload-latest').props.ref.current = recovery;
  assert.equal(p.dialog().getCloseFocus(), recovery);
  assert.equal(p.button('Save Wedding Settings').props.disabled, true);
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

test('date changes need confirmation; cancel retains all draft details and pending saves are locked', async (t) => {
  const p = fixture(t);
  p.edit('mainDate', '2027-02-02');
  p.edit('name', 'Date and title together');
  await p.submit();
  p.render();
  assert.equal(p.requests.length, 0);
  assert.equal(p.dialog().change.oldDate, '2027-01-01');
  assert.equal(p.dialog().change.newDate, '2027-02-02');
  p.dialog().onCancel();
  p.render();
  assert.equal(p.input('mainDate').props.value, '2027-02-02');
  assert.equal(p.input('name').props.value, 'Date and title together');
  await p.submit();
  p.render();
  const pending = p.dialog().onConfirm();
  p.render();
  assert.equal(p.dialog().pending, true);
  p.dialog().onCancel();
  p.render();
  assert.ok(p.dialog().change);
  await p.dialog().onConfirm();
  assert.equal(p.requests.length, 1);
  const request = p.requests.shift();
  assert.deepEqual(JSON.parse(request.options.body), {
    name: 'Date and title together',
    mainDate: '2027-02-02',
    confirmDateChange: true,
  });
  request.resolve({
    data: {
      wedding: {
        ...p.session.wedding,
        name: 'Date and title together',
        mainDate: '2027-02-02',
        version: 1,
      },
      membership: p.session.membership,
    },
  });
  await pending;
  p.render();
  assert.equal(p.dialog().change, null);
  assert.equal(p.input('mainDate').props.value, '2027-02-02');
  assert.equal(p.stats().saved, 1);
});

test('fresh past-date changes reject, while unchanged historical dates do not block metadata', async (t) => {
  const p = fixture(t);
  p.edit('mainDate', '2026-11-11');
  await p.submit();
  p.render();
  assert.equal(p.requests.length, 0);
  assert.equal(p.dialog().change, null);
  assert.equal(p.input('mainDate').props['aria-invalid'], true);
  p.edit('mainDate', '2027-01-01');
  p.setNow('2028-01-01T00:00:00Z');
  p.edit('city', 'Cuttack');
  const pending = p.submit();
  p.render();
  assert.equal(p.requests.length, 1);
  p.requests
    .shift()
    .reject(Object.assign(new Error('Unavailable'), { status: 503 }));
  await pending;
});

test('midnight before confirmation rejects a fresh change; uncertain saves retry exactly after midnight', async (t) => {
  const p = fixture(t);
  p.edit('mainDate', '2026-11-12');
  await p.submit();
  p.render();
  p.setNow('2026-11-12T18:30:00Z');
  await p.dialog().onConfirm();
  p.render();
  assert.equal(p.requests.length, 0);
  assert.equal(p.input('mainDate').props['aria-invalid'], true);
  p.setNow('2026-11-12T18:29:59Z');
  p.edit('mainDate', '2026-11-12');
  await p.submit();
  p.render();
  let pending = p.dialog().onConfirm();
  p.render();
  const first = p.requests.shift();
  first.reject(new Error('Response lost'));
  await pending;
  p.render();
  p.setNow('2026-11-12T18:30:00Z');
  pending = p.submit();
  p.render();
  const again = p.requests.shift();
  assert.equal(again.options.body, first.options.body);
  assert.deepEqual(again.options.headers, first.options.headers);
  again.resolve({
    data: {
      wedding: { ...p.session.wedding, mainDate: '2026-11-12', version: 1 },
      membership: p.session.membership,
      replayed: true,
    },
  });
  await pending;
  p.render();
  assert.equal(p.dialog().change, null);
  assert.match(p.text(), /earlier save completed/);
});

test('date confirmation pauses through session errors and rejects stale unmounted saves', async (t) => {
  const p = fixture(t);
  p.edit('mainDate', '2027-02-01');
  await p.submit();
  p.render();
  p.session.connectionError = 'Temporary outage';
  p.render();
  await p.dialog().onConfirm();
  assert.equal(p.requests.length, 0);
  assert.equal(p.dialog().change.newDate, '2027-02-01');
  p.session.connectionError = '';
  p.render();
  const pending = p.dialog().onConfirm();
  const request = p.requests.shift();
  p.unmount();
  request.resolve({
    data: {
      wedding: { ...p.session.wedding, mainDate: '2027-02-01', version: 1 },
      membership: p.session.membership,
    },
  });
  await pending;
  assert.equal(p.stats().saved, 0);
});

test('latest-settings recovery focuses its mounted result after delayed success or failure', async (t) => {
  const p = fixture(t);
  await conflict(p);
  assert.equal(p.focuses.at(-1), 'settings-reload-latest');
  const beforeReload = p.focuses.length;
  let pending = p.button('Discard draft and load latest').props.onClick();
  p.render();
  assert.equal(
    p.focuses.length,
    beforeReload,
    'pending reload must not move focus',
  );
  p.requests
    .shift()
    .reject(
      Object.assign(new Error('Temporary read failure'), { status: 503 }),
    );
  await pending;
  p.render();
  assert.equal(p.focuses.at(-1), 'settings-save-error');
  pending = p.button('Discard draft and load latest').props.onClick();
  p.render();
  p.requests.shift().resolve({
    data: {
      wedding: { ...p.session.wedding, name: 'Fresh settings', version: 2 },
      membership: p.session.membership,
    },
  });
  await pending;
  p.render();
  assert.equal(p.focuses.at(-1), 'settings-save-feedback');
  assert.equal(p.input('name').props.value, 'Fresh settings');
  assert.equal(p.element('settings-save-feedback').props.tabIndex, -1);
  const count = p.focuses.length;
  p.render();
  assert.equal(
    p.focuses.length,
    count,
    'background renders must not steal focus again',
  );
});

test('disabled or disconnected recovery/retry targets fall back to the visible error alert', async (t) => {
  for (const status of [409, 503]) {
    const p = fixture(t);
    p.edit('mainDate', '2027-02-02');
    await p.submit();
    p.render();
    const pending = p.dialog().onConfirm();
    p.session.connectionError = 'Connection failed';
    p.render();
    p.requests.shift().reject(
      Object.assign(new Error('Could not save'), {
        status,
        code: status === 409 ? 'VERSION_CONFLICT' : 'WEDDING_UNAVAILABLE',
      }),
    );
    await pending;
    p.render();
    const error = p.element('settings-save-error').props.ref.current;
    const control = p.element(
      status === 409 ? 'settings-reload-latest' : 'settings-save-button',
    ).props.ref.current;
    assert.equal(control.disabled, true);
    assert.equal(p.dialog().getCloseFocus(), error);
    const connectionAlert = { isConnected: true, disabled: false };
    p.session.connectionErrorFocus = { current: connectionAlert };
    error.closest = () => ({ inert: true });
    assert.equal(
      p.dialog().getCloseFocus(),
      connectionAlert,
      'inert form errors must fall back outside the inactive form',
    );
    error.closest = () => null;
    connectionAlert.isConnected = false;
    p.session.connectionError = '';
    p.render();
    const enabled = p.element(
      status === 409 ? 'settings-reload-latest' : 'settings-save-button',
    ).props.ref.current;
    assert.equal(enabled.disabled, false);
    enabled.isConnected = false;
    assert.equal(
      p.dialog().getCloseFocus(),
      p.element('settings-save-error').props.ref.current,
    );
  }
});

test('the busy confirmation focuses its own container and preserves pending Escape locks', async () => {
  const source = await transform(
    await readFile(
      new URL(
        '../apps/web/src/features/weddings/date-change-dialog.jsx',
        import.meta.url,
      ),
      'utf8',
    ),
    {
      filename: 'date-change-dialog.jsx',
      jsc: {
        parser: { syntax: 'ecmascript', jsx: true },
        target: 'es2022',
        transform: { react: { runtime: 'automatic' } },
      },
      module: { type: 'commonjs' },
    },
  );
  const cells = [],
    effects = [],
    focuses = [];
  let cursor = 0,
    canceled = 0;
  const element = (type, props) => ({ type, props: props || {} });
  const trigger = {
    isConnected: true,
    disabled: false,
    focus: () => focuses.push('trigger'),
  };
  const imports = {
    react: {
      useRef: (value) => (cells[cursor++] ??= { current: value }),
      useLayoutEffect: (effect) => effects.push(effect),
    },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'radix-ui': {
      AlertDialog: {
        Root: 'Root',
        Portal: 'Portal',
        Content: 'Content',
        Overlay: 'Overlay',
        Title: 'Title',
        Description: 'Description',
        Cancel: 'Cancel',
      },
    },
    'lucide-react': { AlertTriangle: 'AlertTriangle' },
    './form-data': formData,
    '../tasks/tasks.module.css': {
      __esModule: true,
      default: new Proxy({}, { get: (_, key) => String(key) }),
    },
  };
  const exports = {};
  new Script(source.code).runInContext(
    createContext({
      exports,
      require: (name) => imports[name],
      document: { activeElement: trigger },
    }),
  );
  function node(tree, type) {
    if (!tree) return;
    if (Array.isArray(tree)) {
      for (const item of tree) {
        const found = node(item, type);
        if (found) return found;
      }
    } else if (typeof tree === 'object')
      return tree.type === type ? tree : node(tree.props?.children, type);
  }
  function render(pending) {
    cursor = 0;
    const tree = exports.DateChangeDialog({
      change: { oldDate: '2027-01-01', newDate: '2027-02-01' },
      pending,
      onCancel: () => canceled++,
      onConfirm() {},
    });
    const content = node(tree, 'Content');
    content.props.ref.current = { focus: () => focuses.push('dialog') };
    return content;
  }
  const first = render(false);
  first.props.onOpenAutoFocus();
  effects.splice(0).forEach((effect) => effect());
  assert.equal(focuses.length, 0);
  trigger.disabled = true;
  const busy = render(true);
  effects.splice(0).forEach((effect) => effect());
  assert.equal(busy.props.tabIndex, -1);
  assert.equal(focuses.at(-1), 'dialog');
  assert.equal(busy.props['aria-busy'], true);
  let prevented = 0;
  busy.props.onEscapeKeyDown({
    preventDefault: () => prevented++,
    stopPropagation() {},
  });
  assert.equal(prevented, 1);
  assert.equal(canceled, 0);
});

test('plain metadata saves focus the mounted result or recovery control after delayed responses', async (t) => {
  for (const outcome of ['success', 'conflict', 'uncertain', 'validation']) {
    const p = fixture(t);
    p.edit('name', 'Draft wedding name');
    const pending = p.submit();
    p.render();
    const before = p.focuses.length;
    p.render();
    assert.equal(p.focuses.length, before);
    const request = p.requests.shift();
    if (outcome === 'success')
      request.resolve({
        data: {
          wedding: {
            ...p.session.wedding,
            name: 'Draft wedding name',
            version: 1,
          },
          membership: p.session.membership,
        },
      });
    else
      request.reject(
        Object.assign(new Error('Save could not finish'), {
          status:
            outcome === 'conflict' ? 409 : outcome === 'uncertain' ? 503 : 400,
          code:
            outcome === 'conflict' ? 'VERSION_CONFLICT' : 'WEDDING_UNAVAILABLE',
        }),
      );
    await pending;
    assert.equal(p.focuses.length, before, 'focus waits for a React commit');
    p.render();
    assert.equal(
      p.focuses.at(-1),
      outcome === 'success'
        ? 'settings-save-feedback'
        : outcome === 'conflict'
          ? 'settings-reload-latest'
          : outcome === 'uncertain'
            ? 'settings-save-button'
            : 'settings-save-error',
    );
    const count = p.focuses.length;
    p.render();
    assert.equal(p.focuses.length, count);
  }
});
