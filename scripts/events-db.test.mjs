import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { config } from '../apps/api/src/config.js';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { createAuthService } from '../apps/api/src/auth/service.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';
import { weddingModels } from '../apps/api/src/weddings/models.js';
import { createEventService } from '../apps/api/src/events/service.js';
import { eventModels } from '../apps/api/src/events/models.js';

test(
  'Atlas events: authorization, time rules, atomic history, retries and collaborative edits',
  {
    skip: !config.mongodbUri && 'Set private MONGODB_URI to run Atlas checks.',
  },
  async (t) => {
    const settings = {
      ...config,
      emailProvider: 'resend',
      resendApiKey: 'test-only',
      emailFrom: 'test@example.com',
      mongodbDbName: 'mmm_events_test_' + randomBytes(8).toString('hex'),
      jwtSecret: randomBytes(48).toString('base64url'),
    };
    const database = createAuthDatabase(settings),
      weddings = createWeddingService({ database }),
      events = createEventService({ database });
    const auth = createAuthService({
      settings,
      database,
      sendVerification: async () => {},
    });
    const connection = await database.connect();
    const { User } = authModels(connection),
      { Wedding, WeddingMember } = weddingModels(connection),
      { Event, EventWriteRequest, Activity } = eventModels(connection);
    let sequence = 0;
    async function account() {
      const email = `event-${++sequence}@example.com`;
      await auth.register({
        name: 'Event Test',
        email,
        password: 'Wedding123',
      });
      const user = await User.findOneAndUpdate(
        { emailNormalized: email },
        { $set: { emailVerifiedAt: new Date() } },
        { returnDocument: 'after' },
      );
      return String(user._id);
    }
    const input = {
      name: 'Haldi at Home',
      type: 'HALDI',
      description: 'Family celebration',
      startAt: '2020-02-20T03:30:00Z',
      endAt: '2020-02-20T05:30:00Z',
      venue: {
        name: 'Family Home',
        formattedAddress: '42 Riverside Road',
        city: 'Cuttack',
        state: 'Odisha',
      },
      status: 'PLANNED',
    };
    let owner, family, viewer, outsider, wid, otherWid, first;
    try {
      owner = await account();
      family = await account();
      viewer = await account();
      outsider = await account();
      const weddingInput = {
        name: 'Event Test Wedding',
        brideName: 'Anya',
        groomName: 'Kabir',
        mainDate: '2028-02-20',
        tradition: 'ODIA',
        location: { city: 'Cuttack', state: 'Odisha', countryCode: 'IN' },
      };
      wid = (await weddings.create(owner, weddingInput, randomUUID())).wedding
        .id;
      otherWid = (await weddings.create(outsider, weddingInput, randomUUID()))
        .wedding.id;
      await WeddingMember.create([
        {
          weddingId: wid,
          userId: family,
          role: 'FAMILY_MEMBER',
          status: 'ACTIVE',
          createdBy: owner,
          joinedAt: new Date(),
        },
        {
          weddingId: wid,
          userId: viewer,
          role: 'VIEWER',
          status: 'ACTIVE',
          createdBy: owner,
          joinedAt: new Date(),
        },
      ]);
      await t.test(
        'empty schedule is genuinely empty; creating past events stores UTC/venue and one immutable history snapshot',
        async () => {
          assert.equal((await events.list(owner, wid)).meta.total, 0);
          first = (await events.create(owner, wid, input, randomUUID())).event;
          assert.equal(first.version, 0);
          assert.equal(first.startAt, new Date(input.startAt).toISOString());
          assert.equal(first.venue.source, 'MANUAL');
          assert.equal(first.name, input.name);
          const history = await Activity.findOne({ entityId: first.id }).lean();
          assert.equal(history.action, 'EVENT_CREATED');
          assert.equal(history.displaySnapshot.label, input.name);
          assert.equal(history.metadata, undefined);
        },
      );
      await t.test(
        'concurrent same-key creates have one event and one audit entry',
        async () => {
          const key = randomUUID();
          const results = await Promise.all([
            events.create(owner, wid, { ...input, name: 'Concurrent' }, key),
            events.create(owner, wid, { ...input, name: 'Concurrent' }, key),
            events.create(owner, wid, { ...input, name: 'Concurrent' }, key),
          ]);
          assert.equal(
            new Set(results.map((result) => result.event.id)).size,
            1,
          );
          assert.equal(await Event.countDocuments({ name: 'Concurrent' }), 1);
          assert.equal(
            await Activity.countDocuments({ entityId: results[0].event.id }),
            1,
          );
          await assert.rejects(
            events.create(owner, wid, { ...input, name: 'Changed body' }, key),
            { code: 'IDEMPOTENCY_CONFLICT' },
          );
        },
      );
      await t.test(
        'failed audit persistence rolls back the event and receipt too',
        async () => {
          const original = Activity.create;
          const key = randomUUID();
          Activity.create = async () => {
            throw new Error('Injected audit failure');
          };
          try {
            await assert.rejects(
              events.create(owner, wid, { ...input, name: 'Rollback' }, key),
              /Injected audit failure/,
            );
          } finally {
            Activity.create = original;
          }
          assert.equal(await Event.countDocuments({ name: 'Rollback' }), 0);
        },
      );
      await t.test(
        'Viewer reads, but cannot create/edit; other weddings cannot be accessed or supplied as event parents',
        async () => {
          assert.ok((await events.list(viewer, wid)).events.length);
          assert.equal(
            (await events.read(viewer, wid, first.id)).event.id,
            first.id,
          );
          await assert.rejects(
            events.create(viewer, wid, input, randomUUID()),
            { code: 'FORBIDDEN' },
          );
          await assert.rejects(
            events.update(
              viewer,
              wid,
              first.id,
              { name: 'Denied' },
              randomUUID(),
              '"0"',
            ),
            { code: 'FORBIDDEN' },
          );
          await assert.rejects(events.list(outsider, wid), {
            code: 'WEDDING_NOT_FOUND',
          });
          await assert.rejects(events.read(owner, otherWid, first.id), {
            code: 'WEDDING_NOT_FOUND',
          });
          const foreign = (
            await events.create(outsider, otherWid, input, randomUUID())
          ).event;
          await assert.rejects(events.read(owner, wid, foreign.id), {
            code: 'EVENT_NOT_FOUND',
          });
          await assert.rejects(
            events.update(
              owner,
              wid,
              foreign.id,
              { name: 'Denied' },
              randomUUID(),
              '"0"',
            ),
            { code: 'EVENT_NOT_FOUND' },
          );
        },
      );
      await t.test(
        'overlapping active ceremonies warn without blocking; adjacent and cancelled events do not contribute',
        async () => {
          const overlap = await events.create(
            owner,
            wid,
            { ...input, name: 'Overlap' },
            randomUUID(),
          );
          assert.ok(overlap.warnings[0].count >= 1);
          const adjacent = await events.create(
            owner,
            wid,
            { ...input, startAt: input.endAt, endAt: '2020-02-20T06:30:00Z' },
            randomUUID(),
          );
          assert.equal(adjacent.warnings.length, 0);
          const cancelled = await events.create(
            owner,
            wid,
            { ...input, status: 'CANCELLED' },
            randomUUID(),
          );
          assert.equal(cancelled.warnings.length, 0);
        },
      );
      await t.test(
        'chronological pagination uses stable IDs; unsupported filters are rejected in this increment',
        async () => {
          const page = await events.list(owner, wid, { page: 1, limit: 2 }),
            second = await events.list(owner, wid, { page: 2, limit: 2 });
          assert.equal(page.events.length, 2);
          assert.equal(second.events.length, 2);
          assert.ok(
            !second.events.some((item) =>
              page.events.some((first) => first.id === item.id),
            ),
          );
          assert.equal(
            page.meta.total,
            await Event.countDocuments({ weddingId: wid, deletedAt: null }),
          );
          await assert.rejects(events.list(owner, wid, { limit: 101 }), {
            code: 'VALIDATION_ERROR',
          });
        },
      );
      await t.test(
        'Family Member edits preserve history and version; stale edits cannot overwrite',
        async () => {
          const result = await events.update(
            family,
            wid,
            first.id,
            { name: 'Family updated' },
            randomUUID(),
            '"0"',
          );
          first = result.event;
          assert.equal(first.version, 1);
          await assert.rejects(
            events.update(
              owner,
              wid,
              first.id,
              { name: 'Stale' },
              randomUUID(),
              '"0"',
            ),
            { code: 'VERSION_CONFLICT' },
          );
          assert.equal(
            (await events.read(owner, wid, first.id)).event.name,
            'Family updated',
          );
          assert.equal(
            await Activity.countDocuments({
              entityId: first.id,
              action: 'EVENT_UPDATED',
            }),
            1,
          );
        },
      );
      await t.test(
        'a lost update response replays safely even after a later edit; reused keys cannot target another operation',
        async () => {
          const key = randomUUID(),
            patch = { description: 'First saved notes' };
          const saved = await events.update(
            owner,
            wid,
            first.id,
            patch,
            key,
            '"1"',
          );
          assert.equal(saved.event.version, 2);
          await events.update(
            family,
            wid,
            first.id,
            { name: 'Later family edit' },
            randomUUID(),
            '"2"',
          );
          const replay = await events.update(
            owner,
            wid,
            first.id,
            patch,
            key,
            '"1"',
          );
          assert.equal(replay.replayed, true);
          assert.equal(replay.event.name, 'Later family edit');
          assert.equal(replay.event.version, 3);
          await assert.rejects(events.create(owner, wid, input, key), {
            code: 'IDEMPOTENCY_CONFLICT',
          });
          assert.equal(
            await Activity.countDocuments({
              entityId: first.id,
              action: 'EVENT_UPDATED',
            }),
            3,
          );
          first = replay.event;
        },
      );
      await t.test(
        'simultaneous different edits from one version have one winner, not last-write-wins',
        async () => {
          const results = await Promise.allSettled([
            events.update(
              owner,
              wid,
              first.id,
              { description: 'A' },
              randomUUID(),
              '"3"',
            ),
            events.update(
              family,
              wid,
              first.id,
              { description: 'B' },
              randomUUID(),
              '"3"',
            ),
          ]);
          assert.equal(
            results.filter((result) => result.status === 'fulfilled').length,
            1,
          );
          assert.equal(
            results.find((result) => result.status === 'rejected').reason.code,
            'VERSION_CONFLICT',
          );
          first = (await events.read(owner, wid, first.id)).event;
        },
      );
      await t.test(
        'partial time updates check the resulting full interval; valid overnight edits work',
        async () => {
          await assert.rejects(
            events.update(
              owner,
              wid,
              first.id,
              { endAt: '2019-01-01T00:00:00Z' },
              randomUUID(),
              `"${first.version}"`,
            ),
            { code: 'EVENT_TIME_INVALID' },
          );
          const changed = await events.update(
            owner,
            wid,
            first.id,
            {
              startAt: '2020-02-20T17:30:00Z',
              endAt: '2020-02-20T21:30:00Z',
              venue: null,
            },
            randomUUID(),
            `"${first.version}"`,
          );
          first = changed.event;
          assert.equal(first.venue, null);
        },
      );
      await t.test(
        'current membership and eligibility are checked on every write, including receipt replay',
        async () => {
          const key = randomUUID();
          await events.create(
            family,
            wid,
            { ...input, name: 'Before role change' },
            key,
          );
          await WeddingMember.updateOne(
            { userId: family },
            { $set: { role: 'VIEWER' } },
          );
          await assert.rejects(
            events.create(
              family,
              wid,
              { ...input, name: 'Before role change' },
              key,
            ),
            { code: 'FORBIDDEN' },
          );
          await WeddingMember.updateOne(
            { userId: family },
            { $set: { status: 'REMOVED' } },
          );
          await assert.rejects(events.read(family, wid, first.id), {
            code: 'WEDDING_NOT_FOUND',
          });
          await User.updateOne(
            { _id: viewer },
            { $set: { status: 'DISABLED' } },
          );
          await assert.rejects(
            events.create(viewer, wid, input, randomUUID()),
            { code: 'SESSION_EXPIRED' },
          );
        },
      );
      await t.test(
        'deleted events/weddings are hidden and cannot be updated',
        async () => {
          const created = (
            await events.create(
              owner,
              wid,
              { ...input, name: 'To archive' },
              randomUUID(),
            )
          ).event;
          await Event.updateOne(
            { _id: created.id },
            { $set: { deletedAt: new Date() } },
          );
          assert.ok(
            !(await events.list(owner, wid)).events.some(
              (event) => event.id === created.id,
            ),
          );
          await assert.rejects(events.read(owner, wid, created.id), {
            code: 'EVENT_NOT_FOUND',
          });
          await assert.rejects(
            events.update(
              owner,
              wid,
              created.id,
              { name: 'No' },
              randomUUID(),
              '"0"',
            ),
            { code: 'EVENT_NOT_FOUND' },
          );
          await Wedding.updateOne(
            { _id: wid },
            { $set: { deletedAt: new Date() } },
          );
          await assert.rejects(events.list(owner, wid), {
            code: 'WEDDING_NOT_FOUND',
          });
          await assert.rejects(events.create(owner, wid, input, randomUUID()), {
            code: 'WEDDING_NOT_FOUND',
          });
          await Wedding.updateOne({ _id: wid }, { $set: { deletedAt: null } });
        },
      );
      await t.test(
        'creation locates the saved ceremony across pages and replay recomputes its current chronological position',
        async () => {
          await Event.insertMany(
            Array.from({ length: 21 }, (_, index) => ({
              ...input,
              name: `Earlier fixture ${index}`,
              startAt: new Date(Date.UTC(2018, 0, 1, index)),
              endAt: new Date(Date.UTC(2018, 0, 1, index + 1)),
              weddingId: wid,
              createdBy: owner,
              updatedBy: owner,
            })),
          );
          const key = randomUUID();
          const details = {
            ...input,
            name: 'Locate this event',
            startAt: '2029-01-01T03:30:00Z',
            endAt: '2029-01-01T05:30:00Z',
          };
          const saved = await events.create(owner, wid, details, key);
          const page = Math.ceil(saved.schedulePosition / 20);
          assert.ok(page > 1);
          assert.ok(
            (await events.list(owner, wid, { page })).events.some(
              (row) => row.id === saved.event.id,
            ),
          );
          await events.create(owner, wid, input, randomUUID());
          const replay = await events.create(owner, wid, details, key);
          assert.equal(replay.event.id, saved.event.id);
          assert.equal(replay.replayed, true);
          assert.equal(replay.schedulePosition, saved.schedulePosition + 1);
          const ordered = (await events.list(owner, wid, { limit: 100 }))
            .events;
          assert.equal(ordered[replay.schedulePosition - 1].id, saved.event.id);
          assert.equal(
            await Activity.countDocuments({ entityId: saved.event.id }),
            1,
          );
        },
      );
      await t.test(
        'expired retry receipts can be replaced before TTL cleanup without unique-key collisions',
        async () => {
          const key = randomUUID();
          const a = await events.create(
            owner,
            wid,
            { ...input, name: 'Expired receipt' },
            key,
          );
          await EventWriteRequest.updateOne(
            { eventId: a.event.id },
            { $set: { expiresAt: new Date(Date.now() - 1000) } },
          );
          const b = await events.create(
            owner,
            wid,
            { ...input, name: 'New after expiry' },
            key,
          );
          assert.notEqual(a.event.id, b.event.id);
        },
      );
    } finally {
      await connection.dropDatabase();
      await database.close();
    }
  },
);
