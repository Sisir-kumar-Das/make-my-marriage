'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ClipboardList, RotateCcw, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useSession } from '@/features/auth/session-provider';
import { AssigneeNames } from '@/features/tasks/task-assignees';
import {
  dueLabel,
  taskStatuses,
  taskPriorities,
} from '@/features/tasks/form-data';
import layout from '@/features/dashboard/workspace-ui.module.css';
import styles from './recovery.module.css';
const removedAt = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
export function TaskRecovery() {
  const { user, wedding, membership, connectionError, retrySession } =
    useSession();
  const allowed = ['ADMIN', 'FAMILY_MEMBER'].includes(membership.role);
  const scope = `${wedding.id}/${user.id}/${membership.role}`;
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [result, setResult] = useState(null),
    [action, setAction] = useState(null),
    [notice, setNotice] = useState(null);
  const lock = useRef(false),
    attempts = useRef(new Map()),
    noticeRef = useRef(null);
  const requestKey = `${scope}/${page}/${revision}`;
  const current = result?.key === requestKey ? result : null;
  const rows = current?.response?.data.tasks || [],
    meta = current?.response?.meta;
  const loading = allowed && !current;
  const currentNotice = notice?.scope === scope ? notice : null;
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    void apiRequest(
      `/weddings/${wedding.id}/tasks/deleted?page=${page}&limit=20`,
      { signal: controller.signal, timeoutMs: 15000 },
    )
      .then((response) => {
        if (!controller.signal.aborted)
          setResult({ key: requestKey, response });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ key: requestKey, error: error.message });
      });
    return () => controller.abort();
  }, [allowed, wedding.id, page, requestKey]);
  useEffect(() => {
    if (currentNotice) {
      noticeRef.current?.focus({ preventScroll: true });
      noticeRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [currentNotice]);
  function reload() {
    if (lock.current) return;
    setAction(null);
    setRevision((v) => v + 1);
  }
  async function restore(task) {
    if (lock.current || !allowed || connectionError) return;
    lock.current = true;
    const identity = `${scope}/${task.id}/${task.version}`;
    if (!attempts.current.has(identity))
      attempts.current.set(identity, crypto.randomUUID());
    setAction({ id: task.id, pending: true });
    setNotice(null);
    try {
      const response = await apiRequest(
        `/weddings/${wedding.id}/tasks/${task.id}/restore`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': attempts.current.get(identity),
            'If-Match': `"${task.version}"`,
          },
          body: '{}',
          timeoutMs: 20000,
        },
      );
      if (response.data.task.deletedAt) {
        setAction({
          id: task.id,
          conflict: true,
          error:
            'Your earlier restoration was confirmed, but this task was removed again afterward. Refresh and review its current state before restoring again.',
        });
      } else {
        setNotice({
          scope,
          task: response.data.task,
          warnings: response.data.warnings,
          replayed: response.data.replayed,
        });
        setAction(null);
        setRevision((v) => v + 1);
      }
    } catch (error) {
      setAction({
        id: task.id,
        error: error.message,
        conflict: [
          'VERSION_CONFLICT',
          'IDEMPOTENCY_CONFLICT',
          'TASK_STATE_CHANGED',
          'TASK_NOT_FOUND',
          'FORBIDDEN',
        ].includes(error.code),
      });
    } finally {
      lock.current = false;
    }
  }
  return (
    <section className={layout.card} aria-label="Removed tasks">
      <div className={layout.row}>
        <h2>Recently Removed Tasks {meta ? `(${meta.total})` : ''}</h2>
        {allowed && (
          <button
            type="button"
            className={styles.button}
            disabled={loading || action?.pending || !!connectionError}
            onClick={reload}
          >
            <RefreshCw size={15} /> Refresh tasks
          </button>
        )}
      </div>
      <p className={styles.subtle}>
        {membership.role === 'ADMIN'
          ? 'Admins can restore any task in this wedding.'
          : membership.role === 'FAMILY_MEMBER'
            ? 'You can view and restore removed tasks you originally created. Ask an Admin to restore tasks created by others.'
            : 'Task recovery is available to Admins and Family Members for their own created tasks. Viewers remain read-only.'}
      </p>
      {!allowed ? (
        <Link href="/tasks" className={styles.button}>
          Back to Tasks
        </Link>
      ) : (
        <>
          {connectionError && membership.role !== 'ADMIN' && (
            <div role="alert" className={styles.error}>
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
          {currentNotice && (
            <section
              ref={noticeRef}
              tabIndex={-1}
              className={styles.notice}
              aria-label="Restored task"
            >
              <p role="status">
                <strong>{currentNotice.task.title}</strong>{' '}
                {currentNotice.replayed
                  ? 'restoration confirmed.'
                  : 'was restored.'}
              </p>
              {currentNotice.warnings?.map((w) => (
                <p key={w.code}>{w.message}</p>
              ))}
              {(currentNotice.task.event?.available === false ||
                currentNotice.task.assignees.some((m) => !m.available)) && (
                <p>
                  Some saved members or the linked ceremony are unavailable.
                  Their references and your task details are retained; review
                  them when editing.
                </p>
              )}
              <Link href="/tasks" className={styles.button}>
                View Tasks
              </Link>
            </section>
          )}
          {loading && <p role="status">Loading removed tasks…</p>}
          {current?.error && (
            <div role="alert" className={styles.error}>
              <p>{current.error}</p>
              <button
                type="button"
                className={styles.button}
                disabled={action?.pending || !!connectionError}
                onClick={reload}
              >
                Retry loading tasks
              </button>
            </div>
          )}
          {current?.response && !rows.length && (
            <p className={styles.empty}>
              No removed tasks{' '}
              {membership.role === 'FAMILY_MEMBER'
                ? 'created by you'
                : 'in this wedding'}
              . Recoverable tasks will appear here.
            </p>
          )}
          <div className={styles.rows}>
            {rows.map((task) => (
              <article key={task.id} className={styles.row}>
                <ClipboardList size={22} aria-hidden="true" />
                <div className={styles.details}>
                  <h3>
                    {task.title} <span className={styles.tag}>Task</span>
                  </h3>
                  <p>
                    Removed {removedAt(task.deletedAt)} IST by{' '}
                    {task.deletedByName}
                  </p>
                  <p>
                    {dueLabel(task)} ·{' '}
                    {taskStatuses.find(([k]) => k === task.status)?.[1]} ·{' '}
                    {taskPriorities.find(([k]) => k === task.priority)?.[1]}{' '}
                    priority
                  </p>
                  <AssigneeNames assignees={task.assignees} />
                  {task.event && (
                    <p>
                      {task.event.available
                        ? task.event.name
                        : 'Unavailable ceremony · Link retained'}
                    </p>
                  )}
                  {task.seriesId && (
                    <p>
                      Recurring copy · {task.occurrenceDate} · Restoring keeps
                      this copy’s saved details; other repeats are unchanged.
                    </p>
                  )}
                  {task.description && (
                    <details>
                      <summary>Saved notes</summary>
                      <p className={styles.notes}>{task.description}</p>
                    </details>
                  )}
                  {action?.id === task.id && action.error && (
                    <div className={styles.error} role="alert">
                      <p>{action.error}</p>
                      {action.conflict ? (
                        <button
                          type="button"
                          className={styles.button}
                          disabled={!!connectionError}
                          onClick={reload}
                        >
                          Refresh removed tasks
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
                    (action?.id === task.id && action.conflict)
                  }
                  onClick={() => void restore(task)}
                  aria-label={`${action?.id === task.id && action.error ? 'Retry restore task' : 'Restore task'}: ${task.title}`}
                >
                  <RotateCcw size={16} />
                  {action?.id === task.id && action.pending
                    ? 'Restoring…'
                    : action?.id === task.id && action.error
                      ? 'Retry Restore'
                      : 'Restore Task'}
                </button>
              </article>
            ))}
          </div>
          {meta && (
            <nav className={styles.pagination} aria-label="Removed task pages">
              <span>
                {meta.total} removed {meta.total === 1 ? 'task' : 'tasks'} ·
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
        </>
      )}
    </section>
  );
}
