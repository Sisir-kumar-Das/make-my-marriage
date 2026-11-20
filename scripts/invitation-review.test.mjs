import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, Script } from 'node:vm';
import { loadBindings, transform } from 'next/dist/build/swc/index.js';
import * as invitationData from '../apps/web/src/features/invitations/invitation-data.js';
import * as idempotencyKey from '../apps/web/src/lib/idempotency-key.js';

// Drive the actual component and its async handlers without a new test framework.
await loadBindings();
const { code } = await transform(
  await readFile(
    new URL(
      '../apps/web/src/features/invitations/accept-invitation.jsx',
      import.meta.url,
    ),
    'utf8',
  ),
  {
    filename: 'accept-invitation.jsx',
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      target: 'es2022',
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  },
);
// Class names come from the real stylesheet, so a typo or missing class fails the test.
const classNames = new Set(
  (
    await readFile(
      new URL(
        '../apps/web/src/features/invitations/invitations.module.css',
        import.meta.url,
      ),
      'utf8',
    )
  ).match(/(?<=\.)[A-Za-z_][\w-]*/g),
);
const styles = new Proxy(
  {},
  {
    get(_, name) {
      if (typeof name === 'symbol') return undefined;
      assert.ok(classNames.has(name), `Unknown CSS class ${name}`);
      return name;
    },
  },
);
const account = (id = 'a', joined = false) => ({
  user: { id, email: `${id}@example.invalid` },
  wedding: joined ? { id: 'wedding' } : null,
});
const pending = () => ({
  state: 'PENDING',
  accountId: 'a',
  version: 0,
  email: 'a@example.invalid',
  role: 'FAMILY_MEMBER',
  relationship: 'Friend',
  inviterName: 'Test Admin',
  wedding: { name: 'Synthetic wedding', mainDate: '2030-01-01', city: '' },
  expiresAt: '2030-01-01T00:00:00Z',
});

