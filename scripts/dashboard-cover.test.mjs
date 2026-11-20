import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, Script } from 'node:vm';
import { loadBindings, transform } from 'next/dist/build/swc/index.js';
import * as coverData from '../apps/web/src/features/weddings/cover-data.js';
import * as dashboardData from '../apps/web/src/features/dashboard/dashboard-data.js';
import * as weddingFormData from '../apps/web/src/features/weddings/form-data.js';
import * as lifecycleData from '../apps/web/src/features/weddings/lifecycle-data.js';
import * as lifecycleState from '../apps/web/src/features/weddings/lifecycle-state.js';

const { coverActions, onContainedPicture, sameMenuPress, viewerPressCloses } =
  coverData;

// Dashboard cover menu rules (owner, 4 Nov; ADR-044 revision 2).
test('cover menu: everyone views a loaded custom photo, only Admins change it', () => {
  for (const role of ['ADMIN', 'FAMILY_MEMBER', 'VIEWER']) {
    const custom = coverActions({ role, hasPhoto: true, photoReady: true });
    assert.equal(custom.canView, true, `${role} views a loaded photo`);
    assert.equal(custom.canChange, role === 'ADMIN', `${role} change rule`);
    // Signature artwork: no View photo for anyone.
    const signature = coverActions({
      role,
      hasPhoto: false,
      photoReady: false,
    });
    assert.equal(signature.canView, false);
    // Still loading or failed: nothing to view yet.
    assert.equal(
      coverActions({ role, hasPhoto: true, photoReady: false }).canView,
      false,
    );
  }
  // The Settings preview is read-only, even for Admins.
  assert.equal(
    coverActions({ role: 'ADMIN', readOnly: true, hasPhoto: true }).canChange,
    false,
  );
});

test('viewer: clicks on the letterbox close, clicks on the picture do not', () => {
  const box = { left: 0, top: 0, width: 1000, height: 500 };
  // A 4:3 landscape photo in a 2:1 box: 667 px wide, centred, ~167 px letterbox each side.
  const landscape = { width: 1200, height: 900 };
  assert.equal(onContainedPicture(box, landscape, { x: 500, y: 250 }), true);
  assert.equal(onContainedPicture(box, landscape, { x: 100, y: 250 }), false);
  assert.equal(onContainedPicture(box, landscape, { x: 900, y: 250 }), false);
  // A portrait photo: narrow picture in the middle.
  const portrait = { width: 600, height: 1200 };
  assert.equal(onContainedPicture(box, portrait, { x: 500, y: 20 }), true);
  assert.equal(onContainedPicture(box, portrait, { x: 300, y: 250 }), false);
  // Not loaded yet (no natural size): nothing counts as the picture.
  assert.equal(
    onContainedPicture(box, { width: 0, height: 0 }, { x: 500, y: 250 }),
    false,
  );
});

test('viewer closes only when the press starts and ends on the dark area', () => {
  assert.equal(viewerPressCloses({ down: true, up: true }), true);
  // Drag from the picture to the dark area, or from the dark area onto the picture.
  assert.equal(viewerPressCloses({ down: false, up: true }), false);
  assert.equal(viewerPressCloses({ down: true, up: false }), false);
  // The Close button handles itself.
  assert.equal(
    viewerPressCloses({ down: true, up: true, onButton: true }),
    false,
  );
});

test('menu: only the click that ends the dismissing press is ignored', () => {
  assert.equal(sameMenuPress(1200.5, 1200.5), true);
  // A later press (even 50 ms later) opens the menu; so does a long hold that started earlier.
  assert.equal(sameMenuPress(1250.5, 1200.5), false);
  assert.equal(sameMenuPress(900, -1), false);
});

// ---------------------------------------------------------------------------------------------
// A small renderer for the real components: function components are called recursively with
// their own hook state per tree position; host elements become plain objects the tests inspect.
await loadBindings();
async function load(file, imports, globals) {
  const { code } = await transform(
    await readFile(new URL(`../${file}`, import.meta.url), 'utf8'),
    {
      filename: file,
      jsc: {
        parser: { syntax: 'ecmascript', jsx: true },
        target: 'es2022',
        transform: { react: { runtime: 'automatic' } },
      },
      module: { type: 'commonjs' },
    },
  );
  const exports = {};
  new Script(code, { filename: file }).runInContext(
    createContext({
      exports,
      // Every import must be listed: a wrong or new import fails the test instead of passing.
      require: (name) => {
        assert.ok(name in imports, `Unexpected import ${name} in ${file}`);
        return imports[name];
      },
      ...globals,
    }),
  );
  return exports;
}
// For imports the tested code loads but these tests do not exercise.
const unused = new Proxy(function () {}, {
  get: (_, name) => (name === '__esModule' ? true : unused),
  apply: () => unused,
});
const cssModule = {
  __esModule: true,
  default: new Proxy({}, { get: (_, name) => String(name) }),
};
const icons = new Proxy({}, { get: (_, name) => String(name) });
const Fragment = Symbol('Fragment');
const element = (type, props, key) => ({ type, props: props || {}, key });

