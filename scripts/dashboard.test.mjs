import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleStatus } from '../apps/api/src/tasks/summary.js';
import {
  daysLabel,
  dueDay,
  refreshAllowed,
  refreshGapMs,
  remainingLabel,
  scheduleLabels,
  scopedResult,
  venueLabel,
} from '../apps/web/src/features/dashboard/dashboard-data.js';

test('schedule status follows the owner rule using only passed deadlines', () => {
  const status = (total, open, overdue, dated) =>
    scheduleStatus({ total, open, overdue, dated });
  assert.equal(status(0, 0, 0, 0), 'NOT_STARTED');
  assert.equal(status(5, 5, 0, 0), 'NO_DEADLINES');
  assert.equal(status(5, 0, 0, 3), 'ON_SCHEDULE');
  assert.equal(status(50, 16, 0, 40), 'ON_SCHEDULE');
  // Up to 2 overdue always needs attention, even with few open tasks.
  assert.equal(status(3, 2, 2, 2), 'NEEDS_ATTENTION');
  assert.equal(status(3, 3, 3, 3), 'BEHIND_SCHEDULE');
  // 10% of open tasks raises the yellow limit for larger plans.
  assert.equal(status(80, 40, 4, 40), 'NEEDS_ATTENTION');
  assert.equal(status(80, 40, 5, 40), 'BEHIND_SCHEDULE');
  assert.equal(status(80, 29, 3, 29), 'BEHIND_SCHEDULE');
  // Exact 10% boundary: 3 of 30 open is still Needs Attention, 4 is behind.
  assert.equal(status(40, 30, 3, 30), 'NEEDS_ATTENTION');
  assert.equal(status(40, 30, 4, 30), 'BEHIND_SCHEDULE');
  for (const value of [
    'NOT_STARTED',
    'NO_DEADLINES',
    'ON_SCHEDULE',
    'NEEDS_ATTENTION',
    'BEHIND_SCHEDULE',
  ])
    assert.ok(scheduleLabels[value], `${value} has a label`);
});

test('remaining text uses real couple names and safe fallbacks', () => {
  const wedding = { brideName: 'Anya', groomName: 'Kabir' };
  assert.equal(
    remainingLabel({ total: 50, open: 16 }, wedding, 30),
    "16 tasks remain before Anya & Kabir's wedding.",
  );
  assert.equal(
    remainingLabel({ total: 2, open: 1 }, wedding, 30),
    "1 task remains before Anya & Kabir's wedding.",
  );
  assert.equal(
    remainingLabel({ total: 2, open: 2 }, wedding, -3),
    '2 tasks still open.',
  );
  assert.equal(
    remainingLabel({ total: 2, open: 0 }, wedding, 30),
    'All tasks are complete.',
  );
  assert.match(
    remainingLabel({ total: 0, open: 0 }, wedding, 30),
    /^Add tasks/,
  );
  assert.equal(
    remainingLabel({ total: 3, open: 3 }, { brideName: ' ', groomName: '' }, 9),
    '3 tasks still open.',
  );
});

test('ceremony days use India dates and venues show only saved text', () => {
  // 1 Jan 2027, 11:00 PM IST; 18:31 UTC is 12:01 AM IST on 2 Jan.
  const now = Date.parse('2027-01-01T17:30:00Z');
  const at = (iso) => ({ startAt: iso, endAt: iso });
  assert.equal(daysLabel(at('2027-01-01T18:31:00Z'), now), 'Tomorrow');
  assert.equal(daysLabel(at('2027-01-01T17:45:00Z'), now), 'Today');
  assert.equal(daysLabel(at('2027-01-05T06:00:00Z'), now), 'in 4 days');
  assert.equal(daysLabel(at('2027-01-01T10:00:00Z'), now), 'Happening now');
  assert.equal(venueLabel(null), 'Venue not added');
  assert.equal(
    venueLabel({ name: 'Kalyani Mandap', city: 'Keonjhar' }),
    'Kalyani Mandap',
  );
  assert.equal(
    venueLabel({ name: '', city: 'Keonjhar', onMap: true }),
    'Keonjhar',
  );
  assert.equal(
    venueLabel({ name: '', city: '', onMap: true }),
    'Venue selected on map',
  );
});

test('dashboard due dates show the India calendar date only', () => {
  // 11:59 PM IST on 15 Jan 2027 is still 15 Jan in India.
  assert.equal(dueDay({ dueAt: '2027-01-15T18:29:00Z' }), '15 Jan 2027');
  assert.equal(dueDay({ dueAt: '2027-01-15T18:31:00Z' }), '16 Jan 2027');
});

test('a loaded summary is never shown under another account or wedding', () => {
  const loaded = { scope: 'userA:weddingA', data: { counts: { total: 9 } } };
  assert.equal(scopedResult(loaded, 'userA:weddingA'), loaded);
  // Codex reproduction: wedding A loaded, then B while B's response is delayed.
  assert.equal(scopedResult(loaded, 'userA:weddingB'), null);
  assert.equal(scopedResult(loaded, 'userB:weddingA'), null);
  assert.equal(scopedResult(null, 'userA:weddingA'), null);
});

test('background refreshes wait 30 seconds from the last request start', () => {
  const started = 1_000_000;
  assert.equal(refreshGapMs, 30000);
  // A focus 2 s after a (possibly still loading) request starts does not restart it.
  assert.equal(refreshAllowed(started + 2000, started), false);
  assert.equal(refreshAllowed(started + 29999, started), false);
  assert.equal(refreshAllowed(started + 30000, started), true);
});