function probe(t, fromApp = false, token = 'T'.repeat(43)) {
  const cells = [],
    requests = [],
    window = new EventTarget();
  window.location = { hash: `#token=${token}` };
  let cursor = 0,
    dirty = true,
    effects = [],
    tree;
  const hooks = {
    useState(initial) {
      const i = cursor++;
      cells[i] ||= {
        value: typeof initial === 'function' ? initial() : initial,
      };
      const cell = cells[i];
      return [
        cell.value,
        (next) => {
          const value = typeof next === 'function' ? next(cell.value) : next;
          if (!Object.is(value, cell.value)) {
            cell.value = value;
            dirty = true;
          }
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
  const element = (type, props, key) => ({ type, props: props || {}, key });
  const imports = {
    react: hooks,
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'next/link': { __esModule: true, default: 'Link' },
    'radix-ui': {
      AlertDialog: new Proxy(
        {},
        { get: (_, name) => `AlertDialog.${String(name)}` },
      ),
    },
    'lucide-react': Object.fromEntries(
      [
        'BadgeCheck',
        'Ban',
        'Building2',
        'CalendarDays',
        'CheckCheck',
        'CircleX',
        'History',
        'Mail',
        'MapPin',
        'ShieldCheck',
        'Unlink',
        'UserRoundX',
        'UserX',
      ].map((name) => [name, name]),
    ),
    '@/features/home/brand': { Brand: 'Brand' },
    '@/features/home/fonts': {
      inter: { variable: 'inter' },
      playfair: { variable: 'playfair' },
    },
    '@/lib/idempotency-key': idempotencyKey,
    '@/lib/api-client': {
      apiRequest(path, options) {
        const deferred = Promise.withResolvers();
        requests.push({ path, options, ...deferred });
        return deferred.promise;
      },
    },
    './use-invitation-context': { useInvitationContext: () => token },
    './invitation-data': invitationData,
    './invitations.module.css': { __esModule: true, default: styles },
  };
  const exports = {},
    context = createContext({
      exports,
      require(name) {
        assert.ok(name in imports, `Unexpected import ${name}`);
        return imports[name];
      },
      window,
      document: { visibilityState: 'visible' },
      AbortController,
      crypto: globalThis.crypto,
      setInterval: () => 1,
      clearInterval() {},
    });
  new Script(code, { filename: 'accept-invitation.jsx' }).runInContext(context);
  function render() {
    let passes = 0;
    do {
      assert.ok(++passes < 20, 'Component did not settle');
      dirty = false;
      cursor = 0;
      effects = [];
      const root = exports.AcceptInvitation({
        invitationId: fromApp ? 'a'.repeat(24) : '',
      });
      tree = root.type(root.props);
      for (const effect of effects) effect();
    } while (dirty);
  }
  // Expand small stateless helpers (for example the signed-out actions) into their markup.
  const expand = (x) => (typeof x?.type === 'function' ? x.type(x.props) : x);
  const text = (x) =>
    x == null || typeof x === 'boolean'
      ? ''
      : Array.isArray(x)
        ? x.map(text).join('')
        : typeof x === 'object'
          ? typeof x.type === 'function'
            ? text(expand(x))
            : text(x.props?.children)
          : String(x);
  const nodes = (x) =>
    !x || typeof x !== 'object'
      ? []
      : Array.isArray(x)
        ? x.flatMap(nodes)
        : typeof x.type === 'function'
          ? nodes(expand(x))
          : [x, ...nodes(x.props?.children)];
  const button = (name) =>
    nodes(tree).find((x) => x.type === 'button' && text(x) === name);
  const flush = async () => {
    await new Promise(setImmediate);
    render();
  };
  async function read(session = account(), preview = pending()) {
    for (const request of requests.filter((r) => !r.handled)) {
      assert.ok(
        request.path === '/auth/session' ||
          request.path.endsWith('/preview') ||
          request.path.includes('/inbox/'),
      );
      request.handled = true;
      request.resolve({
        data: request.path === '/auth/session' ? session : preview,
      });
    }
    await flush();
  }
  function start(action) {
    if (action === 'decline' && !button('Confirm rejection')) {
      button('Reject invitation').props.onClick();
      render();
    }
    const sending = button(
      action === 'accept'
        ? button('Retry acceptance')
          ? 'Retry acceptance'
          : 'Accept invitation'
        : 'Confirm rejection',
    ).props.onClick();
    render();
    const request = requests.at(-1);
    request.handled = true;
    return { sending, request };
  }
  render();
  t.after(() => {
    for (const cell of cells) cell.cleanup?.();
  });
  // Answer pending requests as a signed-out visitor: confirmed session expiry, optional preview.
  async function signedOut(preview) {
    for (const request of requests.filter((r) => !r.handled)) {
      request.handled = true;
      if (request.path === '/auth/session')
        request.reject(
          Object.assign(new Error('Please sign in to continue.'), {
            status: 401,
            code: 'SESSION_EXPIRED',
          }),
        );
      else request.resolve({ data: preview });
    }
    await flush();
  }
  return {
    requests,
    render,
    signedOut,
    nodes: () => nodes(tree),
    flush,
    read,
    start,
    button,
    text: () => text(tree),
    focus() {
      window.dispatchEvent(new Event('focus'));
      render();
    },
  };
}

for (const fromApp of [false, true])
  for (const action of ['accept', 'decline']) {
    test(`${fromApp ? 'app' : 'email'} ${action}: service 503 retains the exact decision across a pending refresh`, async (t) => {
      const p = probe(t, fromApp);
      await p.read();
      const first = p.start(action);
      first.request.reject(
        Object.assign(new Error('Temporary failure'), {
          status: 503,
          code: 'INVITATION_UNAVAILABLE',
        }),
      );
      await first.sending;
      await p.flush();
      assert.equal(
        p.button(
          action === 'accept' ? 'Reject invitation' : 'Accept invitation',
        ).props.disabled,
        true,
      );
      p.button('Refresh invitation status').props.onClick();
      await p.flush();
      await p.read(account(), { ...pending(), version: 7 });
      assert.equal(
        p.button(
          action === 'accept' ? 'Reject invitation' : 'Accept invitation',
        ).props.disabled,
        true,
      );
      const retry = p.start(action);
      assert.equal(retry.request.path, first.request.path);
      assert.equal(retry.request.options.body, first.request.options.body);
      assert.equal(
        retry.request.options.headers['Idempotency-Key'],
        first.request.options.headers['Idempotency-Key'],
      );
      retry.request.resolve({ data: { replayed: true } });
      await p.flush();
      await p.read(account('a', action === 'accept'));
      await retry.sending;
      await p.flush();
      assert.ok(
        p
          .text()
          .includes(
            action === 'accept'
              ? 'Welcome to the celebration!'
              : 'You have not joined this wedding.',
          ),
      );
    });
  }

test('confirmed terminal unavailability refreshes the closed invitation instead of retaining a decision', async (t) => {
  const p = probe(t);
  await p.read();
  const first = p.start('accept');
  first.request.reject(
    Object.assign(new Error('Inviting Admin unavailable'), {
      status: 400,
      code: 'INVITATION_UNAVAILABLE',
    }),
  );
  await first.sending;
  await p.flush();
  await p.read(account(), { state: 'UNAVAILABLE' });
  assert.ok(p.text().includes('This invitation is unavailable.'));
  assert.equal(p.button('Accept invitation'), undefined);
  assert.equal(p.button('Retry acceptance'), undefined);
});

for (const action of ['accept', 'decline']) {
  test(`${action} completion belongs only to the confirmed actor and is cleared on account change`, async (t) => {
    const p = probe(t);
    await p.read();
    const save = p.start(action);
    save.request.resolve({ data: {} });
    await p.flush();
    await p.read(account('a', action === 'accept'));
    await save.sending;
    await p.flush();
    const successText =
      action === 'accept'
        ? 'Welcome to the celebration!'
        : 'You have not joined this wedding.';
    assert.ok(p.text().includes(successText));
    p.focus();
    assert.equal(
      p.text().includes(successText),
      false,
      'Unverified refresh must hide previous completion',
    );
    await p.read(account('b'), {
      state: action === 'accept' ? 'ACCEPTED' : 'DECLINED',
    });
    assert.equal(p.text().includes(successText), false);
    p.focus();
    await p.read(account('a', action === 'accept'), {
      state: action === 'accept' ? 'ACCEPTED' : 'DECLINED',
    });
    assert.equal(
      p.text().includes(successText),
      false,
      'Returning to A shows terminal state, not stale completion',
    );
  });
}

test('a background refresh keeps the loaded invitation and its buttons, so clicks are not lost', async (t) => {
  const p = probe(t);
  await p.read();
  assert.ok(p.button('Accept invitation'));
  p.focus();
  assert.equal(p.text().includes('Checking your invitation'), false);
  assert.equal(p.button('Accept invitation').props.disabled, false);
  assert.ok(p.button('Reject invitation'));
  assert.ok(p.button('Refreshing…'));
  await p.read();
  assert.ok(p.button('Refresh invitation status'));
});

// Signed-out visitors get Sign in as the main action; My Invitations stays visible but disabled.
function assertSignedOutActions(p, loginHref) {
  const signIn = p
    .nodes()
    .find((x) => ['a', 'Link'].includes(x.type) && x.props.href === loginHref);
  assert.ok(signIn, 'Sign in link is shown');
  assert.equal(signIn.props.className, 'primary', 'Sign in is the main action');
  const mine = p.button('My Invitations');
  // aria-disabled keeps it focusable for screen readers, and a click does nothing.
  assert.equal(mine.props['aria-disabled'], 'true');
  assert.equal(mine.props.disabled, undefined);
  const click = {
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  mine.props.onClick(click);
  assert.equal(click.prevented, true);
  assert.equal(mine.props['aria-describedby'], 'invitation-sign-in-hint');
  assert.ok(p.text().includes('Sign in to see your invitations.'));
  assert.equal(
    p.nodes().some((x) => x.type === 'Link' && x.props.href === '/invitations'),
    false,
    'No live My Invitations link while signed out',
  );
}

test('signed-out broken link: Sign in is main and My Invitations is disabled', async (t) => {
  const p = probe(t, false, '');
  assert.ok(p.text().includes('Open your invitation link.'));
  // No buttons flash while sign-in is still being checked.
  assert.equal(
    p
      .nodes()
      .some(
        (x) =>
          ['/invitations', '/login'].includes(x.props.href) ||
          (x.type === 'button' && x.props.children === 'My Invitations'),
      ),
    false,
    'No actions before the sign-in check finishes',
  );
  await p.signedOut();
  assertSignedOutActions(p, '/login');
});

test('signed-in broken link keeps My Invitations active', async (t) => {
  const p = probe(t, false, '');
  await p.read();
  assert.equal(p.button('My Invitations'), undefined);
  assert.ok(
    p.nodes().some((x) => x.type === 'Link' && x.props.href === '/invitations'),
  );
  assert.equal(p.text().includes('Sign in to see your invitations.'), false);
  assert.equal(
    p.nodes().some((x) => x.type === 'Link' && x.props.href === '/login'),
    false,
    'No Sign in link for a signed-in visitor',
  );
});

test('broken link with a failed sign-in check offers both My Invitations and Sign in', async (t) => {
  const p = probe(t, false, '');
  const check = p.requests.at(-1);
  check.handled = true;
  check.reject(Object.assign(new Error('Network down'), { status: 0 }));
  await p.flush();
  for (const href of ['/invitations', '/login'])
    assert.ok(
      p.nodes().some((x) => x.type === 'Link' && x.props.href === href),
    );
  assert.equal(p.button('My Invitations'), undefined);
});

test('signed-out closed invitation: Sign in is main and My Invitations is disabled', async (t) => {
  const p = probe(t);
  await p.signedOut({ state: 'EXPIRED' });
  assert.ok(p.text().includes('This invitation has expired.'));
  const signIn = p
    .nodes()
    .find((x) => x.type === 'a' && x.props.href?.startsWith('/login'));
  assert.ok(signIn);
  assertSignedOutActions(p, signIn.props.href);
  assert.equal(p.button('Reject invitation'), undefined);
});

// Each closed or blocked state has its own badge (Stitch edge states), not the generic shield.
const badge = (p) => {
  const node = p.nodes().find((x) => x.props.className === 'acceptBadge');
  return [node.props.children[0].type, node.props.children[1]];
};
for (const [state, icon, label] of [
  ['INVALID', 'Unlink', 'Invalid link'],
  ['EXPIRED', 'History', 'Expired invitation – 7-day limit'],
  ['REVOKED', 'UserX', 'Revoked invitation – Admin action'],
  ['UNAVAILABLE', 'Ban', 'Invitation unavailable'],
  ['DECLINED', 'CircleX', 'Invitation declined'],
  ['ACCEPTED', 'CheckCheck', 'Already used – Single-use link'],
])
  test(`${state} invitation shows its own badge`, async (t) => {
    const p = probe(t);
    await p.signedOut({ state });
    assert.deepEqual(badge(p), [icon, label]);
  });

test('pending, wrong-email, one-wedding and missing-link badges', async (t) => {
  let p = probe(t);
  await p.read();
  assert.deepEqual(badge(p), ['ShieldCheck', 'Wedding workspace invitation']);
  p = probe(t);
  await p.read(account('b'));
  assert.deepEqual(badge(p), ['UserRoundX', 'Wrong email address']);
  p = probe(t);
  await p.read(account('a', true));
  assert.deepEqual(badge(p), ['Building2', 'One wedding per account']);
  p = probe(t, false, '');
  assert.deepEqual(badge(p), ['Unlink', 'Invitation link missing']);
});
