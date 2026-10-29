import Link from 'next/link';
import {
  CalendarDays,
  MapPin,
  CalendarPlus,
  ListChecks,
  Users,
  Zap,
  TriangleAlert,
  Clock3,
  ShieldCheck,
} from 'lucide-react';
import { WeddingTitle } from '@/features/weddings/wedding-title';
import {
  weddingDate,
  weddingToday,
  traditions,
  budgetLabel,
} from '@/features/weddings/form-data';
import { ApiStatus } from './api-status';
import { DashboardCover } from '@/features/weddings/dashboard-cover';
import { ComingSoon, EmptyPanel, MetricPanels } from './workspace-ui';
import styles from './workspace-ui.module.css';

export function Dashboard({ wedding, membership }) {
  const days = Math.round(
    (Date.parse(wedding.mainDate) - Date.parse(weddingToday())) / 86400000,
  );
  const tradition =
    traditions.find(([key]) => key === wedding.tradition)?.[1] ||
    wedding.tradition;
  return (
    <div className={styles.stack}>
      <section className="overflow-hidden rounded-lg bg-white shadow-sm">
        <DashboardCover wedding={wedding} membership={membership}>
          <div className={styles.heroText}>
            <div className={styles.heroMeta}>
              <span className="rounded-full bg-champagne px-2 py-1 text-primary">
                <ShieldCheck size={12} />
                {tradition} wedding tradition
              </span>
              <span>
                <MapPin size={13} />
                {wedding.location.city}, {wedding.location.state}
              </span>
            </div>
            <WeddingTitle as="h1" name={wedding.name} />
            <p className={styles.description}>
              Your ceremonies, family and shared plans, together in one private
              wedding workspace.
            </p>
            <div className={styles.heroDate}>
              <span>
                <strong className={styles.countdown}>{Math.abs(days)}</strong>
                {days < 0
                  ? 'days since celebration'
                  : days === 0
                    ? 'Wedding day'
                    : 'days to go'}
              </span>
              <span>
                <CalendarDays size={14} />
                Wedding date: <strong>{weddingDate(wedding.mainDate)}</strong>
              </span>
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock3 size={13} />
              India · Asia/Kolkata (IST)
            </p>
            {wedding.estimatedBudget && membership.financeAccess && (
              <p className="mt-3 text-xs text-muted-foreground">
                Estimated budget:{' '}
                <strong className="text-foreground">
                  {budgetLabel(wedding.estimatedBudget.amountMinor)}
                </strong>
              </p>
            )}
          </div>
        </DashboardCover>
      </section>
      {membership.role !== 'VIEWER' ? (
        <section className={`${styles.card} ${styles.row}`}>
          <div className="flex items-center gap-3">
            <span className={styles.iconTile}>
              <Zap size={19} />
            </span>
            <div>
              <h2>Coordinator Actions</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Add a task or ceremony to your wedding plans. Admins can invite
                collaborators from Members.
              </p>
            </div>
          </div>
          <div className={styles.actions}>
            <Link
              href="/tasks?create=1"
              className={`${styles.action} ${styles.primary}`}
            >
              <ListChecks size={16} />
              Add Task
            </Link>
            <Link
              href="/events?create=1"
              className={`${styles.action} ${styles.primary}`}
            >
              <CalendarPlus size={16} />
              Add Event
            </Link>
            {membership.role === 'ADMIN' && (
              <Link
                href="/members?invite=1"
                className={`${styles.action} ${styles.primary}`}
              >
                <Users size={16} />
                Invite Member
              </Link>
            )}
          </div>
        </section>
      ) : (
        <p className={styles.note}>
          <ShieldCheck size={18} />
          You are viewing this wedding as a Viewer. Planning access is
          read-only.
        </p>
      )}
      <div className={styles.progressRow}>
        <section className={styles.card}>
          <div className={styles.row}>
            <div>
              <p className={styles.eyebrow}>Planning status</p>
              <h2 className="mt-1">Planning Completion</h2>
            </div>
            <ComingSoon />
          </div>
          <div className={styles.progressBody}>
            <div className={styles.dial}>—</div>
            <p>
              Your task progress will appear here when planning tools are
              available.
            </p>
          </div>
          <div className={styles.progressTrack} />
        </section>
        <MetricPanels />
      </div>
      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <h2 className="flex items-center gap-2">
            <TriangleAlert size={18} className="text-primary" />
            Attention Required
          </h2>
          <ComingSoon />
        </div>
        <EmptyPanel icon={TriangleAlert}>
          <p>
            Planning reminders, missing details and overdue tasks will appear
            here.
          </p>
        </EmptyPanel>
      </section>
      <div className={styles.columns}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Schedule</p>
          <div className={`${styles.sectionHeader} mt-2`}>
            <h2>Upcoming Ceremonies</h2>
            <Link href="/events">View all →</Link>
          </div>
          <EmptyPanel icon={CalendarDays}>
            <p>
              Your dashboard ceremony summary is coming soon. View Events for
              your saved ceremonies and venue details.
            </p>
          </EmptyPanel>
        </section>
        <div className={styles.stack}>
          <section className={styles.card}>
            <p className={styles.eyebrow}>Host & family queue</p>
            <div className={`${styles.sectionHeader} mt-2`}>
              <h2>My Tasks</h2>
              <Link href="/tasks">View all →</Link>
            </div>
            <EmptyPanel icon={ListChecks}>
              <p>
                Your assigned tasks and upcoming due dates will appear here.
              </p>
            </EmptyPanel>
          </section>
          <section className={styles.card}>
            <p className={styles.eyebrow}>Collaborators log</p>
            <h2 className="mt-2">Recent Activity</h2>
            <EmptyPanel icon={Users}>
              <p>Updates from your planning team are coming soon.</p>
            </EmptyPanel>
          </section>
        </div>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Connection status</summary>
        <div className="mt-3">
          <ApiStatus />
        </div>
      </details>
    </div>
  );
}