function createRenderer() {
  const instances = new Map();
  const timers = new Map();
  let nextTimer = 1,
    clock = 0,
    current = null,
    effects = [],
    seen = new Set();
  function hookCell(init) {
    const i = current.cursor++;
    return (current.cells[i] ||= init());
  }
  const react = {
    // One provider at a time is enough here: the Provider sets the value its children read.
    createContext(initial) {
      const context = { current: initial };
      context.Provider = function Provider({ value, children }) {
        context.current = value;
        return children ?? null;
      };
      return context;
    },
    useContext: (context) => context.current,
    useState(initial) {
      const cell = hookCell(() => ({
        value: typeof initial === 'function' ? initial() : initial,
      }));
      cell.set ||= (next) => {
        cell.value = typeof next === 'function' ? next(cell.value) : next;
      };
      return [cell.value, cell.set];
    },
    useReducer(reducer, initial, init) {
      const cell = hookCell(() => ({ value: init ? init(initial) : initial }));
      cell.dispatch ||= (event) => {
        cell.value = reducer(cell.value, event);
      };
      return [cell.value, cell.dispatch];
    },
    useRef: (initial) => hookCell(() => ({ current: initial })),
    useCallback(fn, deps) {
      const cell = hookCell(() => ({ fn, deps }));
      if (deps.some((v, j) => !Object.is(v, cell.deps[j]))) {
        cell.fn = fn;
        cell.deps = deps;
      }
      return cell.fn;
    },
    useEffect(callback, deps) {
      const cell = hookCell(() => ({ deps: null }));
      if (
        !cell.ran ||
        !deps ||
        deps.some((v, j) => !Object.is(v, cell.deps[j]))
      ) {
        cell.ran = true;
        cell.deps = deps;
        effects.push(() => {
          cell.cleanup?.();
          cell.cleanup = callback();
        });
      }
    },
  };
  function walk(node, path, ancestors = {}) {
    if (node === null || node === undefined || node === false || node === true)
      return null;
    if (typeof node !== 'object') return node;
    if (Array.isArray(node))
      return node.map((child, i) =>
        walk(child, `${path}.${child?.key ?? i}`, ancestors),
      );
    const { type, props } = node;
    if (typeof type === 'function') {
      const id = `${path}<${type.name}>`;
      seen.add(id);
      const instance = instances.get(id) || { cells: [] };
      instances.set(id, instance);
      const previous = current;
      current = instance;
      instance.cursor = 0;
      const output = type(props);
      current = previous;
      return walk(output, `${id}/`, ancestors);
    }
    const disabled =
      ancestors.disabled || (type === 'fieldset' && props.disabled);
    const inert = ancestors.inert || props.inert;
    const children = walk(props.children, `${path}/${String(type)}`, {
      disabled,
      inert,
    });
    const host = { type, props: { ...props, children } };
    if (props.ref && typeof props.ref === 'object') {
      host.focused = 0;
      host.isConnected = true;
      host.disabled = !!props.disabled;
      host.matches = (selector) =>
        selector === ':disabled' && !!(disabled || props.disabled);
      host.closest = (selector) =>
        selector === '[inert]' && inert ? {} : null;
      host.contains = (target) =>
        host === target ||
        find(
          children,
          (node) =>
            node === target ||
            (target?.props?.id && node.props?.id === target.props.id),
        ).length > 0;
      host.focus = () => {
        if (!host.isConnected || host.disabled || disabled || inert) return;
        host.focused++;
        dom.active = host;
        dom.history.push(props['aria-label'] || props.id || type);
      };
      host.scrolled = 0;
      host.scrollIntoView = () => {
        host.scrolled++;
        dom.scrolledTo = host;
      };
      props.ref.current = host;
    }
    return host;
  }
  const dom = { active: null, history: [] };
  const listeners = new Map();
  const window = {
    setTimeout(fn, ms) {
      const id = nextTimer++;
      timers.set(id, { fn, at: clock + ms, ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval(fn, ms) {
      const id = nextTimer++;
      timers.set(id, { fn, at: clock + ms, ms, every: ms });
      return id;
    },
    clearInterval: (id) => timers.delete(id),
    // Runs on the next frame (16 ms of fake time), as in a browser, not immediately.
    requestAnimationFrame: (fn) => window.setTimeout(fn, 16),
    matchMedia: () => ({ matches: false }),
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    removeEventListener(name, fn) {
      listeners.get(name)?.delete(fn);
    },
    dispatchEvent(event) {
      for (const fn of listeners.get(event.type) || []) fn(event);
    },
    // Background loads of a refreshed photo link: the test decides when they finish.
    loads: [],
    Image: class {
      constructor() {
        window.loads.push(this);
      }
    },
  };
  return {
    react,
    window,
    dom,
    timers,
    render(make) {
      let tree;
      for (let pass = 0; pass < 4; pass++) {
        effects = [];
        seen = new Set();
        tree = walk(make(), 'root');
        for (const effect of effects) effect();
        for (const [id, instance] of instances)
          if (!seen.has(id)) {
            for (const cell of instance.cells) cell?.cleanup?.();
            instances.delete(id);
          }
      }
      return tree;
    },
    unmount() {
      for (const instance of instances.values())
        for (const cell of instance.cells) cell?.cleanup?.();
      instances.clear();
    },
    advance(ms) {
      clock += ms;
      for (const [id, timer] of [...timers])
        if (timer.at <= clock) {
          if (timer.every) timer.at += timer.every;
          else timers.delete(id);
          timer.fn();
        }
    },
  };
}
// Choose a menu item the way Radix does: onSelect, the menu closes, then onCloseAutoFocus
// runs; unless prevented, focus returns to the trigger (the cover icon). Then a frame passes.
function choose(h, label) {
  const tree = h.render();
  const item = find(
    tree,
    (n) => n.type === 'menuitem' && text(n.props.children) === label,
  )[0];
  assert.ok(item, `menu item ${label}`);
  item.props.onSelect();
  find(h.render(), (n) => n.type === 'menu-root')[0].props.onOpenChange(false);
  let prevented = false;
  find(h.render(), (n) => n.type === 'menu')[0].props.onCloseAutoFocus?.({
    preventDefault: () => (prevented = true),
  });
  if (!prevented)
    find(
      h.render(),
      (n) => n.type === 'button' && n.props['aria-label'],
    )[0]?.focus();
  h.r.advance(16);
  return h.render();
}

function find(tree, test, found = []) {
  if (!tree || typeof tree !== 'object') return found;
  if (Array.isArray(tree)) {
    for (const child of tree) find(child, test, found);
    return found;
  }
  if (test(tree)) found.push(tree);
  find(tree.props?.children, test, found);
  return found;
}
const text = (tree) =>
  !tree
    ? ''
    : typeof tree !== 'object'
      ? String(tree)
      : Array.isArray(tree)
        ? tree.map(text).join('')
        : text(tree.props?.children);
const flush = () => new Promise(setImmediate);

// Fake picture and backdrop targets for the viewer: the picture fills a 1000x500 box.
class FakeImage {
  naturalWidth = 1000;
  naturalHeight = 500;
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 1000, height: 500 };
  }
  closest() {
    return null;
  }
}
const picture = new FakeImage();
const backdrop = { closest: () => null };
const closeButton = {
  closest: (selector) => (selector === 'button' ? {} : null),
};
// What is under the pointer; a test can place another element there (e.g. the message panel).
let underPointer = null;
const at = (x, y) => underPointer ?? (x < 1000 && y < 500 ? picture : backdrop);

async function coverHarness({
  role = 'ADMIN',
  photo = true,
  settingsControls = false,
  onSaved,
  uploadFailure = false,
} = {}) {
  const r = createRenderer();
  const api = [];
  const passthrough = ({ children }) => children ?? null;
  const host = (name) =>
    function Host(props) {
      return element(name, props);
    };
  const radix = {
    Dialog: {
      Root: ({ open, children }) => (open ? children : null),
      Portal: passthrough,
      Overlay: host('overlay'),
      Content: host('dialog'),
      Title: host('h2'),
      Close: passthrough,
    },
    DropdownMenu: {
      Root: (props) => element('menu-root', props),
      Trigger: passthrough,
      Portal: passthrough,
      Content: host('menu'),
      Item: host('menuitem'),
    },
  };
  const upload = {
    upload: async () => {
      if (uploadFailure) throw new Error('Upload failed');
      return 'media-new';
    },
    frame: { x: 0.5, y: 0.5, zoom: 1 },
    selection: { name: 'new.jpg' },
    error: '',
    reset() {},
    invalidate() {},
  };
  const { DashboardCover } = await load(
    'apps/web/src/features/weddings/dashboard-cover.jsx',
    {
      'next/image': {
        __esModule: true,
        default: function Img(props) {
          return element('img', props);
        },
      },
      react: r.react,
      'react/jsx-runtime': { jsx: element, jsxs: element, Fragment },
      'react-dom': { createPortal: (node) => node },
      'next/navigation': { useRouter: () => ({ refresh() {} }) },
      'radix-ui': radix,
      'lucide-react': icons,
      '@/lib/api-client': {
        apiRequest(path, options = {}) {
          const deferred = Promise.withResolvers();
          api.push({ path, method: options.method || 'GET', ...deferred });
          return deferred.promise;
        },
      },
      './use-cover-upload': { useCoverUpload: () => upload },
      './cover-editor': { CoverEditor: host('cover-editor') },
      './cover-data': coverData,
      './cover.module.css': cssModule,
    },
    {
      window: r.window,
      document: { elementFromPoint: at },
      AbortController,
      HTMLImageElement: FakeImage,
      setInterval: r.window.setInterval,
      clearInterval: r.window.clearInterval,
    },
  );
  const wedding = {
    id: 'w1',
    version: 3,
    coverMediaId: photo ? 'media-1' : null,
    coverFrame: { x: 0.5, y: 0.5, zoom: 1 },
  };
  const membership = { role };
  const render = () =>
    r.render(() =>
      element(DashboardCover, {
        wedding,
        membership,
        children: settingsControls ? undefined : element('details', {}),
        settingsControls,
        onSaved,
      }),
    );
  return { r, api, render };
}

test('Settings cover controls remove independently, lock duplicate saves and reject callbacks after unmount', async () => {
  const saved = [];
  const h = await coverHarness({
    settingsControls: true,
    onSaved: (data) => saved.push(data),
  });
  const remove = find(
    h.render(),
    (n) => n.props['aria-label'] === 'Remove Cover',
  )[0];
  const pending = remove.props.onClick();
  remove.props.onClick();
  assert.equal(h.api.filter((r) => r.method === 'DELETE').length, 1);
  assert.equal(
    find(h.render(), (n) => n.props['aria-label'] === 'Remove Cover')[0].props
      .disabled,
    true,
  );
  h.api
    .find((r) => r.method === 'DELETE')
    .resolve({
      data: {
        wedding: { id: 'w1', version: 4, coverMediaId: null },
        membership: { role: 'ADMIN' },
      },
    });
  await pending;
  assert.equal(saved.length, 1);
  assert.equal(
    find(h.render(), (n) => n.props['aria-label'] === 'Remove Cover')[0].props
      .disabled,
    true,
  );
  h.r.unmount();
  const stale = await coverHarness({
    settingsControls: true,
    onSaved: (data) => saved.push(data),
  });
  const request = find(
    stale.render(),
    (n) => n.props['aria-label'] === 'Remove Cover',
  )[0].props.onClick();
  stale.r.unmount();
  stale.api
    .find((r) => r.method === 'DELETE')
    .resolve({
      data: {
        wedding: { id: 'w1', version: 4 },
        membership: { role: 'ADMIN' },
      },
    });
  await request;
  assert.equal(
    saved.length,
    1,
    'unmounted cover never updates a different session',
  );
});

test('Settings has no cover mutations for Family/Viewer and exposes removal conflicts outside the editor', async () => {
  for (const role of ['FAMILY_MEMBER', 'VIEWER']) {
    const h = await coverHarness({ role, settingsControls: true });
    assert.equal(
      find(
        h.render(),
        (n) =>
          n.type === 'button' &&
          ['Remove Cover', 'Change Cover'].includes(
            n.props['aria-label'] || text(n),
          ),
      ).length,
      0,
    );
    h.r.unmount();
  }
  const h = await coverHarness({ settingsControls: true });
  const pending = find(
    h.render(),
    (n) => n.props['aria-label'] === 'Remove Cover',
  )[0].props.onClick();
  h.api
    .find((r) => r.method === 'DELETE')
    .reject(
      Object.assign(new Error('The cover changed.'), {
        code: 'VERSION_CONFLICT',
      }),
    );
  await pending;
  assert.match(text(h.render()), /The cover changed/);
  assert.match(text(h.render()), /Reload current cover/);
  h.r.unmount();
});
test('Settings cover Cancel returns keyboard focus to Change Cover', async () => {
  const h = await coverHarness({ settingsControls: true });
  find(
    h.render(),
    (n) => n.type === 'button' && text(n) === 'Change Cover',
  )[0].props.onClick();
  h.r.advance(16);
  find(
    h.render(),
    (n) => n.type === 'button' && text(n) === 'Cancel',
  )[0].props.onClick();
  h.render();
  h.r.advance(16);
  assert.equal(text(h.r.dom.active), 'Change Cover');
  h.r.unmount();
});

// The visible banner photo, and every photo layer (a refreshed link loads in a hidden layer).
const photoImg = (tree) =>
  find(
    tree,
    (n) => n.type === 'img' && n.props.alt === 'Your wedding cover',
  )[0];
const layers = (tree) =>
  find(
    tree,
    (n) =>
      n.type === 'img' &&
      n.props.src?.startsWith('https://r2.test/') &&
      n.props.className === 'photo',
  );
const layer = (tree, url) => layers(tree).find((n) => n.props.src === url);
const items = (tree) =>
  find(tree, (n) => n.type === 'menuitem').map((n) => text(n.props.children));
const icon = (tree) =>
  find(tree, (n) => n.type === 'button' && n.props['aria-label'])[0];
const liveRegion = (tree) =>
  find(tree, (n) => n.type === 'p' && n.props.role === 'status')[0];

async function loadedPhoto(h) {
  let tree = h.render();
  const media = h.api.find(
    (call) => call.path === '/weddings/w1/media/media-1',
  );
  media.resolve({ data: { url: 'https://r2.test/photo-1' } });
  await flush();
  tree = h.render();
  // Before it loads the photo is a hidden layer under "Loading your wedding cover…".
  assert.equal(photoImg(tree), undefined);
  layer(tree, 'https://r2.test/photo-1').props.onLoad();
  return h.render();
}

test('rendered cover menu follows the role and only offers View photo once loaded', async () => {
  for (const [role, label, expected] of [
    ['ADMIN', 'Cover photo options', ['View photo', 'Change cover']],
    ['FAMILY_MEMBER', 'View cover photo', ['View photo']],
    ['VIEWER', 'View cover photo', ['View photo']],
  ]) {
    const h = await coverHarness({ role });
    const before = h.render();
    // Photo link not loaded yet: Admins can only change, others see no control at all.
    assert.deepEqual(items(before), role === 'ADMIN' ? ['Change cover'] : []);
    const tree = await loadedPhoto(h);
    assert.equal(icon(tree).props['aria-label'], label);
    assert.deepEqual(items(tree), expected);
    h.r.unmount();
  }
  // Signature artwork: Family members have no control; Admins can only change.
  const family = await coverHarness({ role: 'FAMILY_MEMBER', photo: false });
  assert.equal(icon(family.render()), undefined);
  const admin = await coverHarness({ role: 'ADMIN', photo: false });
  assert.deepEqual(items(admin.render()), ['Change cover']);
});

test('photo link refresh: failures keep the shown photo; a working link swaps in once loaded', async () => {
  const h = await coverHarness({ role: 'VIEWER' });
  let tree = await loadedPhoto(h);
  const refresh = async (outcome) => {
    h.r.advance(240000);
    h.render();
    const call = h.api.at(-1);
    assert.equal(call.path, '/weddings/w1/media/media-1');
    if (outcome instanceof Error) call.reject(outcome);
    else call.resolve({ data: { url: outcome } });
    await flush();
    return h.render();
  };
  assert.equal(photoImg(tree).props.src, 'https://r2.test/photo-1');
  // 1) The link request itself fails (network blip): photo and View photo stay.
  tree = await refresh(new Error('Could not reach the API.'));
  assert.equal(photoImg(tree).props.src, 'https://r2.test/photo-1');
  assert.deepEqual(items(tree), ['View photo']);
  assert.ok(!text(tree).includes('temporarily unavailable'));
  // 2) A new link arrives but the picture fails to load: the hidden layer is dropped, the
  // shown photo stays.
  tree = await refresh('https://r2.test/photo-2');
  assert.equal(photoImg(tree).props.src, 'https://r2.test/photo-1');
  assert.equal(layer(tree, 'https://r2.test/photo-2').props.style.opacity, 0);
  layer(tree, 'https://r2.test/photo-2').props.onError();
  tree = h.render();
  assert.deepEqual(
    layers(tree).map((n) => n.props.src),
    ['https://r2.test/photo-1'],
  );
  assert.deepEqual(items(tree), ['View photo']);
  // 3) A working link: it becomes the visible photo only after it has loaded, as the same
  // layer (same key), so the picture is downloaded once.
  tree = await refresh('https://r2.test/photo-3');
  const hidden = layer(tree, 'https://r2.test/photo-3');
  assert.equal(hidden.props.style.opacity, 0);
  hidden.props.onLoad();
  tree = h.render();
  assert.deepEqual(
    layers(tree).map((n) => n.props.src),
    ['https://r2.test/photo-3'],
  );
  assert.equal(photoImg(tree).props.src, 'https://r2.test/photo-3');
  // 4) Later, the photo on screen itself fails: the unavailable state with Retry appears.
  photoImg(tree).props.onError();
  tree = h.render();
  assert.ok(
    text(tree).includes('Your saved photo is temporarily unavailable.'),
  );
  assert.deepEqual(items(tree), []);
  h.r.unmount();
});

test('viewer: rendered press handling, including touch and the Close button', async () => {
  const h = await coverHarness({ role: 'FAMILY_MEMBER' });
  let tree = await loadedPhoto(h);
  const openViewer = () => {
    find(
      h.render(),
      (n) => n.type === 'menuitem' && text(n.props.children) === 'View photo',
    )[0].props.onSelect();
    return find(h.render(), (n) => n.type === 'dialog')[0];
  };
  const press = (dialog, down, up, clickTarget, upTarget = at(...up)) => {
    dialog.props.onPointerDown({
      target: at(...down),
      clientX: down[0],
      clientY: down[1],
    });
    dialog.props.onPointerUp({
      target: upTarget,
      clientX: up[0],
      clientY: up[1],
    });
    dialog.props.onClick({ target: clickTarget });
    return !!find(h.render(), (n) => n.type === 'dialog')[0];
  };
  let dialog = openViewer();
  assert.ok(dialog, 'viewer open');
  // Dark area to picture, picture to dark area, and a click on the picture: stays open.
  assert.equal(press(dialog, [1100, 600], [500, 250], backdrop), true);
  assert.equal(press(dialog, [500, 250], [1100, 600], backdrop), true);
  assert.equal(press(dialog, [500, 250], [500, 250], picture), true);
  // Touch: events stay on the first-pressed element, but the finger lifted on the picture.
  assert.equal(
    press(dialog, [1100, 600], [500, 250], backdrop, backdrop),
    true,
  );
  // The Close button handles itself.
  assert.equal(press(dialog, [1100, 600], [1100, 600], closeButton), true);
  // Press and release on the dark area: closes.
  assert.equal(press(dialog, [1100, 600], [1150, 620], backdrop), false);
  void tree;
  h.r.unmount();
});

test('banner: if the shown photo breaks while a newer link is loading, the newer one takes over', async () => {
  const h = await coverHarness({ role: 'VIEWER' });
  let tree = await loadedPhoto(h);
  h.r.advance(240000);
  h.render();
  h.api.at(-1).resolve({ data: { url: 'https://r2.test/photo-2' } });
  await flush();
  tree = h.render();
  photoImg(tree).props.onError();
  tree = h.render();
  // No "unavailable" state: it waits for the newer photo, which then becomes visible.
  assert.ok(!text(tree).includes('temporarily unavailable'));
  assert.ok(text(tree).includes('Loading your wedding cover'));
  layer(tree, 'https://r2.test/photo-2').props.onLoad();
  tree = h.render();
  assert.equal(photoImg(tree).props.src, 'https://r2.test/photo-2');
  h.r.unmount();
});

test('viewer: an expired photo link is renewed once by itself, then offers Retry', async () => {
  const h = await coverHarness({ role: 'FAMILY_MEMBER' });
  await loadedPhoto(h);
  const viewer = () => find(h.render(), (n) => n.type === 'dialog')[0];
  const viewerImg = () => find(viewer(), (n) => n.type === 'img')[0];
  const mediaCall = () => h.api.at(-1);
  choose(h, 'View photo');
  assert.equal(viewerImg().props.src, 'https://r2.test/photo-1');
  // The photo fails (expired link): a fresh link is fetched by itself.
  viewerImg().props.onError();
  assert.ok(text(viewer()).includes('Loading the full photo'));
  assert.equal(mediaCall().path, '/weddings/w1/media/media-1');
  mediaCall().resolve({ data: { url: 'https://r2.test/photo-9' } });
  await flush();
  assert.equal(viewerImg().props.src, 'https://r2.test/photo-9');
  // The fresh link fails too: a clear message with Retry, never a broken image.
  viewerImg().props.onError();
  assert.ok(text(viewer()).includes("Couldn't load the full photo."));
  assert.equal(viewerImg(), undefined);
  // Keyboard focus moves to Retry.
  assert.equal(text(h.r.dom.active?.props.children), 'Retry');
  // A click on the message panel (not the dark area) keeps the viewer open.
  const panel = {
    closest: (sel) => (sel === '[data-viewer-message]' ? {} : null),
  };
  // (Outside the picture's box, so only the panel rule can keep it open.)
  const dialog = viewer();
  underPointer = panel;
  dialog.props.onPointerDown({ target: panel, clientX: 1100, clientY: 600 });
  dialog.props.onPointerUp({ target: panel, clientX: 1100, clientY: 600 });
  dialog.props.onClick({ target: panel });
  underPointer = null;
  assert.ok(viewer(), 'still open after clicking the message');
  const retry = () =>
    find(
      viewer(),
      (n) => n.type === 'button' && text(n.props.children) === 'Retry',
    )[0];
  // Retry while the API is down: still the message.
  retry().props.onClick();
  mediaCall().reject(new Error('Could not reach the API.'));
  await flush();
  assert.ok(text(viewer()).includes("Couldn't load the full photo."));
  // Retry when it works: the photo shows.
  retry().props.onClick();
  mediaCall().resolve({ data: { url: 'https://r2.test/photo-10' } });
  await flush();
  assert.equal(viewerImg().props.src, 'https://r2.test/photo-10');
  // A late answer from an older attempt never changes a viewer opened afterwards.
  choose(h, 'View photo');
  viewerImg().props.onError();
  const late = mediaCall();
  assert.ok(
    text(viewer()).includes('Loading the full photo'),
    'request pending',
  );
  choose(h, 'View photo');
  late.reject(new Error('late'));
  await flush();
  assert.ok(!text(viewer()).includes("Couldn't load"));
  assert.ok(viewerImg(), 'the newly opened viewer shows the photo');
  h.r.unmount();
});

test('Save shows the toast and returns focus to the icon; a failed save shows no toast', async () => {
  const h = await coverHarness({ role: 'ADMIN' });
  let tree = await loadedPhoto(h);
  // Change cover (in the order Radix runs it): focus lands on the editor heading, not the icon.
  h.r.dom.history = [];
  tree = choose(h, 'Change cover');
  assert.equal(h.r.dom.active?.props.id, 'change-cover-heading');
  assert.equal(h.r.dom.scrolledTo?.props.id, 'change-cover-heading');
  // Focus goes straight to the heading; it never stops on the icon on the way.
  assert.deepEqual(h.r.dom.history, ['change-cover-heading']);
  // Change cover again while the editor is already open: focus goes back to the heading.
  h.r.dom.active = null;
  tree = choose(h, 'Change cover');
  assert.equal(h.r.dom.active?.props.id, 'change-cover-heading');
  const saveButton = () =>
    find(
      h.render(),
      (n) =>
        n.type === 'button' && text(n.props.children) === 'Save wedding cover',
    )[0];
  // A failed save: the error shows inside the editor and no toast is announced.
  saveButton().props.onClick();
  await flush();
  h.api.at(-1).reject(Object.assign(new Error('The API request failed.'), {}));
  await flush();
  tree = h.render();
  assert.equal(liveRegion(tree).props.children, '');
  assert.ok(text(tree).includes('The API request failed.'));
  // A successful save.
  saveButton().props.onClick();
  await flush();
  const put = h.api.at(-1);
  assert.equal(put.method, 'PUT');
  put.resolve({
    data: {
      wedding: {
        id: 'w1',
        version: 4,
        coverMediaId: 'media-new',
        coverFrame: {},
      },
    },
  });
  await flush();
  h.r.advance(16);
  tree = h.render();
  assert.match(
    liveRegion(tree).props.children,
    /^Cover saved\. Your wedding cover is updated\./,
  );
  assert.equal(
    h.r.dom.active?.props['aria-label'],
    'Cover photo options',
    'focus is back on the cover icon',
  );
  assert.equal(
    find(tree, (n) => n.props?.id === 'change-cover-heading').length,
    0,
    'editor closed',
  );
  // The same words again (a second save within 2 s) still change the live text, so screen
  // readers announce it again.
  const firstText = liveRegion(tree).props.children;
  choose(h, 'Change cover');
  saveButton().props.onClick();
  await flush();
  h.api.at(-1).resolve({
    data: {
      wedding: {
        id: 'w1',
        version: 5,
        coverMediaId: 'media-new',
        coverFrame: {},
      },
    },
  });
  await flush();
  tree = h.render();
  const secondText = liveRegion(tree).props.children;
  assert.match(secondText, /^Cover saved\. Your wedding cover is updated\./);
  assert.notEqual(secondText, firstText);
  assert.equal(
    secondText,
    `${firstText}\u00a0`,
    'only a non-breaking space differs',
  );
  h.r.unmount();
});

test('conflict: Reload shows the note in view; Cancel then reopening starts fresh', async () => {
  const h = await coverHarness({ role: 'ADMIN' });
  await loadedPhoto(h);
  const button = (label) =>
    find(
      h.render(),
      (n) => n.type === 'button' && text(n.props.children) === label,
    )[0];
  choose(h, 'Change cover');
  // Someone else changed the wedding: the remove is refused with a version conflict.
  button('Remove photo · use signature cover').props.onClick();
  await flush();
  h.api.at(-1).reject(
    Object.assign(new Error('This wedding changed elsewhere.'), {
      code: 'VERSION_CONFLICT',
    }),
  );
  await flush();
  assert.ok(button('Reload current cover'), 'conflict offers Reload');
  assert.equal(
    button('Remove photo · use signature cover').props.disabled,
    true,
  );
  // Reload: the note appears inside the editor and is scrolled into view.
  button('Reload current cover').props.onClick();
  h.api.at(-1).resolve({
    data: {
      wedding: {
        id: 'w1',
        version: 4,
        coverMediaId: 'media-1',
        coverFrame: {},
      },
    },
  });
  await flush();
  const tree = h.render();
  assert.ok(text(tree).includes('Current cover loaded.'));
  assert.ok(
    text(h.r.dom.scrolledTo).startsWith('Current cover loaded.'),
    'note scrolled into view',
  );
  // A new conflict, then Cancel and reopen: no leftover Reload button, actions usable.
  button('Remove photo · use signature cover').props.onClick();
  await flush();
  h.api
    .at(-1)
    .reject(
      Object.assign(new Error('Changed again.'), { code: 'VERSION_CONFLICT' }),
    );
  await flush();
  button('Cancel').props.onClick();
  choose(h, 'Change cover');
  assert.equal(button('Reload current cover'), undefined);
  assert.equal(
    button('Remove photo · use signature cover').props.disabled,
    false,
  );
  assert.ok(!text(h.render()).includes('Current cover loaded.'));
  h.r.unmount();
});

test('viewer closes when the photo becomes unavailable and does not reopen by itself', async () => {
  const h = await coverHarness({ role: 'VIEWER' });
  await loadedPhoto(h);
  const viewer = () => find(h.render(), (n) => n.type === 'dialog')[0];
  choose(h, 'View photo');
  assert.ok(viewer());
  // The banner photo itself breaks: unavailable state, viewer closes.
  photoImg(h.render()).props.onError();
  assert.equal(viewer(), undefined);
  // Retry loading photo brings the photo back, but the viewer stays closed.
  find(
    h.render(),
    (n) =>
      n.type === 'button' && text(n.props.children) === 'Retry loading photo',
  )[0].props.onClick();
  h.render();
  h.api.at(-1).resolve({ data: { url: 'https://r2.test/photo-5' } });
  await flush();
  layer(h.render(), 'https://r2.test/photo-5').props.onLoad();
  assert.ok(photoImg(h.render()), 'photo is back');
  assert.equal(viewer(), undefined, 'viewer did not reopen by itself');
  h.r.unmount();
});

test('menu items stay fixed while open, even if the photo finishes loading meanwhile', async () => {
  const h = await coverHarness({ role: 'ADMIN' });
  h.render();
  const root = () => find(h.render(), (n) => n.type === 'menu-root')[0];
  // Opened before the photo has loaded: only Change cover.
  root().props.onOpenChange(true);
  assert.deepEqual(items(h.render()), ['Change cover']);
  // The photo loads while the menu is open: no item is inserted above the highlight.
  h.api
    .find((call) => call.path === '/weddings/w1/media/media-1')
    .resolve({ data: { url: 'https://r2.test/photo-1' } });
  await flush();
  layer(h.render(), 'https://r2.test/photo-1').props.onLoad();
  assert.deepEqual(items(h.render()), ['Change cover']);
  // Next time it opens, it shows both.
  root().props.onOpenChange(false);
  root().props.onOpenChange(true);
  assert.deepEqual(items(h.render()), ['View photo', 'Change cover']);
  h.r.unmount();
});

test('an open menu closes if the photo becomes unavailable meanwhile', async () => {
  const h = await coverHarness({ role: 'VIEWER' });
  await loadedPhoto(h);
  const root = () => find(h.render(), (n) => n.type === 'menu-root')[0];
  root().props.onOpenChange(true);
  assert.deepEqual(items(h.render()), ['View photo']);
  // The banner photo breaks while the menu is open: no dead "View photo" left open.
  photoImg(h.render()).props.onError();
  assert.equal(root(), undefined, 'menu gone (no control without a photo)');
  h.r.unmount();
});

test('the dismissing press does not reopen the menu; the next press does', async () => {
  const h = await coverHarness({ role: 'VIEWER' });
  let tree = await loadedPhoto(h);
  const root = () => find(h.render(), (n) => n.type === 'menu-root')[0];
  const hit = () =>
    find(h.render(), (n) => n.props?.className === 'coverHit')[0];
  root().props.onOpenChange(true);
  assert.equal(root().props.open, true);
  // A press on the photo outside the open menu: the menu closes on pointerdown...
  find(h.render(), (n) => n.type === 'menu')[0].props.onPointerDownOutside({
    detail: { originalEvent: { timeStamp: 500 } },
  });
  hit().props.onPointerDown({ timeStamp: 500 });
  root().props.onOpenChange(false);
  // ...and the click that ends that same press must not reopen it.
  hit().props.onClick();
  assert.equal(root().props.open, false);
  // A new press opens it.
  hit().props.onPointerDown({ timeStamp: 900 });
  hit().props.onClick();
  assert.equal(root().props.open, true);
  void tree;
  h.r.unmount();
});

test('toast: hidden after 2 seconds; a second save restarts the timer; repeats are re-announced', async () => {
  const r = createRenderer();
  const { CoverToast } = await load(
    'apps/web/src/features/weddings/dashboard-cover.jsx',
    {
      'next/image': unused,
      react: r.react,
      'react/jsx-runtime': { jsx: element, jsxs: element, Fragment },
      'react-dom': { createPortal: (node) => node },
      'next/navigation': unused,
      'radix-ui': unused,
      'lucide-react': icons,
      '@/lib/api-client': unused,
      './use-cover-upload': unused,
      './cover-editor': unused,
      './cover-data': coverData,
      './cover.module.css': cssModule,
    },
    { window: r.window, document: {} },
  );
  let done = 0;
  const onDone = () => done++;
  const first = {
    title: 'Cover saved',
    text: 'Your wedding cover is updated.',
    marker: '',
  };
  const tree = r.render(() => element(CoverToast, { toast: first, onDone }));
  assert.equal(
    liveRegion(tree).props.children,
    'Cover saved. Your wedding cover is updated.',
  );
  assert.equal([...r.timers.values()][0].ms, 2000);
  r.advance(1500);
  assert.equal(done, 0);
  // The same words again within 2 s: the marker makes it a change, and the timer restarts.
  const again = { ...first, marker: '​' };
  const repeat = r.render(() => element(CoverToast, { toast: again, onDone }));
  assert.notEqual(
    liveRegion(repeat).props.children,
    liveRegion(tree).props.children,
  );
  r.advance(1500);
  assert.equal(done, 0, 'old timer was cleared');
  r.advance(500);
  assert.equal(done, 1, 'hidden 2 s after the latest save');
  r.unmount();
  assert.equal(r.timers.size, 0, 'unmount leaves no timer');
});

test('sidebar count: 15 s limit, one quick retry per hiccup spell, none after "no access", 30 s focus gap', async () => {
  for (const status of [503, 0, 403]) {
    const r = createRenderer();
    const requests = [];
    const listeners = {};
    r.window.addEventListener = (name, fn) => (listeners[name] = fn);
    let now = 1_000_000;
    const { useMemberCount } = await load(
      'apps/web/src/components/layout/app-shell.jsx',
      {
        'next/link': unused,
        react: r.react,
        'react/jsx-runtime': { jsx: element, jsxs: element, Fragment },
        'next/navigation': unused,
        'radix-ui': unused,
        'lucide-react': icons,
        '@/components/ui/button': unused,
        '@/components/ui/sheet': unused,
        '@/lib/navigation': unused,
        '@/features/home/brand': unused,
        '@/features/home/fonts': unused,
        '@/features/weddings/form-data': unused,
        '@/features/auth/session-provider': unused,
        '@/features/profile/avatar-photo': unused,
        '@/lib/api-client': {
          apiRequest(path, options) {
            const deferred = Promise.withResolvers();
            requests.push({ path, options, ...deferred });
            return deferred.promise;
          },
        },
        '@/features/dashboard/dashboard-data': dashboardData,
        './workspace.module.css': cssModule,
      },
      {
        window: r.window,
        AbortController,
        Date: class extends Date {
          static now() {
            return now;
          }
        },
      },
    );
    function Probe() {
      return element('count', { value: useMemberCount('u1', 'w1') });
    }
    const count = () => r.render(() => element(Probe, {})).props.value;
    const quickRetries = () =>
      [...r.timers.values()].filter((timer) => timer.ms === 5000).length;
    const fail = async (i) => {
      requests[i].reject(Object.assign(new Error('x'), { status }));
      await flush();
      return count();
    };
    count();
    assert.equal(requests[0].options.timeoutMs, 15000);
    assert.equal(await fail(0), null, 'nothing to show yet');
    if (status === 403) {
      assert.equal(quickRetries(), 0, 'no retry after "no access"');
      r.unmount();
      continue;
    }
    assert.equal(quickRetries(), 1, `one retry after status ${status}`);
    r.advance(5000);
    count();
    assert.equal(requests.length, 2, 'the retry request went out');
    await fail(1);
    assert.equal(quickRetries(), 0, 'only one quick retry per hiccup spell');
    // Focus within 30 s of the last request start does nothing; at 30 s it recounts.
    now += 29999;
    listeners.focus();
    count();
    assert.equal(requests.length, 2);
    now += 1;
    listeners.focus();
    count();
    assert.equal(requests.length, 3, 'focus at 30 s recounts');
    // A good count resets the spell: the next hiccup gets a fresh quick retry.
    requests[2].resolve({ data: { counts: { ALL: 4 } } });
    await flush();
    assert.equal(count(), 4);
    now += 30000;
    listeners.focus();
    count();
    assert.equal(await fail(3), 4, 'a hiccup keeps the last count');
    assert.equal(quickRetries(), 1, 'fresh retry after a success');
    r.unmount();
  }
});

test('rendered 404 note: Retry shows Retrying… and the numbers come back', async () => {
  const r = createRenderer();
  const requests = [];
  const live = { user: { id: 'u1' }, wedding: { id: 'w'.repeat(24) } };
  const { TaskSummaryProvider, RefreshNotice } = await load(
    'apps/web/src/features/dashboard/task-summary.jsx',
    {
      react: r.react,
      'react/jsx-runtime': { jsx: element, jsxs: element, Fragment },
      'next/link': { __esModule: true, default: 'a' },
      'lucide-react': icons,
      '@/lib/api-client': {
        apiRequest(path, options) {
          const deferred = Promise.withResolvers();
          requests.push({ path, options, ...deferred });
          return deferred.promise;
        },
      },
      '@/features/auth/session-provider': { useSession: () => live },
      '@/features/tasks/form-data': { taskPriorities: [] },
      '@/features/events/form-data': {
        eventDate: () => '',
        eventRange: () => '',
        eventStatuses: [],
      },
      './dashboard-data': dashboardData,
      './workspace-ui.module.css': cssModule,
    },
    {
      window: r.window,
      document: { visibilityState: 'visible' },
      AbortController,
    },
  );
  const render = () =>
    r.render(() =>
      element(TaskSummaryProvider, {
        userId: 'u1',
        weddingId: 'w'.repeat(24),
        children: element(RefreshNotice, {}),
      }),
    );
  const note = () =>
    find(render(), (n) => n.type === 'p' && n.props.role === 'alert')[0];
  render();
  requests[0].reject(Object.assign(new Error('x'), { status: 404 }));
  await flush();
  assert.ok(text(note()).startsWith('This wedding is no longer available.'));
  const retry = () => find(note(), (n) => n.type === 'button')[0];
  assert.equal(text(retry().props.children), 'Retry');
  retry().props.onClick();
  assert.equal(text(retry().props.children), 'Retrying…');
  assert.equal(retry().props.disabled, true);
  requests[1].resolve({ data: { counts: { total: 4 } } });
  await flush();
  assert.equal(note(), undefined, 'note gone once the numbers are back');
  r.unmount();
});

async function overviewHarness(role = 'ADMIN') {
  const r = createRenderer(),
    api = [];
  let rechecks = 0;
  let clock = Date.now();
  const session = {
    user: { id: 'u1' },
    wedding: { id: 'w1', mainDate: '2027-01-01' },
    membership: { role },
    retrySession: () => rechecks++,
  };
  const { SettingsOverview, settingsCountdown } = await load(
    'apps/web/src/features/weddings/settings-overview.jsx',
    {
      react: r.react,
      'react/jsx-runtime': { jsx: element, jsxs: element, Fragment },
      'lucide-react': icons,
      '@/lib/api-client': {
        apiRequest(path, options) {
          const request = { path, options, ...Promise.withResolvers() };
          api.push(request);
          return request.promise;
        },
      },
      './form-data': weddingFormData,
    },
    {
      window: r.window,
      document: { visibilityState: 'visible' },
      AbortController,
      Date: class extends Date {
        static now() {
          return clock;
        }
      },
    },
  );
  const render = () => r.render(() => element(SettingsOverview, { session }));
  return {
    r,
    api,
    session,
    render,
    settingsCountdown,
    advance: (ms) => {
      clock += ms;
      r.advance(ms);
    },
    rechecks: () => rechecks,
  };
}

test('Settings overview retains real figures on transient failures, retries, and clears them on denial', async () => {
  const h = await overviewHarness();
  assert.match(text(h.render()), /Loading…/);
  const data = {
    role: 'ADMIN',
    collaborators: 4,
    pendingInvites: 2,
    ceremonies: 3,
    tasks: { total: 8, completed: 2, progress: 25 },
  };
  h.api[0].resolve({ data });
  await flush();
  assert.match(text(h.render()), /4 Active/);
  h.advance(60000);
  h.render();
  h.api[1].reject(new Error('Disconnected'));
  await flush();
  assert.match(text(h.render()), /4 Active/);
  const retry = find(h.render(), (n) => n.type === 'button')[0];
  retry.props.onClick();
  h.render();
  assert.match(text(h.render()), /Retrying…/);
  h.api[2].reject(Object.assign(new Error('Removed'), { status: 403 }));
  await flush();
  assert.doesNotMatch(text(h.render()), /4 Active|2 Pending/);
  assert.equal(h.rechecks(), 1);
  assert.match(text(h.render()), /Unavailable/);
  h.r.unmount();
});

test('Settings overview restricts invitation totals and ignores stale or mismatched-role responses', async () => {
  const h = await overviewHarness('VIEWER');
  assert.match(text(h.render()), /Admin only/);
  h.api[0].resolve({
    data: { role: 'ADMIN', pendingInvites: 999, collaborators: 99 },
  });
  await flush();
  assert.doesNotMatch(text(h.render()), /999|99 Active/);
  assert.equal(h.rechecks(), 1);
  h.r.unmount();
  const old = await overviewHarness();
  old.render();
  old.r.unmount();
  assert.equal(old.api[0].options.signal.aborted, true);
  old.api[0].resolve({ data: { role: 'ADMIN', pendingInvites: 999 } });
  await flush();
  assert.equal(old.rechecks(), 0);
});

test('Settings countdown uses India calendar days across midnight, including today and past dates', async () => {
  const h = await overviewHarness();
  assert.equal(
    h.settingsCountdown('2027-01-01', new Date('2026-12-31T18:29:59Z')),
    '1 Day',
  );
  assert.equal(
    h.settingsCountdown('2027-01-01', new Date('2026-12-31T18:30:00Z')),
    'Today',
  );
  assert.equal(
    h.settingsCountdown('2027-01-01', new Date('2027-01-01T18:30:00Z')),
    '1 day since',
  );
  h.r.unmount();
});

test('cover completion focuses only after controls are enabled in the committed render', async () => {
  for (const remove of [false, true]) {
    const h = await coverHarness({ settingsControls: true });
    if (!remove)
      find(
        h.render(),
        (n) => n.type === 'button' && text(n) === 'Change Cover',
      )[0].props.onClick();
    const button = find(h.render(), (n) =>
      remove
        ? n.props['aria-label'] === 'Remove Cover'
        : n.type === 'button' && text(n) === 'Save wedding cover',
    )[0];
    const pending = button.props.onClick();
    await flush();
    h.render();
    h.r.advance(3000);
    h.render();
    h.r.dom.active = null;
    h.api
      .find((r) => r.method === (remove ? 'DELETE' : 'PUT'))
      .resolve({
        data: {
          wedding: {
            id: 'w1',
            version: 4,
            coverMediaId: remove ? null : 'media-new',
          },
          membership: { role: 'ADMIN' },
        },
      });
    await pending;
    h.r.advance(16);
    assert.equal(
      h.r.dom.active,
      null,
      'old disabled controls must not receive focus before commit',
    );
    h.render();
    assert.equal(text(h.r.dom.active), 'Change Cover');
    const count = h.r.dom.history.length;
    h.render();
    assert.equal(h.r.dom.history.length, count);
    h.r.unmount();
  }
});

test('failed uploads and cover conflicts focus visible recovery, then Reload focuses its mounted result', async () => {
  const failed = await coverHarness({
    settingsControls: true,
    uploadFailure: true,
  });
  find(
    failed.render(),
    (n) => n.type === 'button' && text(n) === 'Change Cover',
  )[0].props.onClick();
  await find(
    failed.render(),
    (n) => n.type === 'button' && text(n) === 'Save wedding cover',
  )[0].props.onClick();
  failed.render();
  assert.equal(failed.r.dom.active.props.role, 'alert');
  assert.match(text(failed.r.dom.active), /Upload failed/);
  assert.equal(
    failed.api.some((r) => r.method === 'PUT'),
    false,
  );
  failed.r.unmount();
  const h = await coverHarness({ settingsControls: true });
  const pending = find(
    h.render(),
    (n) => n.props['aria-label'] === 'Remove Cover',
  )[0].props.onClick();
  h.render();
  h.api
    .find((r) => r.method === 'DELETE')
    .reject(
      Object.assign(new Error('Wedding details or the cover changed.'), {
        code: 'VERSION_CONFLICT',
      }),
    );
  await pending;
  h.render();
  assert.equal(text(h.r.dom.active), 'Reload current cover');
  const failedReload = h.r.dom.active.props.onClick();
  h.render();
  h.api.at(-1).reject(new Error('Current cover could not be loaded'));
  await failedReload;
  let tree = h.render();
  assert.equal(h.r.dom.active.props.role, 'alert');
  assert.match(text(h.r.dom.active), /Current cover could not be loaded/);
  assert.equal(
    find(tree, (n) => n.props['aria-label'] === 'Remove Cover')[0].props
      .disabled,
    true,
    'failed Reload must retain the conflict lock',
  );
  const history = h.r.dom.history.length;
  tree = h.render();
  assert.equal(h.r.dom.history.length, history, 'focus only once per result');
  find(
    tree,
    (n) => n.type === 'button' && text(n) === 'Reload current cover',
  )[0].focus();
  const reload = h.r.dom.active.props.onClick();
  h.render();
  h.api.at(-1).resolve({
    data: {
      wedding: { id: 'w1', version: 5, coverMediaId: 'media-1' },
      membership: { role: 'ADMIN' },
    },
  });
  await reload;
  h.render();
  assert.equal(h.r.dom.active.props.role, 'status');
  assert.match(text(h.r.dom.active), /Current cover loaded/);
  h.r.unmount();
});

test('later session failures focus the external alert only when displacing draft focus', async () => {
  for (const location of ['draft', 'outside', 'moved-after-failure']) {
    const r = createRenderer();
    const requests = [];
    const body = {};
    const document = {
      body,
      visibilityState: 'visible',
      get activeElement() {
        return r.dom.active || body;
      },
      addEventListener() {},
      removeEventListener() {},
    };
    const router = { replace() {}, refresh() {} };
    const { SessionProvider } = await load(
      'apps/web/src/features/auth/session-provider.jsx',
      {
        react: r.react,
        'react/jsx-runtime': { jsx: element, jsxs: element, Fragment },
        'next/navigation': {
          useRouter: () => router,
          usePathname: () => '/settings',
        },
        '@/lib/api-client': {
          apiRequest() {
            const request = Promise.withResolvers();
            requests.push(request);
            return request.promise;
          },
        },
      },
      {
        window: r.window,
        document,
        setInterval: r.window.setInterval,
        clearInterval: r.window.clearInterval,
      },
    );
    const inside = { current: null };
    const session = {
      user: { id: 'u1' },
      wedding: { id: 'w1' },
      membership: { role: 'ADMIN' },
    };
    const render = () =>
      r.render(() =>
        element(SessionProvider, {
          initialSession: session,
          preserveTaskState: true,
          children: element('p', {
            id: 'cover-error',
            ref: inside,
            tabIndex: -1,
            children: 'Saved draft error',
          }),
        }),
      );
    render();
    const outside = { props: { id: 'unrelated-control' } };
    r.dom.active = location === 'outside' ? outside : inside.current;
    requests[0].reject(new Error('Temporary session outage'));
    await flush();
    r.dom.active = location === 'draft' ? null : outside;
    const tree = render();
    assert.equal(find(tree, (n) => n.props.inert)[0].props.inert, true);
    if (location === 'draft')
      assert.equal(r.dom.active.props.id, 'session-connection-error');
    else assert.equal(r.dom.active, outside, 'never steal unrelated focus');
    const count = r.dom.history.length;
    render();
    assert.equal(r.dom.history.length, count);
    r.unmount();
  }
});

test('only explicit overview retries focus the resulting heading or error', async () => {
  const h = await overviewHarness();
  h.render();
  h.api[0].reject(new Error('Offline'));
  await flush();
  h.render();
  assert.equal(h.r.dom.active, null, 'background responses do not steal focus');
  find(h.render(), (n) => n.type === 'button')[0].props.onClick();
  h.render();
  h.api[1].reject(new Error('Still offline'));
  await flush();
  h.render();
  assert.equal(h.r.dom.active.props.role, 'alert');
  find(h.render(), (n) => n.type === 'button')[0].props.onClick();
  h.render();
  h.api[2].resolve({
    data: {
      role: 'ADMIN',
      collaborators: 4,
      pendingInvites: 1,
      ceremonies: 2,
      tasks: { total: 3, completed: 1, progress: 33 },
    },
  });
  await flush();
  h.render();
  assert.equal(h.r.dom.active.props.id, 'settings-overview-heading');
  const count = h.r.dom.history.length;
  h.render();
  assert.equal(h.r.dom.history.length, count);
  h.r.unmount();
});

// Reuse this file's real-component hook harness for lifecycle refresh controls.
// Browser checks separately verify native focus and Radix behaviour.
async function lifecycleHarness(initial, { resultChecks = false } = {}) {
  const r = createRenderer();
  const requests = [];
  const results = [];
  const navigations = [];
  r.window.location = { replace: (href) => navigations.push(href) };
  let keys = 0;
  const live = {
    user: { id: 'lifecycle-user' },
    wedding: { id: 'lifecycle-wedding' },
    membership: { role: 'ADMIN' },
    recovery: initial,
  };
  const { WeddingLifecycle, WeddingRecovery } = await load(
    'apps/web/src/features/weddings/wedding-lifecycle.jsx',
    {
      react: r.react,
      'react/jsx-runtime': { jsx: element, jsxs: element, Fragment },
      'radix-ui': {
        AlertDialog: {
          Root: ({ open, children }) => (open ? children : null),
          Portal: Fragment,
          Overlay: 'overlay',
          Content: 'dialog',
          Title: 'h2',
          Description: 'p',
          Cancel: ({ children }) => children,
        },
      },
      'lucide-react': icons,
      '@/lib/api-client': {
        apiRequest(path, options) {
          const request = { path, options, ...Promise.withResolvers() };
          if (path.endsWith('/lifecycle/result')) {
            results.push(request);
            if (!resultChecks)
              return Promise.reject(
                Object.assign(new Error('Result read unavailable'), {
                  status: 503,
                }),
              );
            return request.promise;
          }
          requests.push(request);
          return request.promise;
        },
      },
      '@/lib/idempotency-key': {
        newIdempotencyKey: () => `lifecycle-retry-${++keys}`,
      },
      '@/features/auth/session-provider': { useSession: () => live },
      '@/features/dashboard/workspace-ui': {
        PageHeader: 'header',
        SettingsTabs: 'nav',
      },
      '@/features/home/brand': { Brand: 'a' },
      './lifecycle-data': lifecycleData,
      './lifecycle-state': lifecycleState,
    },
    {
      window: r.window,
      document: { hidden: false },
      performance: { now: () => 0 },
      AbortController,
      BroadcastChannel: class {
        close() {}
        postMessage() {}
      },
      setTimeout: r.window.setTimeout,
      clearTimeout: r.window.clearTimeout,
      setInterval: r.window.setInterval,
      clearInterval: r.window.clearInterval,
    },
  );
  const render = () =>
    r.render(() =>
      initial
        ? element(WeddingRecovery, { session: live })
        : element(WeddingLifecycle, {}),
    );
  const resolveRead = async (lifecycle) => {
    requests.at(-1).resolve({ data: { user: live.user, recovery: initial } });
    await flush();
    requests.at(-1).resolve({ data: { lifecycle } });
    await flush();
    return render();
  };
  const button = (label) =>
    find(
      render(),
      (n) => n.type === 'button' && text(n.props.children) === label,
    )[0];
  return {
    r,
    requests,
    results,
    render,
    resolveRead,
    button,
    live,
    navigations,
  };
}

test('lifecycle first load announces loading; unavailable appears only after failure', async () => {
  const h = await lifecycleHarness();
  try {
    assert.ok(text(h.render()).includes('Loading recovery information…'));
    assert.equal(text(h.render()).includes('is unavailable'), false);
    h.r.advance(0);
    assert.equal(h.requests.length, 1);
    assert.ok(text(h.render()).includes('Loading recovery information…'));
    h.requests[0].reject(new Error('Fixture offline'));
    await flush();
    assert.ok(text(h.render()).includes('is unavailable'));
    h.button('Reload current state').props.onClick();
    assert.ok(text(h.render()).includes('Loading recovery information…'));
    await h.resolveRead({ state: 'ACTIVE', canDelete: true, version: 1 });
    assert.ok(h.button('Delete Wedding Workspace'));
    assert.equal(
      text(h.render()).includes('Loading recovery information…'),
      false,
    );
  } finally {
    h.r.unmount();
  }
});

for (const recovery of [false, true]) {
  test(`lifecycle silent refresh keeps ${recovery ? 'Restore' : 'Delete'} and Reload enabled`, async () => {
    const lifecycle = {
      state: recovery ? 'RECOVERABLE' : 'ACTIVE',
      canDelete: !recovery,
      canRestore: recovery,
      version: 1,
      serverNow: '2026-11-16T00:00:00Z',
      purgeAfter: '2026-11-23T00:00:00Z',
      name: 'Fixture wedding',
    };
    const h = await lifecycleHarness(recovery ? lifecycle : undefined);
    const label = recovery
      ? 'Restore Wedding Workspace'
      : 'Delete Wedding Workspace';
    try {
      h.render();
      h.r.advance(0);
      await h.resolveRead(lifecycle);
      const count = h.requests.length;
      h.r.advance(30000);
      assert.equal(h.requests.length, count + 1, 'timer really starts a read');
      assert.equal(h.button(label).props.disabled, false);
      assert.equal(h.button('Reload current state').props.disabled, false);
      const background = h.requests.at(-1);
      // Explicit Reload supersedes the background read instead of doing nothing.
      h.button('Reload current state').props.onClick();
      assert.equal(h.requests.length, count + 2);
      assert.equal(h.button(label).props.disabled, true);
      assert.equal(h.button('Reload current state').props.disabled, true);
      background.resolve({ data: { user: { id: 'lifecycle-user' } } });
      await flush();
      assert.equal(h.requests.length, count + 2, 'stale read never continues');
      assert.equal(h.button(label).props.disabled, true);
      await h.resolveRead({ ...lifecycle, version: 2 });
      assert.equal(h.button(label).props.disabled, false);
      assert.ok(text(h.render()).includes('Current recovery state loaded.'));
    } finally {
      h.r.unmount();
    }
  });
}

const recoverableLifecycle = {
  id: 'lifecycle-wedding',
  state: 'RECOVERABLE',
  canRestore: true,
  version: 1,
  serverNow: '2026-11-16T00:00:00Z',
  purgeAfter: '2026-11-23T00:00:00Z',
  name: 'Fixture wedding',
};
const unavailable = (message) =>
  Object.assign(new Error(message), { status: 503 });

test('restoration Retry is blocked during explicit Reload, then preserves the exact operation', async () => {
  const h = await lifecycleHarness(recoverableLifecycle);
  try {
    h.render();
    h.r.advance(0);
    await h.resolveRead(recoverableLifecycle);
    h.button('Restore Wedding Workspace').props.onClick();
    h.requests.at(-1).resolve({ data: { user: { id: 'lifecycle-user' } } });
    await flush();
    const original = h.requests.at(-1);
    assert.equal(original.options.method, 'POST');
    original.reject(unavailable('First uncertain save'));
    await flush();
    const staleRetry = h.button('Retry unchanged restoration').props.onClick;
    h.button('Reload current state').props.onClick();
    assert.equal(h.button('Retry unchanged restoration').props.disabled, true);
    const count = h.requests.length;
    // Cover both the newly rendered handler and a callback captured before Reload.
    h.button('Retry unchanged restoration').props.onClick();
    staleRetry();
    assert.equal(
      h.requests.length,
      count,
      'no save starts or invalidates Reload',
    );
    await h.resolveRead({ ...recoverableLifecycle, version: 7 });
    assert.equal(h.button('Reload current state').props.disabled, false);
    assert.equal(h.button('Retry unchanged restoration').props.disabled, false);
    h.button('Retry unchanged restoration').props.onClick();
    h.requests.at(-1).resolve({ data: { user: { id: 'lifecycle-user' } } });
    await flush();
    assert.deepEqual(h.requests.at(-1).options, original.options);
    h.requests.at(-1).reject(unavailable('Second uncertain save'));
    await flush();
    assert.equal(
      h.button('Reload current state').props.disabled,
      false,
      'uncertain retry never leaves a stale loading lock',
    );
    h.r.advance(30000);
    h.requests.at(-1).reject(unavailable('Background timeout'));
    await flush();
    assert.ok(
      text(h.render()).includes(
        'We could not confirm the restoration result yet',
      ),
    );
    assert.equal(
      text(h.render()).includes('Background timeout'),
      false,
      'a refresh error cannot replace retained save feedback',
    );
    h.r.advance(30000);
    h.requests
      .at(-1)
      .reject(
        Object.assign(new Error('Current access denied'), { status: 403 }),
      );
    await flush();
    assert.ok(text(h.render()).includes('Current access denied'));
    assert.equal(h.button('Retry unchanged restoration'), undefined);
  } finally {
    h.r.unmount();
  }
});

test('a transient background read error stays outside Delete and cancellation returns to the trigger', async () => {
  const h = await lifecycleHarness();
  try {
    h.render();
    h.r.advance(0);
    await h.resolveRead({ state: 'ACTIVE', canDelete: true, version: 1 });
    h.r.advance(30000);
    h.button('Delete Wedding Workspace').props.onClick();
    h.requests.at(-1).reject(unavailable('Background timeout'));
    await flush();
    const dialog = find(h.render(), (n) => n.type === 'dialog')[0];
    assert.ok(dialog);
    assert.equal(text(dialog).includes('Background timeout'), false);
    assert.equal(find(dialog, (n) => n.props.role === 'alert').length, 0);
    find(
      h.render(),
      (n) => n.props['aria-label'] === 'Close confirmation',
    )[0].props.onClick();
    h.render();
    dialog.props.onCloseAutoFocus({ preventDefault() {} });
    assert.equal(text(h.r.dom.active), 'Delete Wedding Workspace');
    assert.ok(
      text(h.render()).includes('Background timeout'),
      'the read error remains available outside the closed dialog',
    );
  } finally {
    h.r.unmount();
  }
});

test('confirmed read access denial closes Delete and focuses the page alert', async () => {
  const h = await lifecycleHarness();
  try {
    h.render();
    h.r.advance(0);
    await h.resolveRead({ state: 'ACTIVE', canDelete: true, version: 1 });
    h.r.advance(30000);
    h.button('Delete Wedding Workspace').props.onClick();
    h.requests
      .at(-1)
      .reject(
        Object.assign(new Error('Current access denied'), { status: 403 }),
      );
    await flush();
    assert.equal(find(h.render(), (n) => n.type === 'dialog').length, 0);
    assert.ok(text(h.render()).includes('Current access denied'));
    assert.equal(h.r.dom.active.props.role, 'alert');
    assert.equal(h.button('Deactivate Workspace'), undefined);
  } finally {
    h.r.unmount();
  }
});

async function beginLifecycleSave(h, action) {
  if (action === 'DELETE') {
    h.button('Delete Wedding Workspace').props.onClick();
    find(h.render(), (n) => n.type === 'input')[0].props.onChange({
      target: { value: 'DELETE' },
    });
    h.button('Deactivate Workspace').props.onClick();
  } else h.button('Restore Wedding Workspace').props.onClick();
  h.requests.at(-1).resolve({ data: { user: { id: 'lifecycle-user' } } });
  await flush();
  return h.requests.at(-1);
}
const activeLifecycle = {
  id: 'lifecycle-wedding',
  state: 'ACTIVE',
  canDelete: true,
  version: 1,
};

for (const action of ['DELETE', 'RESTORE']) {
  test(`rate-limited first ${action} shows a wait message without checking for completion`, async () => {
    const initial = action === 'RESTORE' ? recoverableLifecycle : undefined;
    const h = await lifecycleHarness(initial, { resultChecks: true });
    try {
      h.render();
      h.r.advance(0);
      await h.resolveRead(initial || activeLifecycle);
      const first = await beginLifecycleSave(h, action);
      first.reject(
        Object.assign(new Error('Too many attempts'), {
          status: 429,
          code: 'RATE_LIMITED',
          retryAfterSeconds: action === 'DELETE' ? 61 : undefined,
        }),
      );
      await flush();

      const tree = h.render();
      assert.equal(h.results.length, 0);
      assert.deepEqual(h.navigations, []);
      assert.equal(h.r.dom.active.props.role, 'alert');
      assert.match(text(tree), /blocked before it could start/);
      assert.match(
        text(tree),
        action === 'DELETE'
          ? /Try again in 1 minute 1 second/
          : /Please wait before trying again/,
      );
      assert.doesNotMatch(text(tree), /may still complete|Retry unchanged/);
      if (action === 'DELETE') {
        assert.equal(
          find(tree, (n) => n.type === 'input')[0].props.value,
          'DELETE',
        );
        assert.equal(h.button('Cancel').props.disabled, false);
        const close = find(
          tree,
          (n) => n.props?.['aria-label'] === 'Close confirmation',
        )[0];
        close.props.onClick();
        assert.equal(find(h.render(), (n) => n.type === 'dialog').length, 0);
      }

      const next = await beginLifecycleSave(h, action);
      assert.notEqual(
        next.options.headers['Idempotency-Key'],
        first.options.headers['Idempotency-Key'],
      );
    } finally {
      h.r.unmount();
    }
  });
}

test('a rate-limited Retry retains the earlier uncertain request', async () => {
  const h = await lifecycleHarness(undefined, { resultChecks: true });
  try {
    h.render();
    h.r.advance(0);
    await h.resolveRead(activeLifecycle);
    const first = await beginLifecycleSave(h, 'DELETE');
    first.reject(unavailable('Original response lost'));
    await flush();
    h.results[0].reject(unavailable('Result unavailable'));
    await flush();

    const retry = async () => {
      h.button('Retry unchanged deletion').props.onClick();
      h.requests.at(-1).resolve({ data: { user: h.live.user } });
      await flush();
      assert.deepEqual(h.requests.at(-1).options, first.options);
      return h.requests.at(-1);
    };
    const blocked = await retry();
    blocked.reject(
      Object.assign(new Error('Too many attempts'), {
        status: 429,
        code: 'RATE_LIMITED',
        retryAfterSeconds: 15,
      }),
    );
    await flush();

    assert.match(
      text(h.render()),
      /The earlier request is still unconfirmed.*Try again in 15 seconds/,
    );
    assert.equal(h.results.length, 1);
    assert.equal(h.button('Cancel').props.disabled, true);
    assert.equal(h.r.dom.active.props.role, 'alert');
    await retry();
  } finally {
    h.r.unmount();
  }
});

for (const status of [401, 403, 404]) {
  test(`uncertain Delete then read ${status} releases the modal, discards the operation and latches denial`, async () => {
    const h = await lifecycleHarness();
    try {
      h.render();
      h.r.advance(0);
      await h.resolveRead(activeLifecycle);
      const save = await beginLifecycleSave(h, 'DELETE');
      save.reject(unavailable('Uncertain deletion'));
      await flush();
      const staleRetry = h.button('Retry unchanged deletion').props.onClick;
      h.r.advance(30000);
      h.requests
        .at(-1)
        .reject(Object.assign(new Error('Confirmed access lost'), { status }));
      await flush();
      const count = h.requests.length;
      staleRetry();
      assert.equal(
        h.requests.length,
        count,
        'a callback captured before denial cannot restart a save',
      );
      assert.equal(find(h.render(), (n) => n.type === 'dialog').length, 0);
      assert.equal(h.button('Retry unchanged deletion'), undefined);
      assert.equal(h.r.dom.active.props.role, 'alert');
      h.r.advance(30000);
      await h.resolveRead({ ...activeLifecycle, version: 2 });
      assert.ok(text(h.render()).includes('Confirmed access lost'));
      assert.equal(h.button('Delete Wedding Workspace').props.disabled, true);
      h.button('Reload current state').props.onClick();
      h.requests.at(-1).reject(unavailable('Still unavailable'));
      await flush();
      assert.ok(text(h.render()).includes('Confirmed access lost'));
      assert.equal(h.button('Delete Wedding Workspace').props.disabled, true);
      h.button('Reload current state').props.onClick();
      await h.resolveRead({ ...activeLifecycle, version: 2 });
      assert.equal(h.button('Delete Wedding Workspace').props.disabled, false);
      assert.equal(text(h.render()).includes('Confirmed access lost'), false);
    } finally {
      h.r.unmount();
    }
  });
}

for (const action of ['DELETE', 'RESTORE'])
  for (const status of [403, 409]) {
    test(`${action} ${status} feedback/lock survive background success and failed explicit Reload`, async () => {
      const initial = action === 'RESTORE' ? recoverableLifecycle : undefined;
      const current = initial || activeLifecycle;
      const h = await lifecycleHarness(initial);
      const label =
        action === 'RESTORE'
          ? 'Restore Wedding Workspace'
          : 'Delete Wedding Workspace';
      try {
        h.render();
        h.r.advance(0);
        await h.resolveRead(current);
        h.button('Reload current state').props.onClick();
        await h.resolveRead(current);
        assert.ok(text(h.render()).includes('Current recovery state loaded.'));
        const request = await beginLifecycleSave(h, action);
        request.reject(
          Object.assign(new Error('Definitive save failure'), { status }),
        );
        await flush();
        assert.equal(h.button(label).props.disabled, true);
        assert.equal(h.r.dom.active.props.role, 'alert');
        assert.equal(
          text(h.render()).includes('Current recovery state loaded.'),
          false,
        );
        h.r.advance(30000);
        await h.resolveRead({ ...current, version: 2 });
        assert.ok(text(h.render()).includes('Definitive save failure'));
        assert.equal(h.button(label).props.disabled, true);
        h.button('Reload current state').props.onClick();
        h.requests.at(-1).reject(unavailable('Reload unavailable'));
        await flush();
        assert.ok(text(h.render()).includes('Definitive save failure'));
        assert.equal(h.button(label).props.disabled, true);
        h.button('Reload current state').props.onClick();
        await h.resolveRead({ ...current, version: 2 });
        assert.equal(h.button(label).props.disabled, false);
        assert.equal(
          text(h.render()).includes('Definitive save failure'),
          false,
        );
      } finally {
        h.r.unmount();
      }
    });
  }

for (const action of ['DELETE', 'RESTORE']) {
  test(`${action} success holds its pending focus and mutation lock until document navigation`, async () => {
    const initial = action === 'RESTORE' ? recoverableLifecycle : undefined;
    const h = await lifecycleHarness(initial);
    try {
      h.render();
      h.r.advance(0);
      await h.resolveRead(initial || activeLifecycle);
      const request = await beginLifecycleSave(h, action);
      const tree = h.render();
      if (action === 'DELETE') {
        const event = {
          prevented: false,
          preventDefault() {
            this.prevented = true;
          },
        };
        find(tree, (n) => n.type === 'overlay')[0].props.onPointerDown(event);
        assert.equal(event.prevented, true);
        assert.equal(h.r.dom.active.type, 'dialog');
      } else {
        assert.equal(h.r.dom.active.type, 'h1');
        assert.equal(h.r.dom.scrolledTo, h.r.dom.active);
      }
      request.resolve({
        data: {
          lifecycle:
            action === 'RESTORE' ? activeLifecycle : recoverableLifecycle,
        },
      });
      await flush();
      assert.deepEqual(h.navigations, [
        action === 'RESTORE' ? '/dashboard' : '/wedding-recovery',
      ]);
      assert.equal(h.button('Reload current state').props.disabled, true);
      const count = h.requests.length;
      h.r.advance(30000);
      h.render();
      assert.equal(h.requests.length, count);
      const button = h.button(
        action === 'RESTORE' ? 'Restore Wedding Workspace' : 'Please wait…',
      );
      assert.equal(button.props.disabled, true);
      button.props.onClick();
      assert.equal(h.requests.length, count);
    } finally {
      h.r.unmount();
    }
  });
}

test('a temporary lifecycle session outage preserves the open exact retry operation', async () => {
  const h = await lifecycleHarness();
  try {
    h.render();
    h.r.advance(0);
    await h.resolveRead(activeLifecycle);
    const request = await beginLifecycleSave(h, 'DELETE');
    request.reject(unavailable('Uncertain deletion'));
    await flush();
    assert.ok(h.button('Retry unchanged deletion'));
    h.live.connectionError = 'Temporary session outage';
    assert.equal(find(h.render(), (n) => n.type === 'dialog').length, 0);
    h.live.connectionError = '';
    assert.ok(h.button('Retry unchanged deletion'));
    h.button('Retry unchanged deletion').props.onClick();
    h.requests.at(-1).resolve({ data: { user: { id: 'lifecycle-user' } } });
    await flush();
    assert.deepEqual(h.requests.at(-1).options, request.options);
    h.requests.at(-1).reject(unavailable('Still uncertain'));
    await flush();
  } finally {
    h.r.unmount();
  }
});

test('expiry on the already-mounted recovery route discards scope and navigates to fixed login', async () => {
  const h = await lifecycleHarness(recoverableLifecycle);
  try {
    h.render();
    h.r.advance(0);
    await h.resolveRead(recoverableLifecycle);
    h.button('Restore Wedding Workspace').props.onClick();
    const identity = h.requests.at(-1),
      count = h.requests.length;
    h.r.window.dispatchEvent({ type: 'mmm:session-expired' });
    assert.deepEqual(h.navigations, ['/login']);
    identity.resolve({ data: { user: { id: 'lifecycle-user' } } });
    await flush();
    assert.equal(
      h.requests.length,
      count,
      'late identity result cannot start restoration',
    );
    assert.equal(text(h.render()).includes('Fixture wedding'), false);
    assert.equal(h.button('Reload current state').props.disabled, true);
  } finally {
    h.r.unmount();
  }
});

for (const pathname of ['/settings', '/settings/lifecycle']) {
  test(`SessionProvider preserves a mounted ${pathname} attempt through session outage/revalidation`, async () => {
    const r = createRenderer(),
      requests = [];
    let mounted = 0,
      unmounted = 0;
    const router = { replace() {}, refresh() {} };
    const document = {
      body: {},
      visibilityState: 'visible',
      addEventListener() {},
      removeEventListener() {},
      get activeElement() {
        return r.dom.active;
      },
    };
    const { SessionProvider } = await load(
      'apps/web/src/features/auth/session-provider.jsx',
      {
        react: r.react,
        'react/jsx-runtime': { jsx: element, jsxs: element, Fragment },
        'next/navigation': {
          usePathname: () => pathname,
          useRouter: () => router,
        },
        '@/lib/api-client': {
          apiRequest() {
            const request = Promise.withResolvers();
            requests.push(request);
            return request.promise;
          },
        },
      },
      {
        window: r.window,
        document,
        setInterval: r.window.setInterval,
        clearInterval: r.window.clearInterval,
      },
    );
    function RetainedAttempt() {
      r.react.useEffect(() => {
        mounted++;
        return () => unmounted++;
      }, []);
      const [key] = r.react.useState('original-operation-key');
      return element('p', { children: key });
    }
    const session = {
      user: { id: 'u' },
      wedding: { id: 'w' },
      membership: { role: 'ADMIN' },
    };
    const render = () =>
      r.render(() =>
        element(SessionProvider, {
          initialSession: session,
          preserveTaskState: true,
          children: element(RetainedAttempt, {}),
        }),
      );
    try {
      render();
      requests[0].reject(unavailable('Session temporarily unavailable'));
      await flush();
      const tree = render();
      assert.equal(mounted, 1);
      assert.equal(unmounted, 0);
      assert.ok(text(tree).includes('original-operation-key'));
      assert.ok(find(tree, (n) => n.props.inert).length);
      find(
        tree,
        (n) => n.type === 'button' && text(n) === 'Retry session check',
      )[0].props.onClick();
      render();
      requests.at(-1).resolve({ data: session });
      await flush();
      const recovered = render();
      assert.equal(mounted, 1);
      assert.equal(unmounted, 0);
      assert.ok(text(recovered).includes('original-operation-key'));
      assert.equal(find(recovered, (n) => n.props.inert).length, 0);
    } finally {
      r.unmount();
    }
  });
}

test('a failed document replacement exposes Reload without allowing a second committed write', async () => {
  const h = await lifecycleHarness();
  try {
    h.render();
    h.r.advance(0);
    await h.resolveRead(activeLifecycle);
    const request = await beginLifecycleSave(h, 'DELETE');
    h.r.window.location.replace = () => {
      throw new Error('Navigation blocked by test');
    };
    request.resolve({ data: { lifecycle: recoverableLifecycle } });
    await flush();
    assert.ok(text(h.render()).includes('Navigation could not finish.'));
    assert.equal(find(h.render(), (n) => n.type === 'dialog').length, 0);
    assert.equal(h.button('Delete Wedding Workspace').props.disabled, true);
    assert.equal(h.button('Reload current state').props.disabled, false);
    assert.equal(h.button('Retry unchanged deletion'), undefined);
    assert.equal(h.r.dom.active.props.role, 'alert');
  } finally {
    h.r.unmount();
  }
});

test('expired logout on recovery follows the API expiry event without a second login replacement', async () => {
  const h = await lifecycleHarness(recoverableLifecycle);
  try {
    h.render();
    h.r.advance(0);
    await h.resolveRead(recoverableLifecycle);
    const action = h.button('Log out').props.onClick();
    // This is the event-before-rejection contract of the real apiRequest.
    h.r.window.dispatchEvent({ type: 'mmm:session-expired' });
    h.requests.at(-1).reject(
      Object.assign(new Error('Expired'), {
        code: 'SESSION_EXPIRED',
        status: 401,
      }),
    );
    await action;
    assert.deepEqual(h.navigations, ['/login']);
  } finally {
    h.r.unmount();
  }
});

for (const [action, state] of [
  ['DELETE', 'RECOVERABLE'],
  ['DELETE', 'ACTIVE'],
  ['RESTORE', 'ACTIVE'],
  ['RESTORE', 'RECOVERABLE'],
]) {
  test(`${action} uncertain response is confirmed read-only and follows current ${state} state without another mutation`, async () => {
    const h = await lifecycleHarness(
      action === 'RESTORE' ? recoverableLifecycle : undefined,
      { resultChecks: true },
    );
    try {
      h.render();
      h.r.advance(0);
      await h.resolveRead(
        action === 'RESTORE' ? recoverableLifecycle : activeLifecycle,
      );
      const original = await beginLifecycleSave(h, action);
      assert.equal(original.options.timeoutMs, 15000);
      original.reject(
        Object.assign(new Error('Reply timed out'), { code: 'TIMEOUT' }),
      );
      await flush();
      assert.equal(h.results.length, 1);
      assert.ok(
        text(h.render()).includes(
          `Checking ${action === 'DELETE' ? 'deletion' : 'restoration'} result`,
        ),
      );
      assert.equal(h.button('Reload current state').props.disabled, true);
      assert.deepEqual(h.results[0].options.headers, original.options.headers);
      assert.deepEqual(JSON.parse(h.results[0].options.body), {
        action,
        body: JSON.parse(original.options.body),
      });
      h.results[0].resolve({
        data: {
          confirmed: true,
          lifecycle: { ...recoverableLifecycle, state },
        },
      });
      await flush();
      assert.deepEqual(h.navigations, [
        state === 'ACTIVE' ? '/dashboard' : '/wedding-recovery',
      ]);
      assert.equal(h.requests.filter((r) => r.options?.method).length, 1);
      assert.equal(h.button('Reload current state').props.disabled, true);
    } finally {
      h.r.unmount();
    }
  });
}

test('unconfirmed checks are bounded, keep truthful feedback and preserve the exact write for Retry', async () => {
  const h = await lifecycleHarness(undefined, { resultChecks: true });
  try {
    h.render();
    h.r.advance(0);
    await h.resolveRead(activeLifecycle);
    const original = await beginLifecycleSave(h, 'DELETE');
    original.reject(unavailable('Lost reply'));
    await flush();
    h.results[0].resolve({ data: { confirmed: false } });
    await flush();
    h.r.advance(1500);
    await flush();
    assert.equal(h.results.length, 2);
    h.results[1].resolve({ data: { confirmed: false } });
    await flush();
    h.r.advance(3500);
    await flush();
    assert.equal(h.results.length, 3);
    h.results[2].resolve({ data: { confirmed: false } });
    await flush();
    assert.ok(
      text(h.render()).includes(
        'We could not confirm the deletion result yet. It may still complete.',
      ),
    );
    assert.equal(h.button('Retry unchanged deletion').props.disabled, false);
    assert.equal(h.r.dom.active.props.role, 'alert');
    h.r.advance(30000);
    await flush();
    assert.equal(h.results.length, 3);
    // Finish the background session read before explicitly retrying.
    await h.resolveRead(activeLifecycle);
    h.button('Retry unchanged deletion').props.onClick();
    h.requests.at(-1).resolve({ data: { user: h.live.user } });
    await flush();
    assert.deepEqual(h.requests.at(-1).options, original.options);
  } finally {
    h.r.unmount();
  }
});

for (const status of [401, 403, 404])
  test(`result check ${status} releases the dialog and focuses latched access denial`, async () => {
    const h = await lifecycleHarness(undefined, { resultChecks: true });
    try {
      h.render();
      h.r.advance(0);
      await h.resolveRead(activeLifecycle);
      const write = await beginLifecycleSave(h, 'DELETE');
      write.reject(unavailable('Lost reply'));
      await flush();
      h.results[0].reject(
        Object.assign(new Error('Current access denied'), {
          status,
          code:
            status === 401
              ? 'SESSION_EXPIRED'
              : status === 403
                ? 'ADMIN_REQUIRED'
                : 'WEDDING_NOT_FOUND',
        }),
      );
      await flush();
      assert.equal(find(h.render(), (n) => n.type === 'dialog').length, 0);
      assert.equal(h.r.dom.active.props.role, 'alert');
      assert.ok(text(h.render()).includes('Current access denied'));
      assert.equal(h.button('Retry unchanged deletion'), undefined);
      assert.equal(h.button('Delete Wedding Workspace'), undefined);
      assert.equal(text(h.render()).includes('Checking'), false);
    } finally {
      h.r.unmount();
    }
  });

test('unmount aborts a result check and late confirmation cannot navigate another scope', async () => {
  const h = await lifecycleHarness(undefined, { resultChecks: true });
  h.render();
  h.r.advance(0);
  await h.resolveRead(activeLifecycle);
  const write = await beginLifecycleSave(h, 'DELETE');
  write.reject(unavailable('Lost reply'));
  await flush();
  h.r.unmount();
  assert.equal(h.results[0].options.signal.aborted, true);
  h.results[0].resolve({
    data: { confirmed: true, lifecycle: recoverableLifecycle },
  });
  await flush();
  assert.deepEqual(h.navigations, []);
  assert.equal(h.results.length, 1);
});

test('a result-read outage preserves the exact operation through session recovery', async () => {
  const h = await lifecycleHarness(undefined, { resultChecks: true });
  try {
    h.render();
    h.r.advance(0);
    await h.resolveRead(activeLifecycle);
    const write = await beginLifecycleSave(h, 'DELETE');
    write.reject(unavailable('Lost reply'));
    await flush();
    h.live.connectionError = 'Session connection lost';
    assert.equal(find(h.render(), (n) => n.type === 'dialog').length, 0);
    h.results[0].reject(unavailable('Result read unavailable'));
    await flush();
    h.live.connectionError = '';
    assert.equal(h.button('Retry unchanged deletion').props.disabled, false);
    h.button('Retry unchanged deletion').props.onClick();
    h.requests.at(-1).resolve({ data: { user: h.live.user } });
    await flush();
    assert.deepEqual(h.requests.at(-1).options, write.options);
  } finally {
    h.r.unmount();
  }
});

test('a mismatched result cannot navigate or clear the original operation', async () => {
  const h = await lifecycleHarness(undefined, { resultChecks: true });
  try {
    h.render();
    h.r.advance(0);
    await h.resolveRead(activeLifecycle);
    const write = await beginLifecycleSave(h, 'DELETE');
    write.reject(unavailable('Lost reply'));
    await flush();
    h.results[0].resolve({
      data: {
        confirmed: true,
        lifecycle: { ...recoverableLifecycle, id: 'another-wedding' },
      },
    });
    await flush();
    assert.deepEqual(h.navigations, []);
    assert.equal(h.button('Retry unchanged deletion').props.disabled, false);
  } finally {
    h.r.unmount();
  }
});

test('changing account while checking a result ignores the previous account confirmation', async () => {
  const h = await lifecycleHarness(undefined, { resultChecks: true });
  try {
    h.render();
    h.r.advance(0);
    await h.resolveRead(activeLifecycle);
    const write = await beginLifecycleSave(h, 'DELETE');
    write.reject(unavailable('Lost reply'));
    await flush();
    h.live.user = { id: 'different-account' };
    h.render();
    h.results[0].resolve({
      data: { confirmed: true, lifecycle: recoverableLifecycle },
    });
    await flush();
    assert.deepEqual(h.navigations, []);
  } finally {
    h.r.unmount();
  }
});

test('an unavailable result endpoint is not confused with revoked wedding access', async () => {
  const h = await lifecycleHarness(undefined, { resultChecks: true });
  try {
    h.render();
    h.r.advance(0);
    await h.resolveRead(activeLifecycle);
    const write = await beginLifecycleSave(h, 'DELETE');
    write.reject(unavailable('Lost reply'));
    await flush();
    h.results[0].reject(
      Object.assign(new Error('Not found'), { status: 404, code: 'NOT_FOUND' }),
    );
    await flush();
    assert.equal(h.button('Retry unchanged deletion').props.disabled, false);
    assert.equal(find(h.render(), (n) => n.type === 'dialog').length, 1);
    assert.ok(
      text(h.render()).includes('We could not confirm the deletion result yet'),
    );
  } finally {
    h.r.unmount();
  }
});
