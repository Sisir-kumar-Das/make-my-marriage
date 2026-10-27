import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createHomeEntryFlow,
  SESSION_CHECK_DEADLINE,
  WORKSPACE_OPEN_DEADLINE,
} from '../apps/web/src/features/auth/home-entry-state.js';

const flush = () => new Promise(setImmediate);
const session = (wedding = { id: 'current-wedding' }) => ({
  data: { user: { id: 'current-user' }, wedding },
});
function fixture(t, overrides = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests = [],
    navigations = [],
    states = [];
  let stopped = 0;
  let state = { phase: 'checking' };
  const flow = createHomeEntryFlow({
    checkSession(signal) {
      const response = Promise.withResolvers();
      requests.push({ ...response, signal });
      return response.promise;
    },
    navigate: (path) => navigations.push(path),
    stopNavigation: () => {
      stopped++;
    },
    onState: (next) => {
      state = next;
      states.push(next);
    },
    ...overrides,
  });
  t.after(() => flow.dispose());
  flow.start();
  return {
    flow,
    requests,
    navigations,
    states,
    state: () => state,
    stopped: () => stopped,
  };
}

test('confirmed root recovery opens one fixed destination and exposes a bounded navigation fallback', async (t) => {
  const f = fixture(t);
  f.requests[0].resolve(session());
  await flush();
  assert.deepEqual(f.navigations, ['/dashboard']);
  assert.deepEqual(f.state(), { phase: 'opening', destination: '/dashboard' });
  t.mock.timers.tick(WORKSPACE_OPEN_DEADLINE - 1);
  assert.equal(f.state().phase, 'opening');
  t.mock.timers.tick(1);
  assert.deepEqual(f.state(), { phase: 'stalled', destination: '/dashboard' });
  assert.equal(
    f.stopped(),
    1,
    'The deadline stops the pending document load before exposing controls',
  );
  assert.deepEqual(
    f.navigations,
    ['/dashboard'],
    'No repeated navigation or competing refresh',
  );
});

test('verified accounts without a wedding open setup and cannot inject another return URL', async (t) => {
  const f = fixture(t);
  f.requests[0].resolve({
    ...session(null),
    redirect: 'https://other.example',
    destination: 'javascript:alert(1)',
  });
  await flush();
  assert.deepEqual(f.navigations, ['/wedding-setup']);
  t.mock.timers.tick(WORKSPACE_OPEN_DEADLINE);
  assert.equal(f.state().destination, '/wedding-setup');
});

test('a checking deadline aborts its request and ignores a later success; Retry starts a new check', async (t) => {
  const f = fixture(t);
  t.mock.timers.tick(SESSION_CHECK_DEADLINE);
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.state().phase, 'failed');
  assert.equal(f.state().destination, undefined);
  f.flow.start();
  assert.equal(f.state().phase, 'checking');
  f.requests[0].resolve(session());
  await flush();
  assert.equal(f.state().phase, 'checking');
  assert.deepEqual(f.navigations, []);
  f.requests[1].resolve(session(null));
  await flush();
  assert.deepEqual(f.navigations, ['/wedding-setup']);
});

test('after the deadline stops navigation, Retry clears its destination/timer before revalidation', async (t) => {
  const f = fixture(t);
  f.requests[0].resolve(session());
  await flush();
  t.mock.timers.tick(WORKSPACE_OPEN_DEADLINE);
  f.flow.start();
  assert.equal(f.stopped(), 1);
  assert.deepEqual(f.state(), { phase: 'checking' });
  t.mock.timers.tick(WORKSPACE_OPEN_DEADLINE);
  assert.equal(f.state().phase, 'checking');
  f.requests[1].reject({ code: 'SESSION_EXPIRED' });
  await flush();
  assert.deepEqual(f.state(), { phase: 'guest' });
  assert.equal(f.state().destination, undefined);
  t.mock.timers.tick(SESSION_CHECK_DEADLINE);
  assert.equal(f.state().phase, 'guest');
});

test('confirmed expiry reveals the public homepage while temporary failures retain retry without Continue', async (t) => {
  const f = fixture(t);
  f.requests[0].reject({
    code: 'NETWORK_ERROR',
    message: 'Connection interrupted.',
  });
  await flush();
  assert.deepEqual(f.state(), {
    phase: 'failed',
    message: 'Connection interrupted.',
  });
  assert.equal(f.state().destination, undefined);
  assert.deepEqual(f.navigations, []);
  f.flow.start();
  f.requests[1].reject({ code: 'SESSION_EXPIRED' });
  await flush();
  assert.equal(f.state().phase, 'guest');
  assert.deepEqual(f.navigations, []);
});

test('rapid replacement rejects late successes/failures from canceled attempts', async (t) => {
  const f = fixture(t);
  f.flow.start();
  f.flow.start();
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.requests[1].signal.aborted, true);
  f.requests[2].resolve(session(null));
  await flush();
  f.requests[0].resolve(session());
  f.requests[1].reject({ code: 'SESSION_EXPIRED' });
  await flush();
  assert.deepEqual(f.navigations, ['/wedding-setup']);
  assert.equal(f.state().phase, 'opening');
  assert.equal(f.state().destination, '/wedding-setup');
});

test('unmount/StrictMode cleanup aborts checks, clears opening deadlines and prevents later updates', async (t) => {
  const f = fixture(t);
  f.flow.dispose();
  assert.equal(f.requests[0].signal.aborted, true);
  f.requests[0].resolve(session());
  await flush();
  t.mock.timers.tick(SESSION_CHECK_DEADLINE + WORKSPACE_OPEN_DEADLINE);
  f.flow.start();
  assert.deepEqual(f.navigations, []);
  assert.deepEqual(f.states, []);
});

test('unmount after opening cancels the fallback without stopping a successful new document', async (t) => {
  const f = fixture(t);
  f.requests[0].resolve(session());
  await flush();
  const count = f.states.length;
  f.flow.dispose();
  t.mock.timers.tick(WORKSPACE_OPEN_DEADLINE);
  assert.equal(f.states.length, count);
  assert.equal(f.stopped(), 0);
});

test('an immediate navigation failure exposes a safe confirmed destination instead of an indefinite spinner', async (t) => {
  const f = fixture(t, {
    navigate: () => {
      throw new Error('Navigation interrupted');
    },
  });
  f.requests[0].resolve(session());
  await flush();
  assert.equal(f.state().phase, 'stalled');
  assert.equal(f.state().destination, '/dashboard');
  t.mock.timers.tick(SESSION_CHECK_DEADLINE);
  assert.equal(f.state().phase, 'stalled');
});

test('invalid success data cannot authorize navigation or remove the checking deadline without recovery', async (t) => {
  const f = fixture(t);
  f.requests[0].resolve({ success: true });
  await flush();
  assert.equal(f.state().phase, 'failed');
  assert.equal(f.state().destination, undefined);
  assert.deepEqual(f.navigations, []);
});
