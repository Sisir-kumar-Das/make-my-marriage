'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { consumeTaskIntent, readTaskNavigation } from './navigation';
import styles from './tasks.module.css';

export function TaskShortcut({
  weddingId,
  navigation,
  eventId,
  canEdit,
  onReady,
}) {
  const { create, taskId, fromEvent } = navigation;
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    const current = () => {
      const params = new URLSearchParams(window.location.search);
      const intent = readTaskNavigation(params);
      return (
        !controller.signal.aborted &&
        window.location.pathname === '/tasks' &&
        intent.create === create &&
        intent.taskId === taskId &&
        intent.fromEvent === fromEvent &&
        (params.get('eventId') || '') === eventId
      );
    };
    async function load() {
      if (!create) {
        const response = await apiRequest(
          `/weddings/${weddingId}/tasks/${taskId}`,
          { signal: controller.signal },
        );
        return { task: response.data.task };
      }
      if (!canEdit)
        throw new Error(
          'Viewer access is read-only. Ask an Admin or Family Member to create this task.',
        );
      const selectedEvent = fromEvent || (eventId !== 'none' && eventId);
      let initialCeremony;
      if (selectedEvent) {
        const response = await apiRequest(
          `/weddings/${weddingId}/events/${selectedEvent}`,
          { signal: controller.signal },
        );
        initialCeremony = response.data.event;
      }
      return { task: null, initialCeremony };
    }
    void load()
      .then((editor) => {
        if (current()) onReady(editor);
      })
      .catch((error) => {
        if (current()) setFailure({ attempt, message: error.message });
      });
    return () => controller.abort();
  }, [
    weddingId,
    create,
    taskId,
    fromEvent,
    eventId,
    canEdit,
    onReady,
    attempt,
  ]);
  if (failure?.attempt === attempt)
    return (
      <section role="alert" className={styles.error}>
        <p>{failure.message}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry shortcut
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() =>
              window.history.replaceState(
                null,
                '',
                consumeTaskIntent(window.location.href),
              )
            }
          >
            Dismiss shortcut
          </button>
        </div>
      </section>
    );
  return (
    <p role="status">
      {create ? 'Opening task creation…' : 'Loading task details…'}
    </p>
  );
}
