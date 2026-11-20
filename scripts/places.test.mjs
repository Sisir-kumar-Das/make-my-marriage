import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  createEventSchema,
  patchEventSchema,
} from '../apps/api/src/events/validation.js';
import {
  eventInput,
  initialEvent,
  mapsLink,
  venueLabel,
} from '../apps/web/src/features/events/form-data.js';
import {
  createPlacesLoader,
  placesRequest,
  placesUnavailable,
  livePlaceDetails,
} from '../apps/web/src/features/events/google-places.js';

const event = {
  name: 'Family ceremony',
  type: 'CUSTOM',
  startAt: '2020-02-20T10:00:00Z',
  endAt: '2020-02-20T12:00:00Z',
};
const google = {
  source: 'GOOGLE',
  googlePlaceId: 'ChIJ_synthetic-test-123',
  name: '',
  formattedAddress: '',
  city: '',
  state: '',
};
const ownDetails = {
  name: 'Our reception hall',
  formattedAddress: 'Use the north gate',
  city: 'Cuttack',
  state: 'Odisha',
};

test('Google venue accepts a reference without a stored provider snapshot and rejects unsafe/injected payloads', () => {
  assert.deepEqual(
    createEventSchema.parse({ ...event, venue: google }).venue,
    google,
  );
  assert.equal(patchEventSchema.safeParse({ venue: google }).success, true);
  for (const patch of [
    { googlePlaceId: '' },
    { googlePlaceId: 'x'.repeat(513) },
    { googlePlaceId: 'https://attacker.example' },
    { googlePlaceId: 'id with spaces' },
    { googlePlaceId: { $ne: null } },
    { googlePlaceId: null },
    { displayName: 'Provider content' },
    { latitude: 20 },
    { longitude: 85 },
    { location: {} },
    { attributions: [] },
    { source: 'MANUAL' },
  ])
    assert.equal(
      createEventSchema.safeParse({ ...event, venue: { ...google, ...patch } })
        .success,
      false,
    );
  assert.equal(
    createEventSchema.safeParse({ ...event, venue: { source: 'GOOGLE' } })
      .success,
    false,
  );
});

test('legacy manual normalization and request hashing stay unchanged', () => {
  const expected = {
    ...event,
    startAt: '2020-02-20T10:00:00.000Z',
    endAt: '2020-02-20T12:00:00.000Z',
    description: '',
    status: 'PLANNED',
    venue: { source: 'MANUAL', ...ownDetails },
  };
  const parsed = createEventSchema.parse({ ...event, venue: ownDetails });
  assert.deepEqual(parsed, expected);
  const hash = (value) =>
    createHash('sha256')
      .update(
        JSON.stringify(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        ),
      )
      .digest('hex');
  assert.equal(hash(parsed), hash(expected));
  assert.equal(
    createEventSchema.parse({ ...event, venue: { name: '' } }).venue,
    null,
  );
});

test('form serializes only the selected ID and independently entered fields; unlinking preserves all entered details', () => {
  const values = initialEvent(
    {},
    { ...event, venue: { ...google, ...ownDetails } },
  );
  // Even an accidental transient property cannot enter the API payload.
  const payload = eventInput({
    ...values,
    displayName: 'Live provider name',
    latitude: 20,
  });
  assert.deepEqual(payload.venue, { ...google, ...ownDetails });
  assert.deepEqual(createEventSchema.parse(payload).venue, payload.venue);
  assert.deepEqual(initialEvent({}, payload), values);
  assert.deepEqual(eventInput({ ...values, googlePlaceId: '' }).venue, {
    source: 'MANUAL',
    ...ownDetails,
  });
  assert.deepEqual(
    eventInput({ ...values, venueName: '', address: '', city: '', state: '' })
      .venue,
    google,
  );
});

