import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, Script } from 'node:vm';
import { loadBindings, transform } from 'next/dist/build/swc/index.js';
import * as dashboardData from '../apps/web/src/features/dashboard/dashboard-data.js';

// Drive the real TaskSummaryProvider with minimal hooks, without a new test framework.
await loadBindings();
const { code } = await transform(
  await readFile(
    new URL(
      '../apps/web/src/features/dashboard/task-summary.jsx',
      import.meta.url,
    ),
    'utf8',
  ),
  {
    filename: 'task-summary.jsx',
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      target: 'es2022',
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  },
);

function probe(t) {
  const cells = [],
    requests = [];
  const listeners = {},
    intervals = [],
    channels = [];
  let clock = Date.parse('2027-01-10T06:00:00Z');
  let cursor = 0,
    effects = [],
    live = null,
    props = null,
    value = null;
  const hooks = {
    createContext: () => ({ Provider: 'Provider' }),
    useContext: () => live,
    useState(initial) {
      const cell = (cells[cursor++] ||= {
        value: typeof initial === 'function' ? initial() : initial,
      });
      return [
        cell.value,
        (next) => {
          cell.value = typeof next === 'function' ? next(cell.value) : next;
        },
      ];
    },
    useRef(initial) {
      return (cells[cursor++] ||= { current: initial });
    },
    useEffect(callback, deps) {
      const i = cursor++,
        previous = cells[i];
      if (!previous || deps.some((v, j) => !Object.is(v, previous.deps[j]))) {
        cells[i] = { deps, cleanup: previous?.cleanup };
        effects.push(() => {
          previous?.cleanup?.();
          cells[i].cleanup = callback();
        });
      }
    },
  };
  const element = (type, p) => ({ type, props: p || {} });
  const imports = {
    react: hooks,
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'next/link': { __esModule: true, default: 'Link' },
    'lucide-react': new Proxy({}, { get: (_, name) => String(name) }),
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
    './workspace-ui.module.css': {
      __esModule: true,
      default: new Proxy({}, { get: (_, name) => String(name) }),
    },
  };
  const exports = {};
  new Script(code, { filename: 'task-summary.jsx' }).runInContext(
    createContext({
      exports,
      require: (name) => {
        assert.ok(name in imports, `Unexpected import ${name}`);
        return imports[name];
      },
      window: {
        addEventListener(name, fn) {
          listeners[name] = fn;
        },
        removeEventListener() {},
        setInterval(fn) {
          intervals.push(fn);
          return intervals.length;
        },
        clearInterval() {},
      },
      document: { visibilityState: 'visible' },
      BroadcastChannel: class {
        constructor(name) {
          assert.equal(name, 'mmm-session');
          channels.push(this);
        }
        close() {
          this.onmessage = undefined;
        }
      },
      AbortController,
      Date: class extends Date {
        static now() {
          return clock;
        }
      },
    }),
  );
  function render() {
    for (let pass = 0; pass < 5; pass++) {
      cursor = 0;
      effects = [];
      const root = exports.TaskSummaryProvider({ ...props, children: null });
      value = root.props.value;
      for (const effect of effects) effect();
    }
  }
  const flush = async () => {
    await new Promise(setImmediate);
    render();
  };
  t.after(() => {
    for (const cell of cells) cell.cleanup?.();
  });
  return {
    requests,
    render,
    flush,
    set(next, session = next) {
      props = next;
      live = {
        user: { id: session.userId },
        wedding: { id: session.weddingId },
      };
      render();
    },
    value: () => value,
    taskChanged(weddingId) {
      channels.at(-1).onmessage({ data: { type: 'tasks-changed', weddingId } });
      render();
    },
    pageRestored(persisted) {
      listeners.pageshow({ persisted });
      render();
    },
    // Advance the page clock, then fire a window focus or the 60-second tick.
    focus(afterMs) {
      clock += afterMs;
      listeners.focus();
      render();
    },
    tick(afterMs) {
      clock += afterMs;
      intervals.at(-1)();
      render();
    },
  };
}

