'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  CircleCheck,
  Clock,
  Clock3,
  History,
  ListChecks,
  ListTodo,
  ChevronRight,
  MapPin,
  MapPinOff,
  TriangleAlert,
  User,
  UserX,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useSession } from '@/features/auth/session-provider';
import { taskPriorities } from '@/features/tasks/form-data';
import {
  eventDate,
  eventRange,
  eventStatuses,
} from '@/features/events/form-data';
import {
  daysLabel,
  dueDay,
  failedResult,
  noAccessNotes,
  refreshAllowed,
  scopedResult,
  sessionMatches,
  plural,
  remainingLabel,
  scheduleLabels,
  venueLabel,
} from './dashboard-data';
import styles from './workspace-ui.module.css';

const SummaryContext = createContext(null);

// One summary request feeds the progress card, counts and My Tasks, so they always agree.
// Results belong to one account + wedding scope: a scope change discards them at once, so
// another wedding's numbers or task titles are never shown while the new request loads.
export function TaskSummaryProvider({ weddingId, userId, children }) {
  const scope = `${userId}:${weddingId}`;
  // The live session updates before the server-rendered props do (another tab can switch the
  // account); until both agree, nothing loaded is shown and nothing is requested.
  const current = sessionMatches(useSession(), scope);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const started = useRef(0);
  // After a "no access" answer nothing is refreshed in the background any more; the session
  // check moves the person out of this wedding.
  const blocked = useRef(false);
  const key = `${scope}:${revision}`;
  useEffect(() => {
    if (!current) return;
    const controller = new AbortController();
    started.current = Date.now();
    void apiRequest(`/weddings/${weddingId}/tasks/summary`, {
      signal: controller.signal,
      timeoutMs: 15000,
    })
      .then((response) => {
        if (!controller.signal.aborted)
          setResult({ scope, key, data: response.data });
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setResult((previous) => failedResult(previous, scope, key, failure));
      });
    return () => controller.abort();
  }, [weddingId, scope, key, current]);
  useEffect(() => {
    // Measured from the last request start, so a slow first load is never restarted.
    const refresh = () => {
      if (
        !blocked.current &&
        document.visibilityState !== 'hidden' &&
        refreshAllowed(Date.now(), started.current)
      )
        setRevision((value) => value + 1);
    };
    const revalidate = () => {
      if (!blocked.current) setRevision((value) => value + 1);
    };
    const restore = (event) => {
      if (event.persisted) revalidate();
    };
    const channel =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('mmm-session')
        : null;
    if (channel)
      channel.onmessage = ({ data }) => {
        if (data?.type === 'tasks-changed' && data.weddingId === weddingId)
          revalidate();
      };
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', restore);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', restore);
      window.clearInterval(timer);
      channel?.close();
    };
  }, [weddingId]);
  // A failed background refresh keeps the last good numbers and raises a slim note; only a
  // failure with nothing loaded yet shows the error panel in the cards. While the next attempt
  // runs, the note stays and says "Retrying…" instead of vanishing with no sign of progress.
  const own = current ? scopedResult(result, scope) : null;
  const failedNow = !!own?.failed && own.key === key;
  const data = own?.data;
  const stale = !!own?.failed && !!data;
  // All cards come from this one request, so a first-load failure shows one shared note with
  // one Retry (owner, 5 Nov) instead of an error and a Retry in every card.
  const unloaded = !!own?.failed && !data;
  const noAccess = !!own?.failed && !!own?.noAccess;
  const access = noAccess ? noAccessNotes[own.status] : null;
  const final = !!access?.final;
  useEffect(() => {
    blocked.current = final;
  }, [final]);
  const value = {
    data,
    error: failedNow && !data,
    stale,
    unloaded,
    noAccess,
    access,
    retrying: !!own?.failed && own.key !== key,
    loading: !data && !failedNow,
    retry: () => setRevision((count) => count + 1),
  };
  return (
    <SummaryContext.Provider value={value}>{children}</SummaryContext.Provider>
  );
}

