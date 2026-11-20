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
        'chronological pagination uses stable IDs and rejects oversized pages',
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
        'search/status/date filters apply before pagination and expose only same-wedding live counts',
        async () => {
          const filterOwner = await account();
          const filterWid = (
            await weddings.create(filterOwner, weddingInput, randomUUID())
          ).wedding.id;
          const records = Array.from({ length: 50 }, (_, index) => ({
            ...input,
            name:
              index < 25
                ? `Earlier unrelated ${index}`
                : `Filter [Hall] ${index - 25}`,
            status: ['PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'][
              (index - 25 + 100) % 4
            ],
            startAt: new Date(
              index < 25 ? '2028-02-19T03:30:00Z' : '2028-02-20T03:30:00Z',
            ),
            endAt: new Date(
              index < 25 ? '2028-02-19T04:30:00Z' : '2028-02-20T04:30:00Z',
            ),
            venue: {
              source: 'MANUAL',
              name: 'Courtyard',
              city: 'Puri',
              state: 'Odisha',
              formattedAddress: 'Beach Road',
            },
            weddingId: filterWid,
            createdBy: filterOwner,
            updatedBy: filterOwner,
          }));
          const seeded = await Event.insertMany(records);
          await Event.create({
            ...records[25],
            name: 'Filter [Hall] deleted',
            deletedAt: new Date(),
          });
          const query = {
            q: 'FILTER [hall]',
            from: '2028-02-20',
            to: '2028-02-20',
          };
          const a = await events.list(filterOwner, filterWid, query);
          assert.equal(a.meta.total, 25);
          assert.equal(a.events.length, 20);
          assert.deepEqual(a.meta.statusCounts, {
            ALL: 25,
            PLANNED: 7,
            CONFIRMED: 6,
            COMPLETED: 6,
            CANCELLED: 6,
          });
          const b = await events.list(filterOwner, filterWid, {
            ...query,
            page: 2,
          });
          assert.equal(b.events.length, 5);
          assert.equal(
            new Set([...a.events, ...b.events].map((row) => row.id)).size,
            25,
          );
          const status = await events.list(filterOwner, filterWid, {
            ...query,
            status: 'CONFIRMED',
          });
          assert.equal(status.meta.total, 6);
          assert.deepEqual(status.meta.statusCounts, a.meta.statusCounts);
          assert.ok(status.events.every((row) => row.status === 'CONFIRMED'));
          for (const q of ['courtyard', 'puri', 'ODISHA', 'beach road'])
            assert.equal(
              (await events.list(filterOwner, filterWid, { q })).meta.total,
              50,
            );
          assert.equal(
            (await events.list(filterOwner, filterWid, { q: '.*' })).meta.total,
            0,
          );
          const clamped = await events.list(filterOwner, filterWid, {
            ...query,
            page: 99,
          });
          assert.equal(clamped.meta.page, 2);
          const located = await events.list(filterOwner, filterWid, {
            ...query,
            locate: String(seeded[49]._id),
          });
          assert.equal(located.meta.page, 2);
          assert.equal(located.meta.located, true);
          assert.ok(
            located.events.some((row) => row.id === String(seeded[49]._id)),
          );
          assert.equal(
            (
              await events.list(filterOwner, filterWid, {
                ...query,
                locate: first.id,
              })
            ).meta.located,
            false,
          );
          const none = await events.list(filterOwner, filterWid, {
            q: 'No matching ceremony',
            page: 40,
          });
          assert.equal(none.meta.page, 1);
          assert.equal(none.meta.totalPages, 0);
          assert.equal(none.meta.statusCounts.ALL, 0);
          assert.deepEqual(none.events, []);
          await assert.rejects(events.list(outsider, filterWid, query), {
            code: 'WEDDING_NOT_FOUND',
          });
          await User.updateOne({ _id: viewer }, { $set: { status: 'ACTIVE' } });
          assert.deepEqual(
            (await events.list(viewer, wid, { q: 'Filter [Hall]' })).meta
              .statusCounts,
            { ALL: 0, PLANNED: 0, CONFIRMED: 0, COMPLETED: 0, CANCELLED: 0 },
          );
          const intervals = [
            ['23:00:00', '02:00:00', '2028-02-20', '2028-02-21'],
            ['23:00:00', '00:00:00', '2028-02-20', '2028-02-21'],
            ['00:00:00', '01:00:00', '2028-02-21', '2028-02-21'],
            ['00:00:00', '01:00:00', '2028-02-22', '2028-02-22'],
          ];
          for (const [start, end, from, to] of intervals)
            await events.create(
              filterOwner,
              filterWid,
              {
                ...input,
                name: 'Nightfilter',
                startAt: `${from}T${start}+05:30`,
                endAt: `${to}T${end}+05:30`,
              },
              randomUUID(),
            );
          const overnight = await events.list(filterOwner, filterWid, {
            q: 'nightfilter',
            from: '2028-02-21',
            to: '2028-02-21',
          });
          assert.equal(overnight.meta.total, 2);
          assert.equal(
            (
              await events.list(filterOwner, filterWid, {
                q: 'nightfilter',
                to: '2028-02-20',
              })
            ).meta.total,
            2,
          );
          assert.equal(
            (
              await events.list(filterOwner, filterWid, {
                q: 'nightfilter',
                from: '2028-02-22',
              })
            ).meta.total,
            1,
          );
        },
      );
      await t.test(
        'new writes block future Completed, keep past statuses and replay previously committed saves before temporal validation',
        async () => {
          let clock = new Date('2026-10-24T03:30:00Z');
          const timed = createEventService({ database, now: () => clock });
          const future = {
            ...input,
            name: 'Future completion guard',
            status: 'COMPLETED',
            startAt: '2026-10-25T03:30:00Z',
            endAt: '2026-10-25T04:30:00Z',
          };
          const before = await Event.countDocuments({ weddingId: wid });
          const historyBefore = await Activity.countDocuments({
            weddingId: wid,
          });
          const receiptBefore = await EventWriteRequest.countDocuments({
            weddingId: wid,
          });
          await assert.rejects(timed.create(owner, wid, future, randomUUID()), {
            code: 'EVENT_STATUS_INVALID',
          });
          assert.equal(await Event.countDocuments({ weddingId: wid }), before);
          assert.equal(
            await Activity.countDocuments({ weddingId: wid }),
            historyBefore,
          );
          assert.equal(
            await EventWriteRequest.countDocuments({ weddingId: wid }),
            receiptBefore,
          );
          const planned = await timed.create(
            owner,
            wid,
            { ...future, status: 'PLANNED' },
            randomUUID(),
          );
          await assert.rejects(
            timed.update(
              owner,
              wid,
              planned.event.id,
              { status: 'COMPLETED' },
              randomUUID(),
              '"0"',
            ),
            { code: 'EVENT_STATUS_INVALID' },
          );
          assert.equal(
            (await timed.read(owner, wid, planned.event.id)).event.version,
            0,
          );
          const past = await timed.create(
            owner,
            wid,
            { ...input, name: 'Past planning retained', status: 'CONFIRMED' },
            randomUUID(),
          );
          assert.equal(past.event.status, 'CONFIRMED');
          const started = await timed.create(
            owner,
            wid,
            {
              ...future,
              startAt: clock.toISOString(),
              endAt: '2026-10-25T04:30:00Z',
            },
            randomUUID(),
          );
          assert.equal(started.event.status, 'COMPLETED');
          await assert.rejects(
            timed.update(
              owner,
              wid,
              started.event.id,
              { startAt: future.startAt },
              randomUUID(),
              '"0"',
            ),
            { code: 'EVENT_STATUS_INVALID' },
          );
          clock = new Date('2026-10-26T03:30:00Z');
          const key = randomUUID();
          const committed = await timed.create(owner, wid, future, key);
          clock = new Date('2026-10-24T03:30:00Z');
          const replay = await timed.create(owner, wid, future, key);
          assert.equal(replay.replayed, true);
          assert.equal(replay.event.id, committed.event.id);
          assert.equal(
            (await timed.read(owner, wid, committed.event.id)).event.status,
            'COMPLETED',
          );
          await assert.rejects(
            timed.update(
              owner,
              wid,
              committed.event.id,
              { name: 'Legacy future completed edit' },
              randomUUID(),
              '"0"',
            ),
            { code: 'EVENT_STATUS_INVALID' },
          );
          const corrected = await timed.update(
            owner,
            wid,
            committed.event.id,
            { status: 'PLANNED' },
            randomUUID(),
            '"0"',
          );
          assert.equal(corrected.event.status, 'PLANNED');
          assert.equal(
            await Activity.countDocuments({ entityId: committed.event.id }),
            2,
          );
        },
      );
      await t.test(
        'ceremony activities: atomic bulk saves, optional ends, child routes, current roles, shared versions and immutable history',
        async () => {
          const admin = await account(),
            collaborator = await account(),
            readOnly = await account();
          const wedding = (
            await weddings.create(admin, weddingInput, randomUUID())
          ).wedding.id;
          await WeddingMember.create([
            {
              weddingId: wedding,
              userId: collaborator,
              role: 'FAMILY_MEMBER',
              status: 'ACTIVE',
              createdBy: admin,
              joinedAt: new Date(),
            },
            {
              weddingId: wedding,
              userId: readOnly,
              role: 'VIEWER',
              status: 'ACTIVE',
              createdBy: admin,
              joinedAt: new Date(),
            },
          ]);
          const details = {
            ...input,
            name: 'Overnight activity ceremony',
            startAt: '2020-02-20T17:30:00Z',
            endAt: '2020-02-20T21:30:00Z',
            activities: [
              {
                name: 'Welcome',
                startAt: '2020-02-20T17:30:00Z',
                endAt: '2020-02-20T18:00:00Z',
              },
              { name: 'Dinner', startAt: '2020-02-20T19:30:00Z' },
            ],
          };
          const key = randomUUID();
          let saved = await events.create(admin, wedding, details, key);
          const id = saved.event.id;
          assert.equal(saved.event.activityCount, 2);
          assert.equal(saved.event.activities[1].endAt, null);
          assert.equal(
            await Activity.countDocuments({
              parentEventId: id,
              action: 'EVENT_ACTIVITY_CREATED',
            }),
            2,
          );
          const replay = await events.create(admin, wedding, details, key);
          assert.deepEqual(replay.event.activities, saved.event.activities);
          const list = await events.list(readOnly, wedding);
          assert.equal(list.events[0].activityCount, 2);
          assert.equal(list.events[0].activities, undefined);
          assert.equal(
            (await events.read(readOnly, wedding, id)).event.activities.length,
            2,
          );
          const addedKey = randomUUID();
          const addedBody = {
            name: 'Entry',
            startAt: '2020-02-20T17:45:00Z',
            endAt: '2020-02-20T18:15:00Z',
          };
          const concurrent = await Promise.all([
            events.changeActivity(
              'ADD',
              collaborator,
              wedding,
              id,
              null,
              addedBody,
              addedKey,
              '"0"',
            ),
            events.changeActivity(
              'ADD',
              collaborator,
              wedding,
              id,
              null,
              addedBody,
              addedKey,
              '"0"',
            ),
          ]);
          saved = concurrent[0];
          assert.equal(saved.event.activities.length, 3);
          assert.equal(saved.event.version, 1);
          assert.deepEqual(
            concurrent[0].event.activities,
            concurrent[1].event.activities,
          );
          const entry = saved.event.activities.find(
            (row) => row.name === 'Entry',
          );
          await assert.rejects(
            events.update(
              admin,
              wedding,
              id,
              { description: 'Stale parent edit' },
              randomUUID(),
              '"0"',
            ),
            { code: 'VERSION_CONFLICT' },
          );
          saved = await events.changeActivity(
            'EDIT',
            collaborator,
            wedding,
            id,
            entry.id,
            { endAt: null },
            randomUUID(),
            '"1"',
          );
          assert.equal(
            saved.event.activities.find((row) => row.id === entry.id).endAt,
            null,
          );
          await assert.rejects(
            events.changeActivity(
              'EDIT',
              admin,
              wedding,
              id,
              entry.id,
              { endAt: '2020-02-19T00:00:00Z' },
              randomUUID(),
              '"2"',
            ),
            { code: 'ACTIVITY_TIME_INVALID' },
          );
          for (const operation of ['ADD', 'EDIT', 'REMOVE'])
            await assert.rejects(
              events.changeActivity(
                operation,
                readOnly,
                wedding,
                id,
                operation === 'ADD' ? null : entry.id,
                operation === 'ADD'
                  ? addedBody
                  : operation === 'EDIT'
                    ? { name: 'No' }
                    : {},
                randomUUID(),
                '"2"',
              ),
              { code: 'FORBIDDEN' },
            );
          await assert.rejects(events.read(outsider, wedding, id), {
            code: 'WEDDING_NOT_FOUND',
          });
          await assert.rejects(
            events.changeActivity(
              'REMOVE',
              admin,
              wedding,
              id,
              first.id,
              {},
              randomUUID(),
              '"2"',
            ),
            { code: 'ACTIVITY_NOT_FOUND' },
          );
          await assert.rejects(
            events.update(
              admin,
              wedding,
              id,
              { activities: [{ ...addedBody, id: first.id }] },
              randomUUID(),
              '"2"',
            ),
            { code: 'ACTIVITY_INVALID' },
          );
          const welcome = saved.event.activities.find(
            (row) => row.name === 'Welcome',
          );
          const dinner = saved.event.activities.find(
            (row) => row.name === 'Dinner',
          );
          saved = await events.update(
            admin,
            wedding,
            id,
            {
              activities: [
                { ...welcome, description: 'Family coordination' },
                saved.event.activities.find((row) => row.id === entry.id),
                {
                  name: 'Overlapping performance',
                  startAt: '2020-02-20T17:50:00Z',
                  endAt: '2020-02-20T18:20:00Z',
                },
                {
                  name: 'Outside setup',
                  startAt: '2020-02-20T17:00:00Z',
                  endAt: '2020-02-20T17:20:00Z',
                },
              ],
            },
            randomUUID(),
            '"2"',
          );
          assert.equal(saved.event.activityCount, 4);
          assert.ok(
            saved.warnings.some((w) => w.code === 'ACTIVITY_OUTSIDE_EVENT'),
          );
          assert.ok(saved.warnings.some((w) => w.code === 'ACTIVITY_OVERLAP'));
          assert.equal(
            await Activity.countDocuments({
              entityId: dinner.id,
              action: 'EVENT_ACTIVITY_REMOVED',
            }),
            1,
          );
          assert.equal(
            await Activity.countDocuments({
              entityId: welcome.id,
              action: 'EVENT_ACTIVITY_UPDATED',
            }),
            1,
          );
          const preserved = JSON.stringify(saved.event.activities);
          saved = await events.update(
            collaborator,
            wedding,
            id,
            { startAt: '2020-02-20T20:30:00Z' },
            randomUUID(),
            '"3"',
          );
          assert.equal(JSON.stringify(saved.event.activities), preserved);
          assert.equal(
            saved.warnings.find((w) => w.code === 'ACTIVITY_OUTSIDE_EVENT')
              .count,
            4,
          );
          const original = Activity.create;
          const beforeHistory = await Activity.countDocuments({
            weddingId: wedding,
          });
          Activity.create = async () => {
            throw new Error('Injected activity audit failure');
          };
          try {
            await assert.rejects(
              events.changeActivity(
                'ADD',
                admin,
                wedding,
                id,
                null,
                addedBody,
                randomUUID(),
                '"4"',
              ),
              /Injected activity audit failure/,
            );
          } finally {
            Activity.create = original;
          }
          assert.equal(
            (await events.read(admin, wedding, id)).event.version,
            4,
          );
          assert.equal(
            await Activity.countDocuments({ weddingId: wedding }),
            beforeHistory,
          );
          const removalKey = randomUUID();
          saved = await events.changeActivity(
            'REMOVE',
            collaborator,
            wedding,
            id,
            entry.id,
            {},
            removalKey,
            '"4"',
          );
          assert.equal(saved.event.activities.length, 3);
          const removalReplay = await events.changeActivity(
            'REMOVE',
            collaborator,
            wedding,
            id,
            entry.id,
            {},
            removalKey,
            '"4"',
          );
          assert.equal(removalReplay.replayed, true);
          assert.equal(removalReplay.event.activityCount, 3);
          assert.equal(
            await Activity.countDocuments({
              entityId: entry.id,
              action: 'EVENT_ACTIVITY_REMOVED',
            }),
            1,
          );
          const capped = await events.create(
            admin,
            wedding,
            {
              ...input,
              name: 'Activity cap',
              activities: Array.from({ length: 50 }, (_, i) => ({
                name: 'Moment ' + i,
                startAt: input.startAt,
              })),
            },
            randomUUID(),
          );
          assert.equal(capped.event.activityCount, 50);
          await assert.rejects(
            events.changeActivity(
              'ADD',
              admin,
              wedding,
              capped.event.id,
              null,
              addedBody,
              randomUUID(),
              '"0"',
            ),
            { code: 'ACTIVITY_LIMIT' },
          );
          const again = await events.read(admin, wedding, capped.event.id);
          assert.equal(again.event.version, 0);
          assert.equal(
            again.warnings.filter((w) => w.code.startsWith('ACTIVITY_')).length,
            1,
          );
        },
      );
      await t.test(
        'Admin-only event removal and restoration preserve data, enforce current eligibility and recover safely',
        async (lifecycle) => {
          const admin = await account(),
            collaborator = await account(),
            reader = await account(),
            stranger = await account();
          const wedding = (
            await weddings.create(admin, weddingInput, randomUUID())
          ).wedding.id;
          await WeddingMember.create([
            {
              weddingId: wedding,
              userId: collaborator,
              role: 'FAMILY_MEMBER',
              status: 'ACTIVE',
              createdBy: admin,
              joinedAt: new Date(),
            },
            {
              weddingId: wedding,
              userId: reader,
              role: 'VIEWER',
              status: 'ACTIVE',
              createdBy: admin,
              joinedAt: new Date(),
            },
          ]);
          const created = (
            await events.create(
              admin,
              wedding,
              {
                ...input,
                name: 'Recoverable ceremony',
                activities: [
                  {
                    name: 'Family welcome',
                    startAt: input.startAt,
                    endAt: input.endAt,
                    description: 'Keep these notes',
                  },
                ],
              },
              randomUUID(),
            )
          ).event;
          const id = created.id,
            deletionKey = randomUUID(),
            restorationKey = randomUUID();
          const mutate = (
            operation,
            version,
            user = admin,
            key = randomUUID(),
            event = id,
          ) =>
            events.changeLifecycle(
              operation,
              user,
              wedding,
              event,
              {},
              key,
              `"${version}"`,
            );
          await lifecycle.test(
            'only current Admins may list/read removed data or remove/restore; normal planning roles stay intact',
            async () => {
              for (const user of [collaborator, reader]) {
                await assert.rejects(events.listDeleted(user, wedding), {
                  code: 'ADMIN_REQUIRED',
                });
                await assert.rejects(events.readRecovery(user, wedding, id), {
                  code: 'ADMIN_REQUIRED',
                });
                for (const op of ['DELETE_EVENT', 'RESTORE_EVENT'])
                  await assert.rejects(mutate(op, 0, user), {
                    code: 'ADMIN_REQUIRED',
                  });
              }
              await assert.rejects(events.listDeleted(stranger, wedding), {
                code: 'WEDDING_NOT_FOUND',
              });
              await assert.rejects(mutate('DELETE_EVENT', 0, stranger), {
                code: 'WEDDING_NOT_FOUND',
              });
              const other = (
                await events.create(
                  owner,
                  wid,
                  { ...input, name: 'Other wedding record' },
                  randomUUID(),
                )
              ).event;
              await assert.rejects(
                mutate('DELETE_EVENT', 0, admin, randomUUID(), other.id),
                { code: 'EVENT_NOT_FOUND' },
              );
              assert.equal(
                (await events.read(collaborator, wedding, id)).event.id,
                id,
              );
              assert.equal(
                (await events.read(reader, wedding, id)).event.id,
                id,
              );
              assert.equal(
                await Activity.countDocuments({
                  entityId: id,
                  action: 'EVENT_DELETED',
                }),
                0,
              );
            },
          );
          const references = ['tasks', 'vendors', 'expenses'];
          const related = [];
          await lifecycle.test(
            'same-key concurrent removals commit once and retain activities, relationships and immutable history',
            async () => {
              for (const collection of references) {
                const document = {
                  weddingId: created.weddingId,
                  eventId: id,
                  label: 'Retain ' + collection,
                };
                const inserted = await connection
                  .collection(collection)
                  .insertOne(document);
                related.push([
                  collection,
                  inserted.insertedId,
                  await connection
                    .collection(collection)
                    .findOne({ _id: inserted.insertedId }),
                ]);
              }
              const writes = await Promise.all([
                mutate('DELETE_EVENT', 0, admin, deletionKey),
                mutate('DELETE_EVENT', 0, admin, deletionKey),
              ]);
              assert.equal(writes.filter((row) => !row.replayed).length, 1);
              assert.ok(
                writes.every(
                  (row) => row.event.deletedAt && row.event.version === 1,
                ),
              );
              assert.deepEqual(writes[0].event.activities, created.activities);
              assert.equal(writes[0].event.deletedBy, admin);
              await assert.rejects(events.read(admin, wedding, id), {
                code: 'EVENT_NOT_FOUND',
              });
              await assert.rejects(
                events.update(
                  collaborator,
                  wedding,
                  id,
                  { name: 'No editing removed data' },
                  randomUUID(),
                  '"1"',
                ),
                { code: 'EVENT_NOT_FOUND' },
              );
              await assert.rejects(
                events.changeActivity(
                  'REMOVE',
                  collaborator,
                  wedding,
                  id,
                  created.activities[0].id,
                  {},
                  randomUUID(),
                  '"1"',
                ),
                { code: 'EVENT_NOT_FOUND' },
              );
              assert.equal((await events.list(reader, wedding)).meta.total, 0);
              const tray = await events.listDeleted(admin, wedding);
              assert.equal(tray.meta.total, 1);
              assert.equal(tray.events[0].activityCount, 1);
              assert.equal(tray.events[0].activities, undefined);
              assert.equal(tray.events[0].deletedByName, 'Event Test');
              assert.equal(
                (await events.readRecovery(admin, wedding, id)).event
                  .deletedByName,
                'Event Test',
              );
              const history = await Activity.findOne({
                entityId: id,
                action: 'EVENT_DELETED',
              }).lean();
              assert.equal(String(history.actorId), admin);
              assert.equal(history.displaySnapshot.label, created.name);
              assert.equal(
                await Activity.countDocuments({
                  entityId: id,
                  action: 'EVENT_DELETED',
                }),
                1,
              );
              for (const [collection, _id, document] of related)
                assert.deepEqual(
                  await connection.collection(collection).findOne({ _id }),
                  document,
                );
              await assert.rejects(mutate('DELETE_EVENT', 1), {
                code: 'EVENT_STATE_CHANGED',
              });
              await assert.rejects(mutate('RESTORE_EVENT', 0), {
                code: 'VERSION_CONFLICT',
              });
            },
          );
          await lifecycle.test(
            'restoration has no seven-day event cutoff, preserves fields, refreshes warnings and replays current state',
            async () => {
              await Event.updateOne(
                { _id: id },
                { $set: { deletedAt: new Date(Date.now() - 30 * 86400000) } },
              );
              await events.create(
                admin,
                wedding,
                { ...input, name: 'Concurrent ceremony' },
                randomUUID(),
              );
              const restores = await Promise.all([
                mutate('RESTORE_EVENT', 1, admin, restorationKey),
                mutate('RESTORE_EVENT', 1, admin, restorationKey),
              ]);
              assert.equal(restores.filter((row) => !row.replayed).length, 1);
              assert.ok(
                restores.every(
                  (row) =>
                    row.event.deletedAt === null && row.event.version === 2,
                ),
              );
              assert.deepEqual(
                restores[0].event.activities,
                created.activities,
              );
              assert.equal(restores[0].event.name, created.name);
              assert.equal(restores[0].event.startAt, created.startAt);
              assert.ok(
                restores[0].warnings.some(
                  (row) => row.code === 'EVENT_OVERLAP',
                ),
              );
              assert.equal(
                (await events.listDeleted(admin, wedding)).meta.total,
                0,
              );
              const replayDelete = await mutate(
                'DELETE_EVENT',
                0,
                admin,
                deletionKey,
              );
              assert.equal(replayDelete.replayed, true);
              assert.equal(replayDelete.event.deletedAt, null);
              assert.equal(replayDelete.event.version, 2);
              assert.equal(
                await Activity.countDocuments({
                  entityId: id,
                  action: 'EVENT_DELETED',
                }),
                1,
              );
              const removedAgain = await mutate('DELETE_EVENT', 2);
              assert.equal(removedAgain.event.version, 3);
              const replayRestore = await mutate(
                'RESTORE_EVENT',
                1,
                admin,
                restorationKey,
              );
              assert.equal(replayRestore.replayed, true);
              assert.ok(replayRestore.event.deletedAt);
              assert.equal(replayRestore.event.version, 3);
              assert.equal(
                await Activity.countDocuments({
                  entityId: id,
                  action: 'EVENT_RESTORED',
                }),
                1,
              );
              await mutate('RESTORE_EVENT', 3);
              for (const [collection, _id, document] of related)
                assert.deepEqual(
                  await connection.collection(collection).findOne({ _id }),
                  document,
                );
            },
          );
          await lifecycle.test(
            'current role/account/wedding eligibility is enforced even for valid receipts',
            async () => {
              await WeddingMember.updateOne(
                { weddingId: wedding, userId: admin },
                { $set: { role: 'FAMILY_MEMBER' } },
              );
              await assert.rejects(
                mutate('DELETE_EVENT', 0, admin, deletionKey),
                { code: 'ADMIN_REQUIRED' },
              );
              await assert.rejects(
                mutate('RESTORE_EVENT', 1, admin, restorationKey),
                { code: 'ADMIN_REQUIRED' },
              );
              await WeddingMember.updateOne(
                { weddingId: wedding, userId: admin },
                { $set: { role: 'ADMIN' } },
              );
              await User.updateOne(
                { _id: admin },
                { $set: { status: 'DISABLED' } },
              );
              await assert.rejects(
                mutate('DELETE_EVENT', 0, admin, deletionKey),
                { code: 'SESSION_EXPIRED' },
              );
              await User.updateOne(
                { _id: admin },
                { $set: { status: 'ACTIVE' } },
              );
              await Wedding.updateOne(
                { _id: wedding },
                { $set: { deletedAt: new Date() } },
              );
              await assert.rejects(
                mutate('RESTORE_EVENT', 1, admin, restorationKey),
                { code: 'WEDDING_NOT_FOUND' },
              );
              await Wedding.updateOne(
                { _id: wedding },
                { $set: { deletedAt: null } },
              );
            },
          );
          await lifecycle.test(
            'audit failure rolls back removal and restoration, including versions and receipts',
            async () => {
              const original = Activity.create;
              for (const [operation, version] of [
                ['DELETE_EVENT', 4],
                ['RESTORE_EVENT', 5],
              ]) {
                const before = await Event.findById(id).lean(),
                  receipts = await EventWriteRequest.countDocuments({
                    eventId: id,
                  });
                Activity.create = async () => {
                  throw new Error('Injected lifecycle history failure');
                };
                try {
                  await assert.rejects(
                    mutate(operation, version),
                    /Injected lifecycle history failure/,
                  );
                } finally {
                  Activity.create = original;
                }
                const after = await Event.findById(id).lean();
                assert.equal(after.__v, before.__v);
                assert.equal(String(after.deletedAt), String(before.deletedAt));
                assert.equal(
                  await EventWriteRequest.countDocuments({ eventId: id }),
                  receipts,
                );
                if (operation === 'DELETE_EVENT')
                  await mutate('DELETE_EVENT', 4);
              }
              await mutate('RESTORE_EVENT', 5);
            },
          );
          await lifecycle.test(
            'concurrent edit/remove and competing restores never overwrite a newer version',
            async () => {
              const race = (
                await events.create(
                  admin,
                  wedding,
                  { ...input, name: 'Edit removal race' },
                  randomUUID(),
                )
              ).event;
              const competed = await Promise.allSettled([
                events.update(
                  collaborator,
                  wedding,
                  race.id,
                  { name: 'Family saved first' },
                  randomUUID(),
                  '"0"',
                ),
                mutate('DELETE_EVENT', 0, admin, randomUUID(), race.id),
              ]);
              assert.equal(
                competed.filter((row) => row.status === 'fulfilled').length,
                1,
              );
              assert.ok(
                ['VERSION_CONFLICT', 'EVENT_NOT_FOUND'].includes(
                  competed.find((row) => row.status === 'rejected').reason.code,
                ),
              );
              let snapshot = (
                await events.readRecovery(admin, wedding, race.id)
              ).event;
              if (!snapshot.deletedAt)
                snapshot = (
                  await mutate(
                    'DELETE_EVENT',
                    snapshot.version,
                    admin,
                    randomUUID(),
                    race.id,
                  )
                ).event;
              const restored = await Promise.allSettled([
                mutate(
                  'RESTORE_EVENT',
                  snapshot.version,
                  admin,
                  randomUUID(),
                  race.id,
                ),
                mutate(
                  'RESTORE_EVENT',
                  snapshot.version,
                  admin,
                  randomUUID(),
                  race.id,
                ),
              ]);
              assert.equal(
                restored.filter((row) => row.status === 'fulfilled').length,
                1,
              );
              assert.equal(
                restored.find((row) => row.status === 'rejected').reason.code,
                'VERSION_CONFLICT',
              );
              assert.equal(
                await Activity.countDocuments({
                  entityId: race.id,
                  action: 'EVENT_RESTORED',
                }),
                1,
              );
            },
          );
          await lifecycle.test(
            'recovery pages are bounded, isolated and stable; legacy future completion is preserved on restore',
            async () => {
              const snapshot = await Event.findById(id).lean();
              const rows = Array.from({ length: 23 }, (_, index) => ({
                ...input,
                weddingId: wedding,
                createdBy: admin,
                updatedBy: admin,
                name: 'Removed fixture ' + index,
                deletedAt: new Date('2026-01-01T00:00:00Z'),
                deletedBy: admin,
                activities: snapshot.activities,
              }));
              await Event.insertMany(rows);
              const firstPage = await events.listDeleted(admin, wedding, {
                limit: 20,
              });
              const lastPage = await events.listDeleted(admin, wedding, {
                page: 999,
                limit: 20,
              });
              assert.equal(firstPage.meta.total, 23);
              assert.equal(firstPage.events.length, 20);
              assert.equal(lastPage.meta.page, 2);
              assert.equal(lastPage.events.length, 3);
              assert.equal(
                new Set(
                  [...firstPage.events, ...lastPage.events].map(
                    (row) => row.id,
                  ),
                ).size,
                23,
              );
              assert.ok(
                firstPage.events.every(
                  (row) =>
                    row.weddingId === wedding &&
                    row.deletedAt &&
                    row.activities === undefined,
                ),
              );
              const legacy = (
                await events.create(
                  admin,
                  wedding,
                  {
                    ...input,
                    name: 'Legacy completion',
                    startAt: '2028-02-20T03:30:00Z',
                    endAt: '2028-02-20T04:30:00Z',
                  },
                  randomUUID(),
                )
              ).event;
              await Event.updateOne(
                { _id: legacy.id },
                { $set: { status: 'COMPLETED' } },
              );
              await mutate('DELETE_EVENT', 0, admin, randomUUID(), legacy.id);
              const restored = await mutate(
                'RESTORE_EVENT',
                1,
                admin,
                randomUUID(),
                legacy.id,
              );
              assert.equal(restored.event.status, 'COMPLETED');
              assert.equal(restored.event.startAt, legacy.startAt);
            },
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
      await t.test(
        'Google-linked venues persist only references/user input through edits, retries and recovery; tenant and role checks still apply',
        async () => {
          const admin = await account(),
            collaborator = await account(),
            reader = await account();
          const wedding = (
            await weddings.create(admin, weddingInput, randomUUID())
          ).wedding.id;
          for (const [userId, role] of [
            [collaborator, 'FAMILY_MEMBER'],
            [reader, 'VIEWER'],
          ]) {
            await WeddingMember.create({
              weddingId: wedding,
              userId,
              role,
              status: 'ACTIVE',
              joinedAt: new Date(),
              createdBy: admin,
            });
          }
          const venue = {
            source: 'GOOGLE',
            googlePlaceId: 'ChIJ_synthetic-atlas-test',
            name: 'Our private hall label',
            formattedAddress: 'Use gate 2',
            city: 'Cuttack',
            state: 'Odisha',
          };
          const key = randomUUID();
          const created = await events.create(
            collaborator,
            wedding,
            { ...input, name: 'Linked venue ceremony', venue },
            key,
          );
          assert.deepEqual(created.event.venue, venue);
          assert.equal(
            (
              await events.create(
                collaborator,
                wedding,
                { ...input, name: 'Linked venue ceremony', venue },
                key,
              )
            ).event.id,
            created.event.id,
          );
          assert.deepEqual(
            (await events.read(reader, wedding, created.event.id)).event.venue,
            venue,
          );
          const stored = await Event.findById(created.event.id).lean();
          assert.deepEqual(stored.venue, venue);
          const history = await Activity.findOne({
            entityId: created.event.id,
          }).lean();
          assert.equal(
            JSON.stringify(history).includes(venue.googlePlaceId),
            false,
          );
          assert.equal(
            (await events.list(reader, wedding, { q: 'private hall label' }))
              .meta.total,
            1,
          );
          assert.equal(
            (await events.list(reader, wedding, { q: 'Provider live address' }))
              .meta.total,
            0,
          );
          for (const extra of [
            { latitude: 20 },
            { displayName: 'Provider live name' },
            { googleMapsURI: 'https://attacker.example' },
          ]) {
            await assert.rejects(
              events.update(
                admin,
                wedding,
                created.event.id,
                { venue: { ...venue, ...extra } },
                randomUUID(),
                '"0"',
              ),
              { code: 'VALIDATION_ERROR' },
            );
          }
          await assert.rejects(
            events.update(
              reader,
              wedding,
              created.event.id,
              { venue },
              randomUUID(),
              '"0"',
            ),
            { code: 'FORBIDDEN' },
          );
          await assert.rejects(
            events.read(outsider, wedding, created.event.id),
            { code: 'WEDDING_NOT_FOUND' },
          );
          const edited = await events.update(
            collaborator,
            wedding,
            created.event.id,
            { description: 'Entered family notes' },
            randomUUID(),
            '"0"',
          );
          assert.deepEqual(edited.event.venue, venue);
          const removed = await events.changeLifecycle(
            'DELETE_EVENT',
            admin,
            wedding,
            created.event.id,
            {},
            randomUUID(),
            `"${edited.event.version}"`,
          );
          const restored = await events.changeLifecycle(
            'RESTORE_EVENT',
            admin,
            wedding,
            created.event.id,
            {},
            randomUUID(),
            `"${removed.event.version}"`,
          );
          assert.deepEqual(restored.event.venue, venue);
          const manual = {
            source: 'MANUAL',
            name: venue.name,
            formattedAddress: venue.formattedAddress,
            city: venue.city,
            state: venue.state,
          };
          const unlinked = await events.update(
            collaborator,
            wedding,
            created.event.id,
            { venue: manual },
            randomUUID(),
            `"${restored.event.version}"`,
          );
          assert.deepEqual(unlinked.event.venue, manual);
          const idOnly = await events.update(
            admin,
            wedding,
            created.event.id,
            { venue: { source: 'GOOGLE', googlePlaceId: venue.googlePlaceId } },
            randomUUID(),
            `"${unlinked.event.version}"`,
          );
          assert.deepEqual(idOnly.event.venue, {
            source: 'GOOGLE',
            googlePlaceId: venue.googlePlaceId,
            name: '',
            formattedAddress: '',
            city: '',
            state: '',
          });
        },
      );
    } finally {
      await connection.dropDatabase();
      await database.close();
    }
  },
);
