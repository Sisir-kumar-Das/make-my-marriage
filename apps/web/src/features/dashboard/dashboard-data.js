// Labels for the server-calculated schedule status (owner rule, 1 November 2026).
export const scheduleLabels = {
  NOT_STARTED: ['Not started', 'neutral'],
  NO_DEADLINES: ['No deadlines yet', 'neutral'],
  ON_SCHEDULE: ['On Schedule', 'good'],
  NEEDS_ATTENTION: ['Needs Attention', 'warning'],
  BEHIND_SCHEDULE: ['Behind Schedule', 'danger'],
};

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function remainingLabel({ total, open }, wedding, daysToGo) {
  if (!total)
    return 'Add tasks or generate a checklist to start tracking progress.';
  if (!open) return 'All tasks are complete.';
  const couple = [wedding.brideName, wedding.groomName]
    .map((name) => name?.trim())
    .filter(Boolean)
    .join(' & ');
  return daysToGo < 0 || !couple
    ? `${plural(open, 'task')} still open.`
    : `${plural(open, 'task')} ${open === 1 ? 'remains' : 'remain'} before ${couple}'s wedding.`;
}

export { plural };

const indiaDate = (instant) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
    new Date(instant),
  );

// Days are counted between India calendar dates, so "Tomorrow" means tomorrow in IST.
export function daysLabel(ceremony, now = Date.now()) {
  if (Date.parse(ceremony.startAt) <= Number(now)) return 'Happening now';
  const days = Math.round(
    (Date.parse(indiaDate(ceremony.startAt)) - Date.parse(indiaDate(now))) /
      86400000,
  );
  return days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days} days`;
}

// Only saved, user-entered venue text is shown; a map-only Google venue has no saved name.
export function venueLabel(venue) {
  if (!venue) return 'Venue not added';
  return (
    venue.name || venue.city || (venue.onMap ? 'Venue selected on map' : '')
  );
}

// Dashboard cards show the India date only (Stitch "Due 15 Jan 2027"); the drawer shows the time.
export function dueDay(task) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(task.dueAt));
}

// A loaded summary belongs to one "userId:weddingId" scope. After an account or wedding
// change it is discarded, never shown under the new scope (privacy).
export function scopedResult(result, scope) {
  return result && result.scope === scope ? result : null;
}

// Background refreshes (focus, timer) run at most every 30 seconds, measured from the last
// request start so a slow load in flight is not restarted. Retry bypasses this.
export const refreshGapMs = 30000;
export function refreshAllowed(now, startedAt, gap = refreshGapMs) {
  return now - startedAt >= gap;
}

// The live session (header) can change before the server-rendered page props catch up after
// another tab switches account; loaded data is used only while both name the same scope.
export function sessionMatches(live, scope) {
  return !live || `${live.user?.id}:${live.wedding?.id}` === scope;
}

// Answers that mean this account may no longer see the wedding (signed out, removed member,
// wedding gone). Loaded data is dropped on these, never kept on screen.
export const noAccessStatuses = [401, 403, 404];

// A failed refresh keeps the last good data of the same scope (shown with a "couldn't
// refresh" note); a failure in a new scope, or a "no access" answer, has nothing to keep.
export function failedResult(previous, scope, key, failure) {
  const noAccess = noAccessStatuses.includes(failure?.status);
  const keep = previous?.scope === scope && !noAccess;
  return {
    scope,
    key,
    failed: true,
    noAccess,
    status: failure?.status,
    data: keep ? previous.data : undefined,
  };
}

// Sidebar badge after a failed recount: a definite "no access" (signed out, no longer a
// member, wedding gone) hides it; a network or server hiccup keeps the last same-scope count.
export function badgeAfterFailure(previous, scope, failure) {
  if (noAccessStatuses.includes(failure?.status)) return { scope, count: null };
  return previous?.scope === scope ? previous : { scope, count: null };
}

// What a "no access" answer means for the person (owner wording, 5 Nov). Signed out (401) and
// removed (403) are final until they act, so background refreshes stop; a wedding that is not
// found (404) may be a short outage, so the normal slow refresh continues.
export const noAccessNotes = {
  401: { text: "You've been signed out. Please sign in again.", final: true },
  403: { text: 'You no longer have access to this wedding.', final: true },
  404: { text: 'This wedding is no longer available.', final: false },
};
