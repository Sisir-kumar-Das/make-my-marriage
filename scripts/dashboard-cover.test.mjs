import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, Script } from 'node:vm';
import { loadBindings, transform } from 'next/dist/build/swc/index.js';
import * as coverData from '../apps/web/src/features/weddings/cover-data.js';
import * as dashboardData from '../apps/web/src/features/dashboard/dashboard-data.js';

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
  function walk(node, path) {
    if (node === null || node === undefined || node === false || node === true)
      return null;
    if (typeof node !== 'object') return node;
    if (Array.isArray(node))
      return node.map((child, i) => walk(child, `${path}.${child?.key ?? i}`));
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
      return walk(output, `${id}/`);
    }
    const children = walk(props.children, `${path}/${String(type)}`);
    const host = { type, props: { ...props, children } };
    if (props.ref && typeof props.ref === 'object') {
      host.focused = 0;
      host.focus = () => {
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
    addEventListener() {},
    removeEventListener() {},
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

async function coverHarness({ role = 'ADMIN', photo = true } = {}) {
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
    upload: async () => 'media-new',
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
        children: element('details', {}),
      }),
    );
  return { r, api, render };
}
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
