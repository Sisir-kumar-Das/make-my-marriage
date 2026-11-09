'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  ClipboardList,
  Info,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserRoundCog,
  UserPlus,
} from 'lucide-react';
import { useSession } from '@/features/auth/session-provider';
import { apiRequest } from '@/lib/api-client';
import { activityGroups, activityTime } from './activity-dates';

const actions = {
  TASK_CREATED: [
    ListChecks,
    'added task',
    'Tasks module',
    'bg-muted text-primary',
  ],
  TASK_UPDATED: [
    ListChecks,
    'updated task',
    'Tasks module',
    'bg-muted text-primary',
  ],
  TASK_SERIES_CREATED: [
    ListChecks,
    'set up repeats for',
    'Tasks module',
    'bg-muted text-primary',
  ],
  TASK_COMPLETED: [
    CircleCheck,
    'completed',
    'Tasks module',
    'bg-champagne text-[#261a00]',
  ],
  TASK_DELETED: [
    Trash2,
    'deleted task',
    'Tasks module',
    'bg-[#ffdad6] text-[#ba1a1a]',
  ],
  TASK_RESTORED: [
    ListChecks,
    'restored task',
    'Tasks module',
    'bg-muted text-primary',
  ],
  EVENT_CREATED: [
    CalendarDays,
    'added ceremony',
    'Events module',
    'bg-[#ffd8e5] text-[#390722]',
  ],
  EVENT_UPDATED: [
    CalendarClock,
    'updated',
    'Events module',
    'bg-[#ffd8e5] text-[#390722]',
  ],
  EVENT_DELETED: [
    Trash2,
    'deleted ceremony',
    'Events module',
    'bg-[#ffdad6] text-[#ba1a1a]',
  ],
  EVENT_RESTORED: [
    CalendarDays,
    'restored ceremony',
    'Events module',
    'bg-[#ffd8e5] text-[#390722]',
  ],
  CHECKLIST_GENERATED: [
    ClipboardList,
    'generated checklist',
    'Checklist module',
    'bg-accent text-accent-foreground',
  ],
  INVITATION_CREATE: [
    UserPlus,
    'created a wedding invitation',
    'Members module',
    'bg-muted text-primary',
  ],
  INVITATION_ACCEPT: [
    UserCheck,
    'joined',
    'Members module',
    'bg-[#ede6ea] text-foreground',
  ],
  MEMBER_UPDATED: [
    UserRoundCog,
    'updated member details for',
    'Members module',
    'bg-[#ede6ea] text-foreground',
  ],
  MEMBER_REMOVED: [
    ShieldCheck,
    'removed',
    'Members module',
    'bg-[#ffd8e5] text-[#390722]',
  ],
};
const roles = {
  ADMIN: 'Admin',
  FAMILY_MEMBER: 'Family Member',
  VIEWER: 'Viewer',
};
const card =
  'overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm';
const control =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-primary';

function ActivityRow({ item, now, compact = false }) {
  const [Icon, verb, module, tone] = actions[item.action];
  const deleted = item.action.endsWith('_DELETED');
  const recordTitle = !compact && /^(TASK|EVENT)_/.test(item.action);
  const title = recordTitle && item.label ? `‘${item.label}’` : item.label;
  return (
    <li
      className={`relative flex min-w-0 items-start gap-2.5 sm:gap-3.5 ${
        compact
          ? ''
          : `min-h-[70px] px-3.5 py-3.5 max-[359px]:min-h-11 max-[359px]:p-2.5 sm:px-6 sm:py-4 ${deleted ? 'bg-[#ffdad6]/20' : ''}`
      }`}
    >
      <span
        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full sm:size-8 ${tone}`}
      >
        <Icon size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-snug wrap-anywhere sm:text-sm">
          <strong className="font-semibold text-primary">{item.actor}</strong>{' '}
          {item.action === 'MEMBER_UPDATED' && item.role
            ? 'changed the role of'
            : item.action === 'INVITATION_ACCEPT' && !item.role
              ? 'joined the wedding'
              : verb}
          {item.label && (
            <>
              {' '}
              {item.href && !compact ? (
                <Link
                  className="font-medium text-primary underline-offset-2 hover:underline max-sm:after:absolute max-sm:after:inset-0 max-sm:focus-visible:after:ring-2 max-sm:focus-visible:after:ring-inset max-sm:focus-visible:after:ring-ring"
                  href={item.href}
                >
                  {title}
                </Link>
              ) : (
                <span
                  className={
                    deleted ? 'italic text-muted-foreground' : 'font-medium'
                  }
                >
                  {title}
                </span>
              )}
            </>
          )}
          {item.role && (
            <>
              {' '}
              {item.action === 'MEMBER_UPDATED' ? 'to' : 'as'}{' '}
              <span
                className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                  item.action === 'INVITATION_ACCEPT'
                    ? 'bg-accent text-accent-foreground'
                    : 'border border-border bg-muted text-primary'
                }`}
              >
                {roles[item.role]}
              </span>
            </>
          )}
          {deleted && (
            <span className="ml-2 inline-flex rounded bg-[#ffdad6] px-1.5 py-0.5 text-[11px] font-semibold text-[#ba1a1a]">
              Deleted
            </span>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground sm:text-xs">
          <time dateTime={item.createdAt}>
            {activityTime(item.createdAt, now)}
          </time>
          <span className="hidden sm:inline" aria-hidden="true">
            •
          </span>
          <span className="hidden sm:inline">{module}</span>
        </div>
      </div>
    </li>
  );
}

