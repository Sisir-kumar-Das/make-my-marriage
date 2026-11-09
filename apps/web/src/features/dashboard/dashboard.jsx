import Link from 'next/link';
import {
  CalendarDays,
  MapPin,
  CalendarPlus,
  ListChecks,
  Users,
  Zap,
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
import { DashboardCover } from '@/features/weddings/dashboard-cover';
import { WeddingActivity } from './wedding-activity';
import {
  AttentionCard,
  MyTasksCard,
  PlanningProgress,
  RefreshNotice,
  TaskSummaryProvider,
  UpcomingCeremonies,
} from './task-summary';
import styles from './workspace-ui.module.css';

export function Dashboard({ wedding, membership, userId }) {
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
              <span className="rounded-full bg-champagne px-2.5 py-1 text-[0.7rem] font-semibold tracking-wide text-primary uppercase">
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
                <span className={styles.countdownLabel}>
                  {days < 0
                    ? 'days since celebration'
                    : days === 0
                      ? 'Wedding day'
                      : 'days to go'}
                </span>
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
              <h2 className={styles.actionsTitle}>Coordinator Actions</h2>
              <p className="text-xs text-muted-foreground">
                Direct additions to workspace timeline &amp; assignments
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
            <Link href="/events?create=1" className={styles.action}>
              <CalendarPlus size={16} />
              Add Event
            </Link>
            {membership.role === 'ADMIN' && (
              <Link href="/members?invite=1" className={styles.action}>
                <Users size={16} />
                Invite Member
              </Link>
            )}
          </div>
        </section>
      ) : (
        <p className={styles.note}>
          <ShieldCheck size={18} />
          You are viewing the planner in read-only mode. Administrative editing,
          task assignments, and timeline adjustments are locked.
        </p>
      )}
      <TaskSummaryProvider weddingId={wedding.id} userId={userId}>
        <RefreshNotice />
        <PlanningProgress wedding={wedding} daysToGo={days} />
        <AttentionCard />
        <div className={styles.columns}>
          <UpcomingCeremonies />
          <div className={styles.stack}>
            <MyTasksCard />
            <WeddingActivity weddingId={wedding.id} userId={userId} compact />
          </div>
        </div>
      </TaskSummaryProvider>
    </div>
  );
}