// Owner-approved (4 Nov): a slim in-page note, not a pop-up, while the last numbers are shown.
// Owner, 5 Nov: the same single note (with the only Retry) also covers a failed first load.
export function RefreshNotice() {
  const summary = useContext(SummaryContext);
  if (!summary.stale && !summary.unloaded) return null;
  // Owner, 5 Nov: signed out, removed or wedding gone each get a plain message and no Retry
  // (a signed-out person gets a Sign in link instead).
  if (summary.access)
    return (
      <p className={`${styles.note} ${styles.refreshNote}`} role="alert">
        <TriangleAlert size={16} aria-hidden="true" />
        <span>{summary.access.text}</span>
        {summary.access === noAccessNotes[401] && (
          <Link href="/login" className={styles.noteAction}>
            Sign in
          </Link>
        )}
        {/* A missing wedding may be a short outage: it can be retried now, not only by the
            slow background refresh. */}
        {!summary.access.final && (
          <button
            type="button"
            className={styles.noteAction}
            onClick={summary.retry}
            disabled={summary.retrying}
          >
            {summary.retrying ? 'Retrying…' : 'Retry'}
          </button>
        )}
      </p>
    );
  const message = summary.retrying
    ? summary.stale
      ? 'Trying again. Showing your last loaded numbers.'
      : 'Loading your planning data again…'
    : summary.stale
      ? "Couldn't refresh just now. Showing your last loaded numbers."
      : "We couldn't load your planning data. Please try again.";
  return (
    <p
      className={`${styles.note} ${styles.refreshNote}`}
      role={summary.unloaded && !summary.retrying ? 'alert' : 'status'}
    >
      <TriangleAlert size={16} aria-hidden="true" />
      <span>{message}</span>
      <button
        type="button"
        className={styles.noteAction}
        onClick={summary.retry}
        disabled={summary.retrying}
      >
        {summary.retrying ? 'Retrying…' : 'Retry'}
      </button>
    </p>
  );
}

// Each card's quiet placeholder while the shared note above offers the one Retry.
function Problem() {
  return (
    <div className={styles.empty}>
      <TriangleAlert size={25} aria-hidden="true" />
      <p>Unavailable right now.</p>
    </div>
  );
}