const A = { userId: 'u1', weddingId: 'a'.repeat(24) };
const B = { userId: 'u2', weddingId: 'b'.repeat(24) };
const summary = (total) => ({ data: { counts: { total } } });
const failure = (status) => Object.assign(new Error('x'), { status });

test('Retry and a scope change fetch at once; old data never shows under a new scope', async (t) => {
  const p = probe(t);
  p.set(A);
  assert.equal(p.requests.length, 1);
  assert.equal(p.value().loading, true);
  p.requests[0].resolve(summary(9));
  await p.flush();
  assert.equal(p.value().data.counts.total, 9);

  // Retry is immediate, inside the 30-second background gap.
  p.value().retry();
  p.render();
  assert.equal(p.requests.length, 2);
  // A failed refresh keeps the last good numbers and raises the slim note.
  p.requests[1].reject(new Error('Server hiccup'));
  await p.flush();
  assert.equal(p.value().data.counts.total, 9);
  assert.equal(p.value().stale, true);
  assert.equal(p.value().error, false);

  // Account/wedding switch: fetch B immediately; A's numbers are gone at once.
  p.set(B);
  assert.equal(p.requests.length, 3);
  assert.ok(p.requests[2].path.includes(B.weddingId));
  assert.equal(p.value().data, undefined);
  assert.equal(p.value().loading, true);
  // B's first load fails: B shows the error panel, never A's kept numbers.
  p.requests[2].reject(new Error('Network down'));
  await p.flush();
  assert.equal(p.value().data, undefined);
  assert.equal(p.value().error, true);
});

test('while the header session differs from the page, nothing is shown or requested', async (t) => {
  const p = probe(t);
  p.set(A);
  p.requests[0].resolve(summary(4));
  await p.flush();
  assert.equal(p.value().data.counts.total, 4);
  // Another tab switched account: header (live session) is B, page props still A.
  p.set(A, B);
  assert.equal(p.value().data, undefined);
  assert.equal(p.requests.length, 1, 'no request for the old wedding');
});

test('a saved task refreshes the cached zero immediately for the same wedding', async (t) => {
  const p = probe(t);
  p.set(A);
  p.requests[0].resolve(summary(0));
  await p.flush();
  p.focus(1000);
  p.taskChanged(B.weddingId);
  p.pageRestored(false);
  assert.equal(p.requests.length, 1);
  p.taskChanged(A.weddingId);
  assert.equal(p.requests.length, 2);
  p.requests[1].resolve(summary(1));
  await p.flush();
  assert.equal(p.value().data.counts.total, 1);
  p.pageRestored(true);
  assert.equal(p.requests.length, 3);
});

test('session and badge helper rules', () => {
  const { sessionMatches, failedResult, badgeAfterFailure } = dashboardData;
  assert.equal(sessionMatches(null, 'u1:w1'), true);
  assert.equal(
    sessionMatches({ user: { id: 'u1' }, wedding: { id: 'w1' } }, 'u1:w1'),
    true,
  );
  assert.equal(
    sessionMatches({ user: { id: 'u1' }, wedding: null }, 'u1:w1'),
    false,
  );
  const good = { scope: 's1', data: { counts: { total: 2 } } };
  assert.deepEqual(failedResult(good, 's1', 'k').data, good.data);
  assert.equal(failedResult(good, 's2', 'k').data, undefined);
  const badge = { scope: 's1', count: 3 };
  assert.equal(badgeAfterFailure(badge, 's1', { status: 503 }), badge);
  assert.equal(badgeAfterFailure(badge, 's1', { status: 0 }), badge);
  for (const status of [401, 403, 404])
    assert.equal(badgeAfterFailure(badge, 's1', { status }).count, null);
  assert.equal(badgeAfterFailure(badge, 's2', { status: 503 }).count, null);
});

test('a "no access" answer on refresh drops the loaded numbers (removed member)', async (t) => {
  for (const status of [401, 403, 404]) {
    const p = probe(t);
    p.set(A);
    p.requests[0].resolve(summary(7));
    await p.flush();
    p.value().retry();
    p.render();
    p.requests[1].reject(failure(status));
    await p.flush();
    assert.equal(p.value().data, undefined, `status ${status}`);
    assert.equal(p.value().stale, false);
    assert.equal(p.value().unloaded, true);
  }
});

