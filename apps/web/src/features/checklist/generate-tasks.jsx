'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Dialog } from 'radix-ui';
import { AlertTriangle, Check, Plus, X } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useSession } from '@/features/auth/session-provider';
import styles from './checklist.module.css';

const dateLabel = (value) =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
      }).format(new Date(value))
    : 'No deadline';
const priorities = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  URGENT: 'Urgent',
};

export function GenerateTasks({ template, onGenerated }) {
  const { wedding, membership, connectionError, retrySession } = useSession();
  const canGenerate = ['ADMIN', 'FAMILY_MEMBER'].includes(membership.role);
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const attempt = useRef(null),
    lock = useRef(false),
    cancel = useRef(null),
    failureNotice = useRef(null),
    connectionNotice = useRef(null),
    mounted = useRef(true);
  const key = `${template.id}/${template.version}/${revision}`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!open || !canGenerate || connectionError || attempt.current) return;
    const controller = new AbortController();
    let active = true;
    const query = new URLSearchParams({
      templateId: template.id,
      templateVersion: template.version,
    });
    void apiRequest(`/weddings/${wedding.id}/checklists/preview?${query}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (active) setResult({ key, data: response.data });
      })
      .catch((error) => {
        if (active) setResult({ key, error: error.message, code: error.code });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    open,
    canGenerate,
    connectionError,
    wedding.id,
    template.id,
    template.version,
    key,
  ]);
  useEffect(() => {
    if (failure) {
      failureNotice.current?.focus({ preventScroll: true });
      failureNotice.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [failure]);
  useEffect(() => {
    if (open && connectionError) {
      connectionNotice.current?.focus({ preventScroll: true });
      connectionNotice.current?.scrollIntoView({ block: 'start' });
    }
  }, [open, connectionError]);
  function changeOpen(next) {
    if (lock.current) return;
    if (next && !attempt.current) {
      setOutcome(null);
      setFailure(null);
      setRevision((value) => value + 1);
    }
    setOpen(next);
  }
  function reviewAgain() {
    if (lock.current) return;
    attempt.current = null;
    setFailure(null);
    setRevision((value) => value + 1);
  }
  const preview = result?.key === key ? result.data : null;
  const loading = result?.key !== key;
  async function generate() {
    if (
      lock.current ||
      !canGenerate ||
      connectionError ||
      !preview ||
      outcome ||
      failure?.review ||
      failure?.reload
    )
      return;
    if (!attempt.current)
      attempt.current = {
        key: crypto.randomUUID(),
        body: JSON.stringify({
          templateId: template.id,
          templateVersion: template.version,
          previewHash: preview.previewHash,
        }),
      };
    lock.current = true;
    setPending(true);
    setFailure(null);
    try {
      const response = await apiRequest(
        `/weddings/${wedding.id}/checklists/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': attempt.current.key,
          },
          body: attempt.current.body,
          timeoutMs: 20000,
        },
      );
      if (mounted.current) {
        attempt.current = null;
        setOutcome(response.data);
        onGenerated?.();
      }
    } catch (error) {
      if (mounted.current)
        setFailure({
          message: error.message,
          review: [
            'CHECKLIST_PREVIEW_CHANGED',
            'IDEMPOTENCY_CONFLICT',
          ].includes(error.code),
          reload: ['TEMPLATE_VERSION_CHANGED', 'TEMPLATE_NOT_FOUND'].includes(
            error.code,
          ),
        });
    } finally {
      lock.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return (
    <div className={styles.generation}>
      <h3>Add these tasks to your plan</h3>
      <p>
        Review the dates and existing items before adding this pack. Existing
        edits and completed tasks are kept; removed items stay deleted.
      </p>
      {!canGenerate && (
        <p>
          Only an Admin or Family Member can generate tasks. You can explore
          every pack as a Viewer.
        </p>
      )}
      <Dialog.Root open={open} onOpenChange={changeOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            className={styles.primary}
            disabled={!canGenerate || !!connectionError}
          >
            <Plus size={16} /> Generate Tasks
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.confirmOverlay} />
          <Dialog.Content
            className={styles.confirmDialog}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              cancel.current?.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (lock.current) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (lock.current) event.preventDefault();
            }}
          >
            <header className={styles.confirmHeader}>
              <div>
                <Dialog.Title>
                  {outcome
                    ? 'Generation confirmed'
                    : 'Review checklist generation'}
                </Dialog.Title>
                <Dialog.Description>
                  {template.name} ·{' '}
                  {outcome
                    ? 'Your generation result'
                    : 'Confirm before adding tasks to your wedding plan.'}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close generation review"
                  disabled={pending}
                >
                  <X size={20} />
                </button>
              </Dialog.Close>
            </header>
            <div className={styles.confirmBody}>
              {connectionError && (
                <section
                  ref={connectionNotice}
                  tabIndex={-1}
                  role="alert"
                  className={styles.error}
                >
                  <strong>We could not check your session.</strong>
                  <p>
                    Your generation attempt is kept in this tab. Reconnect
                    before continuing.
                  </p>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={retrySession}
                  >
                    Retry session check
                  </button>
                </section>
              )}
              {!canGenerate && (
                <p role="alert">Your current role cannot generate tasks.</p>
              )}
              {failure && (
                <section
                  ref={failureNotice}
                  tabIndex={-1}
                  role="alert"
                  className={styles.error}
                >
                  <p>{failure.message}</p>
                  {failure.review ? (
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={pending || !!connectionError}
                      onClick={reviewAgain}
                    >
                      Review latest preview
                    </button>
                  ) : failure.reload ? (
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => window.location.reload()}
                    >
                      Reload catalog
                    </button>
                  ) : (
                    <p>
                      The outcome may be unconfirmed. Retry generation to check
                      the same request safely.
                    </p>
                  )}
                </section>
              )}
              {outcome ? (
                <section className={styles.generationSuccess} role="status">
                  <Check size={24} />
                  <h3>
                    {outcome.replayed
                      ? 'Your earlier generation was confirmed.'
                      : 'Your checklist generation is complete.'}
                  </h3>
                  <p>
                    {outcome.generation.added}{' '}
                    {outcome.generation.added === 1 ? 'task' : 'tasks'} added ·{' '}
                    {outcome.generation.kept} existing{' '}
                    {outcome.generation.kept === 1 ? 'task' : 'tasks'} kept ·{' '}
                    {outcome.generation.deleted} deleted{' '}
                    {outcome.generation.deleted === 1 ? 'item' : 'items'}{' '}
                    skipped.
                  </p>
                  {outcome.replayed && (
                    <p>
                      These are the recorded results of your earlier request.
                      Subsequent task edits and removals remain in place.
                    </p>
                  )}
                  <p>
                    Open Tasks to assign, edit or complete your planning items.
                  </p>
                </section>
              ) : loading ? (
                <p role="status">Checking your wedding plan…</p>
              ) : result?.error ? (
                <section role="alert" className={styles.error}>
                  <p>{result.error}</p>
                  {result.code === 'TEMPLATE_VERSION_CHANGED' ? (
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => window.location.reload()}
                    >
                      Reload catalog
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={!!connectionError}
                      onClick={reviewAgain}
                    >
                      Retry preview
                    </button>
                  )}
                </section>
              ) : (
                preview && (
                  <>
                    <p>
                      Wedding date:{' '}
                      <strong>
                        {dateLabel(preview.weddingDate + 'T12:00:00+05:30')}
                      </strong>
                      . New tasks use date-only deadlines at the end of the day
                      in India.
                    </p>
                    <div
                      className={styles.generationCounts}
                      aria-label="Generation preview counts"
                    >
                      {[
                        [preview.counts.toAdd, 'To add'],
                        [preview.counts.kept, 'Existing · kept'],
                        [preview.counts.deleted, 'Deleted · skipped'],
                      ].map(([count, label]) => (
                        <div key={label}>
                          <strong>{count}</strong>
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                    {preview.counts.pastDue > 0 && (
                      <section className={styles.generationWarning} role="note">
                        <AlertTriangle size={22} />
                        <div>
                          <strong>
                            {preview.counts.pastDue} new{' '}
                            {preview.counts.pastDue === 1
                              ? 'task has'
                              : 'tasks have'}{' '}
                            a past-due deadline.
                          </strong>
                          <p>
                            Check these dates before confirming. You can still
                            add this pack and edit its deadlines in Tasks
                            afterward.
                          </p>
                        </div>
                      </section>
                    )}
                    <ol
                      className={styles.items}
                      aria-label="Tasks in this generation"
                    >
                      {preview.items.map((item, index) => (
                        <li key={item.itemKey}>
                          <span
                            className={styles.itemNumber}
                            aria-hidden="true"
                          >
                            {index + 1}
                          </span>
                          <div>
                            <h3>{item.title}</h3>
                            <p>
                              {item.disposition === 'ADD'
                                ? `${priorities[item.priority]} priority · ${dateLabel(item.dueAt)}`
                                : item.disposition === 'KEPT'
                                  ? item.retainedByRepeat
                                    ? 'Kept with its repeat pattern'
                                    : `Existing task kept · ${dateLabel(item.dueAt)}`
                                  : 'Previously deleted template item · Skipped'}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <p className={styles.timingNote}>
                      New tasks start as To Do, unassigned and wedding-wide.
                      Existing tasks keep their current details, assignments and
                      completion.
                    </p>
                  </>
                )
              )}
            </div>
            <footer className={styles.confirmFooter}>
              <Dialog.Close asChild>
                <button
                  ref={cancel}
                  type="button"
                  className={styles.secondary}
                  disabled={pending}
                >
                  {outcome
                    ? 'Back to catalog'
                    : failure && !failure.review && !failure.reload
                      ? 'Close review'
                      : 'Cancel'}
                </button>
              </Dialog.Close>
              {outcome ? (
                <Link className={styles.primary} href="/tasks">
                  View Tasks
                </Link>
              ) : (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={
                    pending ||
                    !preview ||
                    !!connectionError ||
                    !canGenerate ||
                    failure?.review ||
                    failure?.reload
                  }
                  onClick={() => void generate()}
                >
                  {pending
                    ? 'Generating…'
                    : failure && !failure.review && !failure.reload
                      ? 'Retry generation'
                      : 'Confirm generation'}
                </button>
              )}
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