function ActivityState({ error, loading, retry, compact }) {
  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading activity"
        className={compact ? 'space-y-4' : 'space-y-4 p-6'}
      >
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="flex gap-3 motion-safe:animate-pulse"
            aria-hidden="true"
          >
            <span className="size-8 shrink-0 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-4/5 rounded bg-muted" />
              <div className="h-2 w-1/3 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  const denied = [401, 403, 404].includes(error?.status);
  const Icon = error ? CircleAlert : Clock3;
  return (
    <div
      className={`px-4 text-center ${compact ? 'py-4' : 'py-8'}`}
      role={error ? 'alert' : undefined}
    >
      <span
        className={`mx-auto mb-4 grid size-14 place-items-center rounded-full ${
          error
            ? 'bg-[#ffdad6] text-[#ba1a1a]'
            : 'border border-border/60 bg-muted text-primary'
        }`}
      >
        <Icon size={28} aria-hidden="true" />
      </span>
      <h3 className="mb-1 font-serif text-lg font-medium">
        {denied
          ? 'Activity is unavailable'
          : error
            ? 'We couldn’t load activity'
            : 'No activity yet'}
      </h3>
      <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted-foreground">
        {denied
          ? 'Your current session cannot access this wedding’s activity.'
          : error
            ? 'Please try again.'
            : 'Updates will appear as your team starts planning.'}
      </p>
      {error && !denied && (
        <button
          type="button"
          onClick={retry}
          className={`${control} mt-4 bg-primary text-white`}
        >
          <RefreshCw size={16} aria-hidden="true" /> Retry
        </button>
      )}
    </div>
  );
}

function PageLink({ page, disabled, children }) {
  const style = `${control} min-w-11 border border-border bg-white hover:bg-muted max-sm:px-2`;
  return disabled ? (
    <button type="button" disabled className={`${style} bg-muted opacity-60`}>
      {children}
    </button>
  ) : (
    <Link
      href={page === 1 ? '/activity' : `/activity?page=${page}`}
      className={style}
    >
      {children}
    </Link>
  );
}

function Timeline({ data, now, state }) {
  return (
    <section className={card} aria-label="Timeline Feed">
      <div className="hidden flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border/60 bg-background/50 px-6 py-4 sm:flex">
        <h2 className="text-sm font-semibold">
          Timeline Feed
          {data && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              • {data.total} logged {data.total === 1 ? 'action' : 'actions'}
            </span>
          )}
        </h2>
        <span className="text-xs text-muted-foreground">
          Showing newest activity first
        </span>
      </div>
      {data?.items.length ? (
        <>
          {activityGroups(data.items, now).map((group) => (
            <section key={group.key} aria-labelledby={`activity-${group.key}`}>
              <div className="flex items-center justify-between gap-2 border-y border-border/50 bg-muted/70 px-3.5 py-1.5 text-xs text-primary sm:px-6 sm:py-2.5">
                <h3
                  id={`activity-${group.key}`}
                  className="flex items-center gap-2 font-semibold"
                >
                  <span
                    className="hidden size-2 rounded-full bg-primary sm:inline-block"
                    aria-hidden="true"
                  />
                  {group.title}
                </h3>
                <span className="hidden text-[11px] text-muted-foreground sm:inline">
                  {group.items.length}{' '}
                  {group.items.length === 1 ? 'update' : 'updates'}
                </span>
              </div>
              <ul className="divide-y divide-border/45">
                {group.items.map((item) => (
                  <ActivityRow key={item.id} item={item} now={now} />
                ))}
              </ul>
            </section>
          ))}
          <nav
            aria-label="Activity pages"
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 border-t border-border/60 bg-background/50 p-2.5 sm:gap-3 sm:px-6 sm:py-4"
          >
            <p className="text-[11px] text-muted-foreground sm:text-xs">
              <span className="max-sm:sr-only">Showing </span>
              <strong className="text-foreground">
                {data.from}–{data.to}
              </strong>{' '}
              of <strong className="text-foreground">{data.total}</strong>
              <span className="max-sm:sr-only"> activities</span>
            </p>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <PageLink page={data.page - 1} disabled={data.page === 1}>
                <ChevronLeft
                  size={15}
                  className="hidden sm:block"
                  aria-hidden="true"
                />
                <span className="sm:hidden">Prev</span>
                <span className="hidden sm:inline">Previous</span>
              </PageLink>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Page {data.page} of {data.totalPages}
              </span>
              <PageLink
                page={data.page + 1}
                disabled={data.page === data.totalPages}
              >
                Next{' '}
                <ChevronRight
                  size={15}
                  className="hidden sm:block"
                  aria-hidden="true"
                />
              </PageLink>
            </div>
          </nav>
        </>
      ) : (
        state
      )}
    </section>
  );
}