test('Maps links use a fixed Google origin and encode user text and reference; list labels need no provider request', () => {
  const link = new URL(mapsLink({ ...google, name: 'Hall & Garden? #1' }));
  assert.equal(link.origin, 'https://www.google.com');
  assert.equal(link.searchParams.get('query_place_id'), google.googlePlaceId);
  assert.equal(link.searchParams.get('query'), 'Hall & Garden? #1');
  assert.equal(
    new URL(mapsLink(google)).searchParams.get('query'),
    'Wedding venue',
  );
  assert.equal(
    mapsLink({ source: 'GOOGLE', googlePlaceId: 'https://evil.test' }),
    null,
  );
  assert.equal(venueLabel(google), 'Google Maps venue');
  assert.equal(
    venueLabel({ ...google, ...ownDetails }),
    'Our reception hall, Cuttack',
  );
  assert.equal(venueLabel(null), 'Venue to be decided');
});

function sdkFixture(onAppend, key = 'restricted-test-key', timeoutMs = 20) {
  const win = {};
  const scripts = [];
  const library = { Place: class {} };
  const doc = {
    createElement: () => ({
      remove() {
        this.removed = true;
      },
    }),
    head: {
      append(script) {
        scripts.push(script);
        onAppend?.({ win, script, library });
      },
    },
  };
  const load = createPlacesLoader({
    getWindow: () => win,
    getDocument: () => doc,
    getKey: () => key,
    timeoutMs,
  });
  return { win, scripts, library, load };
}
function ready({ win, script, library }) {
  win.google = {
    maps: {
      importLibrary: async (name) => {
        assert.equal(name, 'places');
        return library;
      },
    },
  };
  win[new URL(script.src).searchParams.get('callback')]();
}
test('concurrent consumers share a single lazy SDK load, restricted to the official SDK endpoint', async () => {
  const fixture = sdkFixture((args) => queueMicrotask(() => ready(args)));
  const [a, b] = await Promise.all([fixture.load(), fixture.load()]);
  assert.equal(a, fixture.library);
  assert.equal(a, b);
  assert.equal(fixture.scripts.length, 1);
  assert.equal(
    new URL(fixture.scripts[0].src).origin,
    'https://maps.googleapis.com',
  );
  assert.equal(
    new URL(fixture.scripts[0].src).searchParams.get('libraries'),
    'places',
  );
});
test('missing key makes no external request and reports a usable manual-entry fallback', async () => {
  const fixture = sdkFixture(null, '');
  await assert.rejects(fixture.load(), { message: placesUnavailable });
  assert.equal(fixture.scripts.length, 0);
});
test('network failure removes the failed script and allows a clean retry', async () => {
  let calls = 0;
  const fixture = sdkFixture((args) =>
    queueMicrotask(() => (++calls === 1 ? args.script.onerror() : ready(args))),
  );
  await assert.rejects(fixture.load(), { message: placesUnavailable });
  assert.equal(fixture.scripts[0].removed, true);
  assert.equal(await fixture.load(), fixture.library);
  assert.equal(fixture.scripts.length, 2);
});
test('SDK timeout permits retry and a late old callback cannot resolve the new attempt', async () => {
  let oldCallback;
  const fixture = sdkFixture(
    (args) => {
      const callback = new URL(args.script.src).searchParams.get('callback');
      if (!oldCallback) oldCallback = callback;
      else
        queueMicrotask(() => {
          args.win[oldCallback]();
          ready(args);
        });
    },
    'restricted-test-key',
    5,
  );
  await assert.rejects(fixture.load(), { message: placesUnavailable });
  assert.equal(await fixture.load(), fixture.library);
});
test('authorization rejection restores an existing handler without leaking provider errors', async () => {
  const fixture = sdkFixture(({ win }) =>
    queueMicrotask(() => win.gm_authFailure()),
  );
  const previous = () => {};
  fixture.win.gm_authFailure = previous;
  await assert.rejects(fixture.load(), { message: placesUnavailable });
  assert.equal(fixture.win.gm_authFailure, previous);
});
test('hung and rejected provider requests finish safely; later responses cannot overwrite the completed result', async () => {
  await assert.rejects(
    placesRequest(() => new Promise(() => {}), 5),
    { message: placesUnavailable },
  );
  await assert.rejects(
    placesRequest(() => {
      throw new Error('private-key-in-provider-URL');
    }),
    { message: placesUnavailable },
  );
  assert.equal(await placesRequest(async () => 'ok'), 'ok');
});
test('transient details retain required attribution and refuse executable provider links', () => {
  const details = livePlaceDetails({
    displayName: 'Live name',
    formattedAddress: 'Live address',
    location: { lat: 20 },
    attributions: [
      { provider: 'Source A', providerURI: 'https://example.com/provider' },
      { provider: 'Source B', providerURI: 'javascript:alert(1)' },
    ],
  });
  assert.deepEqual(details, {
    name: 'Live name',
    address: 'Live address',
    attributions: [
      { provider: 'Source A', href: 'https://example.com/provider' },
      { provider: 'Source B', href: undefined },
    ],
  });
  assert.equal(details.location, undefined);
});