test('the note stays and says Retrying while the next attempt runs', async (t) => {
  const p = probe(t);
  p.set(A);
  p.requests[0].resolve(summary(5));
  await p.flush();
  p.value().retry();
  p.render();
  p.requests[1].reject(failure(503));
  await p.flush();
  assert.equal(p.value().stale, true);
  assert.equal(p.value().retrying, false);
  p.value().retry();
  p.render();
  assert.equal(p.value().stale, true, 'note still shown');
  assert.equal(p.value().retrying, true);
  p.requests[2].resolve(summary(6));
  await p.flush();
  assert.equal(p.value().stale, false);
  assert.equal(p.value().retrying, false);
  assert.equal(p.value().data.counts.total, 6);
});

test('a first-load failure is one shared state, retried from one place', async (t) => {
  const p = probe(t);
  p.set(A);
  p.requests[0].reject(failure(503));
  await p.flush();
  assert.equal(p.value().unloaded, true);
  assert.equal(p.value().error, true);
  p.value().retry();
  p.render();
  assert.equal(p.value().retrying, true);
  assert.equal(p.value().loading, true);
  p.requests[1].resolve(summary(3));
  await p.flush();
  assert.equal(p.value().unloaded, false);
  assert.equal(p.value().data.counts.total, 3);
});

test('focus and the 60-second tick refresh at most every 30 seconds', async (t) => {
  const p = probe(t);
  p.set(A);
  p.requests[0].resolve(summary(1));
  await p.flush();
  p.focus(10000);
  assert.equal(p.requests.length, 1, 'focus 10 s after the start is ignored');
  p.focus(19999);
  assert.equal(p.requests.length, 1, 'still under 30 s');
  p.focus(1);
  assert.equal(p.requests.length, 2, 'focus at 30 s refreshes');
  p.tick(29000);
  assert.equal(p.requests.length, 2, 'tick under 30 s is ignored');
  p.tick(1000);
  assert.equal(p.requests.length, 3, 'tick at 30 s refreshes');
});

test('a removed member gets the no-access state and no more background refreshes', async (t) => {
  const p = probe(t);
  p.set(A);
  p.requests[0].resolve(summary(8));
  await p.flush();
  p.focus(30000);
  p.requests[1].reject(failure(403));
  await p.flush();
  assert.equal(p.value().noAccess, true);
  assert.equal(p.value().data, undefined);
  // Neither focus nor the 60-second tick asks again.
  p.focus(60000);
  p.tick(60000);
  assert.equal(p.requests.length, 2);
  // A server hiccup is not "no access".
  const q = probe(t);
  q.set(B);
  q.requests[0].reject(failure(503));
  await q.flush();
  assert.equal(q.value().noAccess, false);
});

test('signed out (401) is final with its own words; a missing wedding (404) keeps refreshing', async (t) => {
  const signedOut = probe(t);
  signedOut.set(A);
  signedOut.requests[0].reject(failure(401));
  await signedOut.flush();
  assert.equal(
    signedOut.value().access.text,
    "You've been signed out. Please sign in again.",
  );
  signedOut.focus(60000);
  signedOut.tick(60000);
  assert.equal(signedOut.requests.length, 1, 'no refresh after 401');

  const gone = probe(t);
  gone.set(A);
  gone.requests[0].resolve(summary(2));
  await gone.flush();
  gone.focus(30000);
  gone.requests[1].reject(failure(404));
  await gone.flush();
  assert.equal(
    gone.value().access.text,
    'This wedding is no longer available.',
  );
  assert.equal(gone.value().data, undefined);
  // A short outage: the slow refresh continues and recovers by itself.
  gone.tick(30000);
  assert.equal(gone.requests.length, 3);
  gone.requests[2].resolve(summary(2));
  await gone.flush();
  assert.equal(gone.value().access, null);
  assert.equal(gone.value().data.counts.total, 2);
});
