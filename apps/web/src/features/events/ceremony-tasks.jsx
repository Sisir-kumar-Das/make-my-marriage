'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Clock3, Plus, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { ceremonyTasksUrl } from '@/features/tasks/navigation';
import styles from './events.module.css';

export function CeremonyTasks({
  weddingId,
  event,
  canEdit,
  disabled,
  onNavigate,
}) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const eventId = event?.id;
  const key = `${weddingId}:${eventId || ''}:${revision}`;
  const current = result?.key === key ? result : null;
  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    void apiRequest(`/weddings/${weddingId}/tasks?eventId=${eventId}&limit=3`, {
      signal: controller.signal,
      timeoutMs: 15000,
    })
      .then((response) => {
        if (!controller.signal.aborted) setResult({ key, response });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ key, error: error.message });
      });
    return () => controller.abort();
  }, [weddingId, eventId, key]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'hidden')
        setRevision((value) => value + 1);
    };
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, []);
  const tasks = current?.response?.data.tasks;
  const total = current?.response?.meta.total;
  return (
    <section className={styles.formSection} aria-label="Ceremony linked tasks">
      <div className={styles.linkedTaskHeading}>
        <h3>Linked Tasks{total !== undefined ? ` (${total})` : ''}</h3>
        <div className={styles.actions}>
          {event && (
            <button
              type="button"
              className={styles.linkButton}
              disabled={disabled}
              onClick={() => onNavigate(ceremonyTasksUrl(event.id))}
            >
              Manage Tasks
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className={styles.secondary}
              disabled={!event || disabled}
              onClick={() =>
                onNavigate(ceremonyTasksUrl(event.id, { create: true }))
              }
            >
              <Plus size={14} /> Add Task
            </button>
          )}
        </div>
      </div>
      {!event ? (
        <p className={styles.hint}>
          Save this ceremony first, then add tasks linked to it.
        </p>
      ) : (
        <>
          {!current && (
            <p role="status" className={styles.hint}>
              Loading linked tasks…
            </p>
          )}
          {current?.error && (
            <div role="alert" className={styles.inlineError}>
              <p>{current.error}</p>
              <button
                type="button"
                className={styles.secondary}
                disabled={disabled}
                onClick={() => setRevision((value) => value + 1)}
              >
                <RefreshCw size={14} /> Retry linked tasks
              </button>
            </div>
          )}
          {tasks?.length === 0 && (
            <p className={styles.hint}>
              No tasks linked yet. Wedding-wide tasks stay in Tasks.
            </p>
          )}
          {!!tasks?.length && (
            <div className={styles.linkedTaskPills}>
              {tasks.map((task) => {
                const Icon =
                  task.status === 'COMPLETED'
                    ? CheckCircle2
                    : task.status === 'IN_PROGRESS'
                      ? Clock3
                      : Circle;
                return (
                  <button
                    key={task.id}
                    type="button"
                    className={styles.linkedTaskPill}
                    disabled={disabled}
                    onClick={() =>
                      onNavigate(
                        ceremonyTasksUrl(event.id, { taskId: task.id }),
                      )
                    }
                  >
                    <Icon size={14} aria-hidden="true" />
                    <span>{task.title}</span>
                    <small>
                      {task.status === 'COMPLETED'
                        ? 'Completed'
                        : task.status === 'IN_PROGRESS'
                          ? 'In Progress'
                          : 'To Do'}
                    </small>
                  </button>
                );
              })}
              {total > tasks.length && (
                <button
                  type="button"
                  className={styles.linkedTaskPill}
                  disabled={disabled}
                  onClick={() => onNavigate(ceremonyTasksUrl(event.id))}
                >
                  +{total - tasks.length} more
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