test('detail retries are isolated to the exact selection, including another prediction for the same venue', async () => {
  const { sameVenueSelection, venueDetailAttempt } =
    await import('../apps/web/src/features/events/venue-state.js');
  const a = { placeId: 'venue-A', prediction: { session: 'A' } };
  const b = { placeId: 'venue-B', prediction: { session: 'B' } };
  const retry = { selection: a, attempt: 1 };
  assert.equal(venueDetailAttempt(retry, a), 1);
  assert.equal(venueDetailAttempt(retry, b), 0);
  assert.equal(
    venueDetailAttempt(retry, {
      placeId: a.placeId,
      prediction: { session: 'new-A' },
    }),
    0,
  );
  assert.equal(sameVenueSelection(a, { ...a }), true);
  assert.equal(sameVenueSelection(a, b), false);
  assert.equal(
    sameVenueSelection(a, { placeId: a.placeId, prediction: undefined }),
    false,
  );
  assert.equal(venueDetailAttempt(null, b), 0);
});

test('initial ArrowUp selects the final suggestion; arrows wrap correctly for every list size', async () => {
  const { nextSuggestionIndex } =
    await import('../apps/web/src/features/events/venue-state.js');
  for (const count of [1, 3, 5]) {
    assert.equal(nextSuggestionIndex(-1, count, 'ArrowUp'), count - 1);
    assert.equal(nextSuggestionIndex(-1, count, 'ArrowDown'), 0);
    assert.equal(nextSuggestionIndex(0, count, 'ArrowUp'), count - 1);
    assert.equal(nextSuggestionIndex(count - 1, count, 'ArrowDown'), 0);
    assert.equal(nextSuggestionIndex(count + 1, count, 'ArrowUp'), count - 1);
  }
  assert.equal(nextSuggestionIndex(-1, 0, 'ArrowUp'), -1);
});

test('repeating a query cannot expose predictions belonging to a completed or replaced autocomplete session', async () => {
  const { currentVenueSearch } =
    await import('../apps/web/src/features/events/venue-state.js');
  const firstToken = {},
    secondToken = {};
  const result = {
    key: 'Mayfair:0',
    sessionToken: firstToken,
    suggestions: [{ placeId: 'venue-A' }],
  };
  assert.equal(currentVenueSearch(result, 'Mayfair:0', firstToken), result);
  // Selection releases the token immediately, before another debounced search starts.
  assert.equal(currentVenueSearch(result, 'Mayfair:0', null), null);
  assert.equal(currentVenueSearch(result, 'Mayfair:0', secondToken), null);
  assert.equal(
    currentVenueSearch(result, 'Different query:0', firstToken),
    null,
  );
  const fresh = { ...result, sessionToken: secondToken };
  assert.equal(currentVenueSearch(fresh, 'Mayfair:0', secondToken), fresh);
  assert.equal(currentVenueSearch(null, 'Mayfair:0', null), null);
  const failure = { key: 'Mayfair:0', error: true };
  assert.equal(currentVenueSearch(failure, 'Mayfair:0', null), failure);
});
