import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { config } from '../apps/api/src/config.js';
import { createAuthDatabase } from '../apps/api/src/auth/database.js';
import { createAuthService } from '../apps/api/src/auth/service.js';
import { authModels } from '../apps/api/src/auth/models.js';
import { createWeddingService } from '../apps/api/src/weddings/service.js';
import { weddingModels } from '../apps/api/src/weddings/models.js';
import { eventModels } from '../apps/api/src/events/models.js';
import { createTaskService } from '../apps/api/src/tasks/service.js';
import { taskModels } from '../apps/api/src/tasks/models.js';
import { createMemberService } from '../apps/api/src/members/service.js';

test(
  'Atlas Dashboard Step 1: real task summary, schedule status and My Tasks',
  { skip: !config.mongodbUri && 'Set private MONGODB_URI for Atlas checks.' },
  async (t) => {
    const settings = {
      ...config,
      mongodbDbName: 'mmm_dashboard_test_' + randomBytes(8).toString('hex'),
      jwtSecret: randomBytes(48).toString('base64url'),
      emailProvider: 'resend',
      resendApiKey: 'test-only',
      emailFrom: 'test@example.com',
    };
    const database = createAuthDatabase(settings),
      weddings = createWeddingService({ database });
    const instant = new Date('2027-01-10T12:00:00Z');
    const tasks = createTaskService({ database, now: () => instant });
    const auth = createAuthService({
      settings,
      database,
      sendVerification: async () => {},
    });
    const connection = await database.connect();
    const { User } = authModels(connection),
      { WeddingMember } = weddingModels(connection),
      { Event } = eventModels(connection),
      { Task } = taskModels(connection);
    let sequence = 0;
    async function account() {
      const email = `dashboard-${++sequence}@example.com`;
      await auth.register({
        name: 'Dashboard Fixture',
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
    const weddingInput = {
      name: 'Dashboard Test Wedding',
      brideName: 'Anya',
      groomName: 'Kabir',
      mainDate: '2028-02-20',
      tradition: 'ODIA',
      location: { city: 'Cuttack', state: 'Odisha', countryCode: 'IN' },
    };
    const day = (offset) => new Date(instant.getTime() + offset * 86400000);
    try {
      const admin = await account(),
        viewer = await account(),
        outsider = await account();
      const wid = (await weddings.create(admin, weddingInput, randomUUID()))
        .wedding.id;
      const otherWid = (
        await weddings.create(outsider, weddingInput, randomUUID())
      ).wedding.id;
      await WeddingMember.create({
        weddingId: wid,
        userId: viewer,
        role: 'VIEWER',
        status: 'ACTIVE',
        joinedAt: new Date(),
        createdBy: admin,
      });

      await t.test(
        'an empty wedding resolves safely to 0% and Not started',
        async () => {
          const summary = await tasks.summary(viewer, wid);
          assert.deepEqual(summary.counts, {
            total: 0,
            todo: 0,
            inProgress: 0,
            completed: 0,
            overdue: 0,
            myOpen: 0,
            ceremonies: 0,
          });
          assert.equal(summary.progress, 0);
          assert.equal(summary.schedule, 'NOT_STARTED');
          assert.deepEqual(summary.myTasks, []);
        },
      );

      const base = {
        weddingId: wid,
        source: { type: 'MANUAL' },
        createdBy: admin,
        updatedBy: admin,
      };
      const event = await Event.create({
        weddingId: wid,
        name: 'Haldi',
        type: 'HALDI',
        startAt: day(20),
        endAt: day(20.2),
        status: 'PLANNED',
        createdBy: admin,
        updatedBy: admin,
      });
      await Event.create({
        weddingId: wid,
        name: 'Deleted ceremony',
        type: 'CUSTOM',
        startAt: day(5),
        endAt: day(5.1),
        status: 'PLANNED',
        createdBy: admin,
        updatedBy: admin,
        deletedAt: day(-1),
      });
      await Task.create([
        // Counted: done, overdue, due later and undated open tasks.
        { ...base, title: 'Done', status: 'COMPLETED', dueAt: day(-5) },
        {
          ...base,
          title: 'Overdue mine',
          dueAt: day(-1),
          assigneeIds: [viewer],
        },
        {
          ...base,
          title: 'Soon mine',
          status: 'IN_PROGRESS',
          dueAt: day(2),
          assigneeIds: [viewer, admin],
          eventId: event._id,
        },
        { ...base, title: 'Undated mine', assigneeIds: [viewer] },
        { ...base, title: 'Later mine', dueAt: day(9), assigneeIds: [viewer] },
        {
          ...base,
          title: 'Latest mine',
          dueAt: day(30),
          assigneeIds: [viewer],
        },
        { ...base, title: 'Unassigned', dueAt: day(40) },
        // Excluded from every count: deleted, recurrence-retired and another wedding.
        { ...base, title: 'Deleted', dueAt: day(-3), deletedAt: day(-1) },
        {
          ...base,
          title: 'Retired',
          dueAt: day(-3),
          recurrenceExcluded: true,
          assigneeIds: [viewer],
        },
        { ...base, weddingId: otherWid, title: 'Foreign', dueAt: day(-3) },
        // Completed work is not "my open" work.
        {
          ...base,
          title: 'Mine but done',
          status: 'COMPLETED',
          assigneeIds: [viewer],
        },
      ]);

      await t.test(
        'counts exclude deleted, retired and foreign tasks; schedule uses passed deadlines',
        async () => {
          const summary = await tasks.summary(viewer, wid);
          assert.deepEqual(summary.counts, {
            total: 8,
            todo: 5,
            inProgress: 1,
            completed: 2,
            overdue: 1,
            myOpen: 5,
            ceremonies: 1,
          });
          assert.equal(summary.progress, 25);
          assert.equal(summary.schedule, 'NEEDS_ATTENTION');
        },
      );

      await t.test(
        'My Tasks shows four open assigned tasks, nearest deadline first and undated last',
        async () => {
          const { myTasks } = await tasks.summary(viewer, wid);
          assert.deepEqual(
            myTasks.map((task) => task.title),
            ['Overdue mine', 'Soon mine', 'Later mine', 'Latest mine'],
          );
          assert.equal(myTasks[0].overdue, true);
          assert.equal(myTasks[1].event.name, 'Haldi');
          // Admin sees only their own assignment.
          const mine = await tasks.summary(admin, wid);
          assert.equal(mine.counts.myOpen, 1);
          assert.deepEqual(
            mine.myTasks.map((task) => task.title),
            ['Soon mine'],
          );
        },
      );

      await t.test(
        'no overdue work with deadlines is On Schedule',
        async () => {
          await Task.updateOne(
            { weddingId: wid, title: 'Overdue mine' },
            { $set: { status: 'COMPLETED' } },
          );
          const summary = await tasks.summary(viewer, wid);
          assert.equal(summary.counts.overdue, 0);
          assert.equal(summary.schedule, 'ON_SCHEDULE');
        },
      );

      await t.test(
        'non-members and malformed IDs cannot read a summary',
        async () => {
          await assert.rejects(tasks.summary(outsider, wid), {
            code: 'WEDDING_NOT_FOUND',
          });
          await assert.rejects(tasks.summary(viewer, 'not-an-id'), {
            code: 'WEDDING_NOT_FOUND',
          });
          await WeddingMember.updateOne(
            { weddingId: wid, userId: viewer },
            { $set: { status: 'REMOVED' } },
          );
          await assert.rejects(tasks.summary(viewer, wid), {
            code: 'WEDDING_NOT_FOUND',
          });
        },
      );
      await t.test(
        'Step 2: upcoming ceremonies, past milestone and ranked attention items',
        async () => {
          const ceremonyBase = {
            weddingId: wid,
            createdBy: admin,
            updatedBy: admin,
          };
          await Event.create([
            {
              ...ceremonyBase,
              name: 'Mehendi',
              type: 'MEHENDI',
              description: 'Henna artists\nand folk singers',
              startAt: day(3),
              endAt: day(3.2),
              status: 'CONFIRMED',
              venue: { source: 'MANUAL', name: 'Courtyard Lawn', city: 'Puri' },
            },
            {
              ...ceremonyBase,
              name: 'Sangeet',
              type: 'SANGEET',
              startAt: day(1),
              endAt: day(1.2),
              status: 'PLANNED',
              venue: { source: 'GOOGLE', googlePlaceId: 'place_123' },
            },
            {
              ...ceremonyBase,
              name: 'Cancelled lunch',
              type: 'CUSTOM',
              startAt: day(2),
              endAt: day(2.1),
              status: 'CANCELLED',
            },
            {
              ...ceremonyBase,
              name: 'Engagement',
              type: 'ENGAGEMENT',
              startAt: day(-30),
              endAt: day(-29.9),
              status: 'COMPLETED',
            },
            // Ended more recently but never marked Completed: not a milestone.
            {
              ...ceremonyBase,
              name: 'Ended but planned',
              type: 'CUSTOM',
              startAt: day(-2),
              endAt: day(-1.9),
              status: 'PLANNED',
            },
          ]);
          await Task.create([
            {
              ...base,
              title: 'Book band',
              priority: 'LOW',
              description: '\n  Line one  \nline two',
              dueAt: day(-2),
            },
            { ...base, title: 'Priest', priority: 'URGENT' },
            { ...base, title: 'Decor', priority: 'HIGH', dueAt: day(5) },
            {
              ...base,
              title: 'Assigned high',
              priority: 'HIGH',
              dueAt: day(5),
              assigneeIds: [admin],
            },
          ]);
          const { ceremonies, attention } = await tasks.summary(admin, wid);
          assert.deepEqual(
            ceremonies.upcoming.map((item) => item.name),
            ['Sangeet', 'Mehendi', 'Haldi'],
          );
          assert.deepEqual(ceremonies.upcoming[0].venue, {
            name: '',
            city: '',
            onMap: true,
          });
          assert.equal(ceremonies.upcoming[1].description, 'Henna artists');
          assert.equal(ceremonies.upcoming[2].venue, null);
          assert.equal(ceremonies.past.name, 'Engagement');
          assert.deepEqual(attention.counts, {
            overdue: 1,
            unassigned: 2,
            noVenue: 1,
            soon: 2,
          });
          assert.equal(attention.total, 6);
          assert.deepEqual(
            attention.items.map(
              (item) =>
                `${item.type}:${(item.task || item.event).name || item.task.title}`,
            ),
            [
              'OVERDUE_TASK:Book band',
              'UNASSIGNED_TASK:Priest',
              'UNASSIGNED_TASK:Decor',
              'NO_VENUE:Haldi',
            ],
          );
          assert.equal(attention.items[0].task.description, 'Line one');
          assert.equal(attention.items[0].task.overdue, true);
        },
      );

      await t.test(
        'My Tasks sends no notes, lists undated tasks oldest first and a deadline at this instant is not overdue; the badge count needs no member rows',
        async () => {
          const helper = await account();
          await WeddingMember.create({
            weddingId: wid,
            userId: helper,
            role: 'FAMILY_MEMBER',
            status: 'ACTIVE',
            joinedAt: new Date(),
            createdBy: admin,
          });
          for (const input of [
            { title: 'Undated first', description: 'Private note one' },
            { title: 'Undated second', description: 'Private note two' },
            { title: 'Due right now', dueAt: instant },
          ])
            await Task.create({ ...base, ...input, assigneeIds: [helper] });
          const { myTasks } = await tasks.summary(helper, wid);
          assert.deepEqual(
            myTasks.map((task) => task.title),
            ['Due right now', 'Undated first', 'Undated second'],
          );
          assert.equal(myTasks[0].overdue, false);
          assert.ok(myTasks.every((task) => task.description === ''));
          const members = createMemberService({ database });
          const badge = await members.count(helper, wid);
          assert.deepEqual(Object.keys(badge), ['counts']);
          assert.equal(badge.counts.ALL, 2);
          await assert.rejects(members.count(outsider, wid), {
            code: 'WEDDING_NOT_FOUND',
          });
        },
      );
    } finally {
      await connection.dropDatabase();
      await database.close();
    }
  },
);
