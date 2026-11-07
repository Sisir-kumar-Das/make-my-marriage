import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';

// Real Mongoose connection state, with all client/model I/O stubbed. No URI,
// environment file, server or database fixture is used by these checks.
function databaseFixture(
  t,
  {
    onConnect = async () => {},
    onInitialize = async () => {},
    onClose = async () => {},
  } = {},
) {
  const clients = [];
  t.mock.method(mongoose, 'createConnection', () => {
    const client = new mongoose.Connection(mongoose);
    client.readyState = 1;
    // These internals exercise Mongoose's real stale-heartbeat getter. Review
    // the fixture when upgrading Mongoose if its state representation changes.
    client.client = {
      topology: {
        s: {
          description: {
            type: 'ReplicaSetWithPrimary',
            heartbeatFrequencyMS: 10000,
          },
        },
      },
    };
    client._lastHeartbeatAt = Date.now();
    t.mock.method(client, 'asPromise', async () => {
      await onConnect();
      return client;
    });
    t.mock.method(client, 'model', (name) => {
      client.models[name] = { init: onInitialize };
      return client.models[name];
    });
    t.mock.method(client, 'close', async () => {
      await onClose();
      client.readyState = 0;
    });
    clients.push(client);
    return client;
  });
  const database = createAuthDatabase({
    mongodbUri: 'mock-only-no-network',
    mongodbDbName: 'memory-only',
  });
  return { database, clients };
}

test('concurrent database initialization shares one client and shutdown closes it', async (t) => {
  const { database, clients } = databaseFixture(t);
  const results = await Promise.all(
    Array.from({ length: 20 }, () => database.connect()),
  );
  assert.equal(clients.length, 1);
  for (const result of results) assert.equal(result, clients[0]);
  await database.close();
  assert.equal(clients[0].close.mock.callCount(), 1);
});

test('stale heartbeats and temporary disconnections retain the owned client through recovery', async (t) => {
  const { database, clients } = databaseFixture(t);
  const original = await database.connect();

  for (let cycle = 0; cycle < 10; cycle += 1) {
    original._lastHeartbeatAt = Date.now() - 30000;
    assert.equal(original._readyState, 1);
    assert.equal(original.readyState, 0);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => database.connect()),
    );
    for (const result of results) assert.equal(result, original);
    original._lastHeartbeatAt = Date.now();
    assert.equal(original.readyState, 1);
  }

  original.readyState = 0;
  assert.equal(await database.connect(), original);
  original.readyState = 1;
  assert.equal(await database.connect(), original);
  assert.equal(clients.length, 1);
  assert.equal(original.close.mock.callCount(), 0);
  await database.close();
  assert.equal(original.close.mock.callCount(), 1);
});

test('failed initialization releases its client and a subsequent attempt can connect', async (t) => {
  let failInitialization = true;
  const { database, clients } = databaseFixture(t, {
    onInitialize: async () => {
      if (failInitialization) {
        failInitialization = false;
        throw new Error('Synthetic model initialization failure');
      }
    },
  });
  await assert.rejects(database.connect(), { code: 'AUTH_UNAVAILABLE' });
  assert.equal(clients.length, 1);
  assert.equal(clients[0].close.mock.callCount(), 1);

  const recovered = await database.connect();
  assert.equal(clients.length, 2);
  assert.equal(recovered, clients[1]);
  await database.close();
  assert.equal(clients[1].close.mock.callCount(), 1);
});

test('close waits for pending initialization before releasing the client', async (t) => {
  let finishConnection;
  const opening = new Promise((resolve) => {
    finishConnection = resolve;
  });
  const { database, clients } = databaseFixture(t, {
    onConnect: () => opening,
  });
  const pendingConnection = database.connect();
  const closing = database.close();
  assert.equal(clients[0].close.mock.callCount(), 0);
  finishConnection();
  await pendingConnection;
  await closing;
  assert.equal(clients.length, 1);
  assert.equal(clients[0].close.mock.callCount(), 1);

  // A completed explicit close releases ownership for a fresh lifecycle.
  assert.equal(await database.connect(), clients[1]);
  assert.equal(clients.length, 2);
  await database.close();
  assert.equal(clients[1].close.mock.callCount(), 1);
});

test('concurrent close calls share shutdown and new connects receive 503 until it finishes', async (t) => {
  const closeStarted = Promise.withResolvers();
  const finishClose = Promise.withResolvers();
  const { database, clients } = databaseFixture(t, {
    onClose: async () => {
      closeStarted.resolve();
      await finishClose.promise;
    },
  });
  await database.connect();
  const closing = database.close();
  assert.equal(database.close(), closing);
  try {
    await assert.rejects(database.connect(), {
      status: 503,
      code: 'AUTH_UNAVAILABLE',
    });
    await closeStarted.promise;
    await assert.rejects(database.connect(), {
      status: 503,
      code: 'AUTH_UNAVAILABLE',
    });
    assert.equal(clients.length, 1);
    assert.equal(clients[0].close.mock.callCount(), 1);
  } finally {
    finishClose.resolve();
    await closing;
  }

  const reopened = await database.connect();
  assert.equal(reopened, clients[1]);
  assert.equal(clients.length, 2);
  await database.close();
});

test('concurrent callers share a failed opening attempt and can retry after cleanup', async (t) => {
  const opening = Promise.withResolvers();
  let openings = 0;
  const { database, clients } = databaseFixture(t, {
    onConnect: async () => {
      if (openings++ === 0) await opening.promise;
    },
  });
  const expectedError = { status: 503, code: 'AUTH_UNAVAILABLE' };
  const first = assert.rejects(database.connect(), expectedError);
  const second = assert.rejects(database.connect(), expectedError);
  opening.reject(new Error('Synthetic connection failure'));
  await Promise.all([first, second]);
  assert.equal(clients.length, 1);
  assert.equal(clients[0].close.mock.callCount(), 1);

  const recovered = await database.connect();
  assert.equal(recovered, clients[1]);
  assert.equal(clients.length, 2);
  await database.close();
});

test('shutdown waits for failed opening cleanup before allowing a deliberate reopen', async (t) => {
  const opening = Promise.withResolvers();
  const closeStarted = Promise.withResolvers();
  const finishClose = Promise.withResolvers();
  let openings = 0;
  const { database, clients } = databaseFixture(t, {
    onConnect: async () => {
      if (openings++ === 0) await opening.promise;
    },
    onClose: async () => {
      closeStarted.resolve();
      await finishClose.promise;
    },
  });
  const expectedError = { status: 503, code: 'AUTH_UNAVAILABLE' };
  const failed = assert.rejects(database.connect(), expectedError);
  const closing = database.close();
  opening.reject(new Error('Synthetic connection failure during shutdown'));
  try {
    await closeStarted.promise;
    await assert.rejects(database.connect(), expectedError);
    assert.equal(clients.length, 1);
  } finally {
    finishClose.resolve();
    await Promise.all([failed, closing]);
  }
  assert.equal(clients[0].close.mock.callCount(), 1);

  const reopened = await database.connect();
  assert.equal(reopened, clients[1]);
  assert.equal(clients.length, 2);
  await database.close();
});
