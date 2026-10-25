'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CalendarX2, RotateCcw, ShieldCheck, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useSession } from '@/features/auth/session-provider';
import {
  PageHeader,
  SettingsTabs,
  ComingSoon,
  FutureButton,
} from '@/features/dashboard/workspace-ui';
import { eventDate, eventRange } from '@/features/events/form-data';
import layout from '@/features/dashboard/workspace-ui.module.css';
import styles from './recovery.module.css';

const removedAt = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
export function EventRecovery() {
  const { wedding, membership, connectionError, retrySession } = useSession();
  const admin = membership.role === 'ADMIN';
  const [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null),
    [action, setAction] = useState(null),
    [notice, setNotice] = useState(null);
  const lock = useRef(false),
    noticeRef = useRef(null);
  const requestKey = `${wedding.id}/${page}/${retry}`;
  const current = result?.key === requestKey ? result : null;
  const loading = admin && !current;
  const rows = current?.response?.data.events || [];
  const meta = current?.response?.meta;
  useEffect(() => {
    if (!admin) return;
    const controller = new AbortController();
    apiRequest(`/weddings/${wedding.id}/events/deleted?page=${page}&limit=20`, {
      signal: controller.signal,
      timeoutMs: 15000,
    })
      .then((response) => {
        if (!controller.signal.aborted)
          setResult({ key: requestKey, response });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ key: requestKey, error: error.message });
      });
    return () => controller.abort();
  }, [admin, wedding.id, page, requestKey]);
  useEffect(() => {
    if (notice) {
      noticeRef.current?.focus({ preventScroll: true });
      noticeRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [notice]);
  function reload() {
    if (lock.current) return;
    setAction(null);
    setRetry((value) => value + 1);
  }
  async function restore(event) {
    if (lock.current || !admin || connectionError) return;
    lock.current = true;
    const attempt =
      action?.event.id === event.id
        ? action
        : { event, key: crypto.randomUUID() };
    setAction({ ...attempt, pending: true, error: '', conflict: false });
    setNotice(null);
    try {
      const response = await apiRequest(
        `/weddings/${wedding.id}/events/${attempt.event.id}/restore`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': attempt.key,
            'If-Match': `"${attempt.event.version}"`,
          },
          body: '{}',
          timeoutMs: 20000,
        },
      );
      if (response.data.event.deletedAt) {
        setAction({
          ...attempt,
          pending: false,
          conflict: true,
          error:
            'Your earlier restoration was confirmed, but this ceremony was removed again afterward. Refresh and review its current state before restoring again.',
        });
      } else {
        setNotice({
          name: response.data.event.name,
          warnings: response.data.warnings,
          replayed: response.data.replayed,
        });
        setAction(null);
        setRetry((value) => value + 1);
      }
    } catch (error) {
      setAction({
        ...attempt,
        pending: false,
        error: error.message,
        conflict: [
          'VERSION_CONFLICT',
          'IDEMPOTENCY_CONFLICT',
          'EVENT_STATE_CHANGED',
        ].includes(error.code),
      });
    } finally {
      lock.current = false;
    }
  }
  return (
    <div className={layout.stack}>
      <PageHeader
        eyebrow="Settings › Workspace & Account"
        title="Data Recovery Tray"
        description="Restore removed ceremonies with their activities and history preserved."
      />
      <SettingsTabs active="/recovery" />
      <section className={`${layout.card} ${styles.reassurance}`}>
        <ShieldCheck size={28} aria-hidden="true" />
        <div>
          <div className={layout.row}>
            <h2>Data Recovery Tray</h2>
            <span className={styles.admin}>Admin Exclusive</span>
          </div>
          <p>
            Restored events return to the ceremony schedule with their saved
            details and activities.
          </p>
          <p className={styles.subtle}>
            Events remain recoverable while the wedding exists. The separate
            seven-day wedding recovery feature is coming soon.
          </p>
        </div>
      </section>
      {!admin ? (
        <section className={layout.card}>
          <h2>Admin access required</h2>
          <p>
            Only a wedding Admin can view removed events or restore them. Your
            normal planning access is unchanged.
          </p>
          <Link href="/events" className={styles.button}>
            Back to Events
          </Link>
        </section>
      ) : (
        <>
          {connectionError && (
            <div className={styles.error} role="alert">
              <p>{connectionError}</p>
              <button
                type="button"
                className={styles.button}
                disabled={action?.pending}
                onClick={retrySession}
              >
                Retry session check
              </button>
            </div>
          )}
          {notice && (
            <section
              ref={noticeRef}
              tabIndex={-1}
              className={styles.notice}
              aria-label="Restored event"
            >
              <p role="status">
                <strong>{notice.name}</strong>{' '}
                {notice.replayed ? 'restoration confirmed.' : 'was restored.'}
              </p>
              {notice.warnings?.map((warning) => (
                <p key={warning.code}>{warning.message}</p>
              ))}
              <Link href="/events" className={styles.button}>
                View Events
              </Link>
            </section>
          )}
          <section className={layout.card} aria-label="Removed events">
            <div className={layout.row}>
              <h2>Recently Removed Events {meta ? `(${meta.total})` : ''}</h2>
              <button
                className={styles.button}
                type="button"
                disabled={loading || action?.pending || !!connectionError}
                onClick={reload}
              >
                <RefreshCw size={15} /> Refresh
              </button>
            </div>
            {loading && <p role="status">Loading removed ceremonies…</p>}
            {current?.error && (
              <div role="alert" className={styles.error}>
                <p>{current.error}</p>
                <button
                  type="button"
                  className={styles.button}
                  disabled={action?.pending || !!connectionError}
                  onClick={reload}
                >
                  Retry loading events
                </button>
              </div>
            )}
            {current?.response && rows.length === 0 && (
              <p className={styles.empty}>
                No removed ceremonies. Events you remove will appear here.
              </p>
            )}
            <div className={styles.rows}>
              {rows.map((event) => (
                <article key={event.id} className={styles.row}>
                  <CalendarX2 size={22} aria-hidden="true" />
                  <div className={styles.details}>
                    <h3>
                      {event.name} <span className={styles.tag}>Event</span>
                    </h3>
                    <p>
                      {eventDate(event.startAt)} · {eventRange(event)} · IST
                    </p>
                    <p>
                      Removed {removedAt(event.deletedAt)} IST by{' '}
                      {event.deletedByName} · {event.activityCount}{' '}
                      {event.activityCount === 1 ? 'activity' : 'activities'}{' '}
                      retained
                    </p>
                    {action?.event.id === event.id && action.error && (
                      <div className={styles.error} role="alert">
                        <p>{action.error}</p>
                        {action.conflict ? (
                          <button
                            className={styles.button}
                            type="button"
                            disabled={!!connectionError}
                            onClick={reload}
                          >
                            Refresh removed events
                          </button>
                        ) : (
                          <p>
                            Retry the same restoration to confirm an interrupted
                            save.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={
                      action?.pending ||
                      !!connectionError ||
                      (action?.event.id === event.id && action.conflict)
                    }
                    onClick={() => restore(event)}
                    aria-label={`${action?.event.id === event.id && action.error ? 'Retry restore' : 'Restore event'}: ${event.name}`}
                  >
                    <RotateCcw size={16} />
                    {action?.event.id === event.id && action.pending
                      ? 'Restoring…'
                      : action?.event.id === event.id && action.error
                        ? 'Retry Restore'
                        : 'Restore Event'}
                  </button>
                </article>
              ))}
            </div>
            {meta && (
              <nav
                className={styles.pagination}
                aria-label="Removed event pages"
              >
                <span>
                  {meta.total} removed {meta.total === 1 ? 'event' : 'events'} ·
                  Page {meta.page} of {Math.max(1, meta.totalPages)}
                </span>
                <button
                  type="button"
                  className={styles.button}
                  disabled={
                    meta.page <= 1 || action?.pending || !!connectionError
                  }
                  onClick={() => {
                    setPage(meta.page - 1);
                    setAction(null);
                  }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className={styles.button}
                  disabled={
                    meta.page >= meta.totalPages ||
                    action?.pending ||
                    !!connectionError
                  }
                  onClick={() => {
                    setPage(meta.page + 1);
                    setAction(null);
                  }}
                >
                  Next
                </button>
              </nav>
            )}
          </section>
        </>
      )}
      <section className={layout.card}>
        <div className={layout.row}>
          <h2>Task Recovery</h2>
          <ComingSoon />
        </div>
        <p>Removed-task restoration will be connected when Tasks is built.</p>
        <FutureButton>Restore Task</FutureButton>
      </section>
      <section className={layout.card}>
        <div className={layout.row}>
          <h2>Wedding Workspace Lifecycle</h2>
          <ComingSoon />
        </div>
        <p>
          Whole-wedding deletion, its seven-day recovery period and permanent
          removal controls are coming soon.
        </p>
        <FutureButton>Delete Wedding Workspace</FutureButton>
      </section>
    </div>
  );
}