export function PlanningProgress({ wedding, daysToGo }) {
  const summary = useContext(SummaryContext);
  const data = summary.error ? null : summary.data;
  const counts = data?.counts;
  const [label, tone] = data ? scheduleLabels[data.schedule] : [];
  const metrics = counts
    ? [
        [
          ListTodo,
          counts.total,
          'Total Tasks',
          `Across ${counts.ceremonies} ${counts.ceremonies === 1 ? 'ceremony' : 'ceremonies'}`,
        ],
        [
          CircleCheck,
          counts.completed,
          'Completed',
          `${data.progress}% resolved`,
        ],
        [Clock, counts.inProgress, 'In Progress', 'Active execution'],
        [
          TriangleAlert,
          counts.overdue,
          'Overdue',
          `${counts.todo} To Do · ${
            counts.overdue
              ? `${counts.overdue} ${counts.overdue === 1 ? 'requires' : 'require'} attention`
              : 'nothing overdue'
          }`,
        ],
      ]
    : [];
  return (
    <div className={styles.progressRow}>
      <section className={styles.card} aria-busy={summary.loading}>
        <div className={styles.cardHead}>
          <div>
            <p className={styles.eyebrow}>Planning status</p>
            <h2 className="mt-1">Planning Completion</h2>
          </div>
          {label && (
            <span className={`${styles.schedule} ${styles[tone]}`}>
              {label}
            </span>
          )}
        </div>
        {summary.error ? (
          <Problem />
        ) : !data ? (
          <p className={`${styles.progressBody} text-sm`} role="status">
            Loading your task progress…
          </p>
        ) : (
          <>
            <div className={styles.progressBody}>
              <div
                className={styles.dial}
                style={{ '--progress': `${data.progress}%` }}
              >
                <span>
                  {data.progress}%<small>Done</small>
                </span>
              </div>
              <div>
                <p className={styles.progressCount}>
                  <strong>{counts.completed}</strong> of{' '}
                  {plural(counts.total, 'total task')} completed
                </p>
                <p>
                  {remainingLabel(
                    {
                      total: counts.total,
                      open: counts.todo + counts.inProgress,
                    },
                    wedding,
                    daysToGo,
                  )}
                </p>
              </div>
            </div>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label="Planning completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={data.progress}
            >
              <span style={{ width: `${data.progress}%` }} />
            </div>
          </>
        )}
      </section>
      <div className={styles.metrics}>
        {[
          [ListTodo, 'Total Tasks', '', ''],
          [CircleCheck, 'Completed', styles.tertiary, styles.tertiary],
          [Clock, 'In Progress', styles.primaryText, ''],
          [TriangleAlert, 'Overdue', styles.danger, styles.danger],
        ].map(([Icon, name, numberTone, noteTone], i) => {
          const metric = metrics[i];
          const overdueCard = i === 3 && metric;
          return (
            <div className={styles.metric} key={name}>
              <span
                className={styles.iconTile}
                style={{
                  background: ['#f3ecf0', '#f9dfb0', '#ffd5dd', '#ffdad6'][i],
                  color: ['#1d1b1e', '#261a00', '#7a5a61', '#ba1a1a'][i],
                }}
              >
                <Icon size={18} aria-hidden="true" />
              </span>
              {overdueCard ? (
                // Stitch: "2 Overdue" headline, then "6 To Do", then the attention note.
                <div>
                  <p className={styles.overdueLine}>
                    <strong className={styles.danger}>{counts.overdue}</strong>
                    <small>Overdue</small>
                  </p>
                  <p>{counts.todo} To Do</p>
                  <small className={counts.overdue ? styles.danger : ''}>
                    {counts.overdue
                      ? `${counts.overdue} ${counts.overdue === 1 ? 'requires' : 'require'} attention`
                      : 'Nothing overdue'}
                  </small>
                </div>
              ) : (
                <div>
                  <strong className={metric ? numberTone : ''}>
                    {metric ? metric[1] : '—'}
                  </strong>
                  <p>{name}</p>
                  <small className={metric ? noteTone : ''}>
                    {metric
                      ? metric[3]
                      : summary.error
                        ? 'Unavailable'
                        : 'Loading…'}
                  </small>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const priorityLabel = Object.fromEntries(taskPriorities);

// Stitch "Family Tasks": the caller's open assigned tasks (owner decision), nearest first.
// The Stitch completion checkbox is not built; each task opens in the Tasks drawer.
export function MyTasksCard() {
  const summary = useContext(SummaryContext);
  const data = summary.error ? null : summary.data;
  return (
    <section className={styles.card} aria-busy={summary.loading}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Host & family queue</p>
          <h2 className="mt-1">Family Tasks</h2>
        </div>
        {data && (
          <span className={styles.countPill}>
            {data.counts.myOpen} Active{' '}
            {data.counts.myOpen === 1 ? 'Task' : 'Tasks'}
          </span>
        )}
      </div>
      {summary.error ? (
        <Problem />
      ) : !data ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Loading your tasks…
        </p>
      ) : !data.myTasks.length ? (
        <div className={styles.empty}>
          <ListChecks size={25} aria-hidden="true" />
          <p>No open tasks are assigned to you right now.</p>
        </div>
      ) : (
        <ul className={styles.taskList}>
          {data.myTasks.map((task) => (
            <li key={task.id}>
              <Link href={`/tasks?task=${task.id}`} className={styles.taskItem}>
                <strong className={styles.taskName}>{task.title}</strong>
                <span
                  className={`${styles.priority} ${
                    ['HIGH', 'URGENT'].includes(task.priority)
                      ? styles.priorityHigh
                      : ''
                  }`}
                >
                  {['HIGH', 'URGENT'].includes(task.priority)
                    ? `${priorityLabel[task.priority]} Priority`
                    : priorityLabel[task.priority]}
                </span>
                <span className={styles.taskMeta}>
                  {task.event?.available && (
                    <span>
                      <CalendarDays size={13} aria-hidden="true" />
                      {task.event.name}
                    </span>
                  )}
                  {task.event?.available && <span aria-hidden="true">•</span>}
                  <span
                    className={`${styles.dueStrong} ${task.overdue ? styles.danger : ''}`}
                  >
                    <CalendarDays size={13} aria-hidden="true" />
                    {task.dueAt
                      ? `${task.overdue ? 'Overdue · ' : ''}Due ${dueDay(task)}`
                      : 'No deadline'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const statusLabel = Object.fromEntries(eventStatuses);

export function UpcomingCeremonies() {
  const summary = useContext(SummaryContext);
  const data = summary.error ? null : summary.data;
  const { upcoming = [], past = null } = data?.ceremonies || {};
  return (
    <section className={styles.card} aria-busy={summary.loading}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Schedule</p>
          <h2 className="mt-1">Upcoming Ceremonies</h2>
        </div>
        <Link href="/events" className={styles.viewAll}>
          View All
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {summary.error ? (
        <Problem />
      ) : !data ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Loading your ceremonies…
        </p>
      ) : !upcoming.length ? (
        <div className={styles.empty}>
          <CalendarDays size={25} aria-hidden="true" />
          <p>
            No planned or confirmed ceremonies are coming up. Add them in
            Events.
          </p>
        </div>
      ) : (
        <ul className={styles.ceremonyList}>
          {upcoming.map((ceremony, index) => (
            <li key={ceremony.id}>
              <Link
                href={`/events?event=${ceremony.id}`}
                className={styles.ceremonyItem}
              >
                <span className={styles.ceremonyTop}>
                  <span
                    className={`${styles.dateTile} ${styles[`tile${index % 3}`]}`}
                    aria-hidden="true"
                  >
                    <strong>
                      {eventDate(ceremony.startAt, { day: 'numeric' })}
                    </strong>
                    {eventDate(ceremony.startAt, { month: 'short' })}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`${styles.priority} ${
                        ceremony.status === 'CONFIRMED' ? styles.tagWarning : ''
                      }`}
                    >
                      {statusLabel[ceremony.status]}
                    </span>
                    <strong className={styles.ceremonyName}>
                      <span className="sr-only">
                        {eventDate(ceremony.startAt)} ·{' '}
                      </span>
                      {ceremony.name}
                    </strong>
                    {ceremony.description && (
                      <span className={styles.oneLine}>
                        {ceremony.description}
                      </span>
                    )}
                  </span>
                </span>
                <span className={styles.ceremonyMeta}>
                  <span>
                    <Clock3 size={16} aria-hidden="true" />
                    {eventRange(ceremony)}
                  </span>
                  <span className={styles.daysLeft}>{daysLabel(ceremony)}</span>
                  <span className={styles.venueText}>
                    <MapPin size={16} aria-hidden="true" />
                    <span>{venueLabel(ceremony.venue)}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data && past && (
        <Link href={`/events?event=${past.id}`} className={styles.pastLine}>
          <span>
            <History size={16} aria-hidden="true" />
            Past Milestone: {past.name}
          </span>
          <span>{eventDate(past.startAt)} • Completed</span>
        </Link>
      )}
    </section>
  );
}

// Stitch Attention cards: tag + status on top, title and one line of notes, then a
// footer with the owner/venue state and an action that opens the record (owner decision).
function attentionView(item) {
  const { task, event } = item;
  if (item.type === 'OVERDUE_TASK') {
    const names = task.assignees
      .filter((person) => person.available && person.name)
      .map((person) => person.name);
    return {
      tag: ['Overdue', styles.priorityHigh],
      status: [`Due ${dueDay(task)}`, styles.danger],
      footer: [
        User,
        names.length
          ? `${names.join(', ')} (${names.length > 1 ? 'Assignees' : 'Assignee'})`
          : 'Unassigned',
      ],
      href: `/tasks?task=${task.id}`,
    };
  }
  if (item.type === 'UNASSIGNED_TASK')
    return {
      tag: [`${priorityLabel[task.priority]} priority`, styles.tagWarning],
      status: ['Unassigned', styles.statusStrong],
      footer: [UserX, 'No Lead'],
      href: `/tasks?task=${task.id}`,
    };
  if (item.type === 'NO_VENUE')
    return {
      tag: ['Venue missing', styles.tagSoft],
      status: ['Action Pending', ''],
      footer: [MapPinOff, 'No Venue'],
      href: `/events?event=${event.id}`,
    };
  return {
    tag: ['Coming up', styles.tagSoft],
    status: [daysLabel(event), styles.daysLeft],
    footer: [MapPin, venueLabel(event.venue)],
    href: `/events?event=${event.id}`,
  };
}

function AttentionItem({ item }) {
  const view = attentionView(item);
  const record = item.task || item.event;
  const title = item.task ? item.task.title : item.event.name;
  const Icon = view.footer[0];
  return (
    <div className={styles.attentionItem}>
      <div>
        <div className={styles.attentionTop}>
          <span className={`${styles.priority} ${styles.upper} ${view.tag[1]}`}>
            {view.tag[0]}
          </span>
          <span className={`${styles.attentionStatus} ${view.status[1]}`}>
            {view.status[0]}
          </span>
        </div>
        <h3>{title}</h3>
        {record.description && (
          <p className={styles.oneLine}>{record.description}</p>
        )}
      </div>
      <div className={styles.attentionFooter}>
        <span>
          <Icon size={14} aria-hidden="true" />
          {view.footer[1]}
        </span>
        <Link href={view.href} aria-label={`Review ${title}`}>
          Review
        </Link>
      </div>
    </div>
  );
}

export function AttentionCard() {
  const summary = useContext(SummaryContext);
  const data = summary.error ? null : summary.data;
  const attention = data?.attention;
  return (
    <section className={styles.card} aria-busy={summary.loading}>
      <div className={styles.attentionHeader}>
        <div className={styles.attentionHeading}>
          <span className={styles.alertTile} aria-hidden="true">
            !
          </span>
          <div>
            <h2>Attention Required</h2>
            <p>Overdue work, missing details and ceremonies coming up</p>
          </div>
        </div>
        {!!attention?.total && (
          <span className={`${styles.countPill} ${styles.priorityHigh}`}>
            {attention.total} Urgent {attention.total === 1 ? 'Flag' : 'Flags'}
          </span>
        )}
      </div>
      {summary.error ? (
        <Problem />
      ) : !attention ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Checking what needs attention…
        </p>
      ) : !attention.items.length ? (
        <div className={styles.empty}>
          <CircleCheck size={25} aria-hidden="true" />
          <p>All clear. Nothing needs attention right now.</p>
        </div>
      ) : (
        <>
          <ul className={styles.attentionGrid}>
            {attention.items.map((item) => (
              <li key={`${item.type}:${item.task?.id || item.event.id}`}>
                <AttentionItem item={item} />
              </li>
            ))}
          </ul>
          {attention.total > attention.items.length && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing the {attention.items.length} most important of{' '}
              {attention.total}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
