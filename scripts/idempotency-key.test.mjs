import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { newIdempotencyKey } from '../apps/web/src/lib/idempotency-key.js';
import { idempotencyKeySchema } from '../apps/api/src/weddings/validation.js';
import { taskKeySchema } from '../apps/api/src/tasks/validation.js';
import { eventKeySchema } from '../apps/api/src/events/validation.js';

test('keys satisfy every API key rule, with and without crypto.randomUUID', () => {
  const original = Object.getOwnPropertyDescriptor(
    globalThis.crypto,
    'randomUUID',
  );
  const proto = Object.getPrototypeOf(globalThis.crypto);
  const protoOriginal = Object.getOwnPropertyDescriptor(proto, 'randomUUID');
  try {
    for (const secure of [true, false]) {
      if (!secure) {
        Object.defineProperty(globalThis.crypto, 'randomUUID', {
          value: undefined,
          configurable: true,
        });
        assert.equal(typeof crypto.randomUUID, 'undefined');
      }
      const keys = new Set();
      for (let index = 0; index < 50; index += 1) {
        const key = newIdempotencyKey();
        keys.add(key);
        assert.ok(idempotencyKeySchema.safeParse(key).success, key);
        assert.ok(taskKeySchema.safeParse(key).success, key);
        assert.ok(eventKeySchema.safeParse(key).success, key);
        assert.ok(z.string().uuid().safeParse(key).success, key);
      }
      assert.equal(keys.size, 50);
    }
  } finally {
    if (original)
      Object.defineProperty(globalThis.crypto, 'randomUUID', original);
    else delete globalThis.crypto.randomUUID;
    if (protoOriginal)
      Object.defineProperty(proto, 'randomUUID', protoOriginal);
  }
});
