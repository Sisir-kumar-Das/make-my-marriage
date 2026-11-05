// Dashboard schedule label (owner decision, 1 November 2026). Only tasks whose deadline has
// already passed decide it, so the label never claims progress the data cannot support.
export function scheduleStatus({ total, open, overdue, dated }) {
  if (!total) return 'NOT_STARTED';
  if (!overdue) return dated ? 'ON_SCHEDULE' : 'NO_DEADLINES';
  // A few overdue tasks need attention: up to 2, or up to 10% of open tasks if that is more.
  return overdue <= Math.max(2, Math.floor(open * 0.1))
    ? 'NEEDS_ATTENTION'
    : 'BEHIND_SCHEDULE';
}