function ActivityFeed({ weddingId, page = 1, compact = false }) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(
      `/weddings/${weddingId}/activity?page=${page}&limit=${compact ? 3 : 20}`,
      { signal: controller.signal },
    )
      .then(({ data }) => {
        if (!controller.signal.aborted)
          setResult({ data, attempt, now: Date.now() });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ error, attempt });
      });
    return () => controller.abort();
  }, [weddingId, page, compact, attempt]);

  const current = result?.attempt === attempt ? result : null;
  const data = current?.data;
  const state = (
    <ActivityState
      loading={!current}
      error={current?.error}
      retry={() => setAttempt((value) => value + 1)}
      compact={compact}
    />
  );
  if (compact) {
    return (
      <section className="rounded-xl border border-border/60 bg-white p-6 shadow-sm">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
          <div>
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Collaborators Log
            </p>
            <h2 className="mt-0.5 text-lg font-semibold">Recent Activity</h2>
          </div>
          <Link href="/activity" className={`${control} hover:bg-muted`}>
            View All <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </header>
        {data?.items.length ? (
          <ul className="space-y-4">
            {data.items.map((item) => (
              <ActivityRow
                key={item.id}
                item={item}
                now={current.now}
                compact
              />
            ))}
          </ul>
        ) : (
          state
        )}
      </section>
    );
  }
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft size={18} aria-hidden="true" /> Back to Dashboard
      </Link>
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-2xl font-medium tracking-tight sm:text-4xl">
              Wedding Activity
            </h1>
            <span className="hidden rounded-full border border-border/60 bg-muted px-2.5 py-0.5 text-xs font-semibold text-primary sm:inline-flex">
              Audit Log
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Updates from your wedding planning team.
          </p>
        </div>
        <div className="inline-flex shrink-0 items-center justify-between gap-2 rounded-xl border border-border/60 bg-white px-3.5 py-2 text-xs text-muted-foreground shadow-sm">
          <span className="inline-flex items-center gap-2 font-medium text-foreground">
            <Clock3 size={16} className="text-primary" aria-hidden="true" />{' '}
            Times shown in IST
          </span>
          <span className="hidden sm:inline">(UTC+05:30)</span>
          {data && (
            <span className="sm:hidden">
              Showing {data.items.length} entries
            </span>
          )}
        </div>
      </header>
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-border/60 bg-muted px-4 py-3 text-xs text-muted-foreground shadow-sm sm:text-sm">
        <Info
          size={18}
          className="hidden shrink-0 text-primary sm:inline"
          aria-hidden="true"
        />
        <p>
          Updates from your wedding planning team, visible to current wedding
          members.
        </p>
      </div>
      <Timeline data={data} now={current?.now} state={state} />
    </div>
  );
}

export function WeddingActivity({
  weddingId,
  userId,
  page = 1,
  compact = false,
}) {
  const session = useSession();
  if (
    session?.user?.id !== userId ||
    session?.wedding?.id !== weddingId ||
    session.connectionError
  )
    return null;
  return (
    <ActivityFeed
      key={`${userId}:${weddingId}:${session.membership?.role}:${page}`}
      weddingId={weddingId}
      page={page}
      compact={compact}
    />
  );
}
