'use client';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useSession } from '@/features/auth/session-provider';
import { Field } from './task-editor';
import { TaskAssignees } from './task-assignees';
import { RepeatControls } from './repeat-controls';
import { repeatInput, seriesFormSchema } from './recurrence-data';
import { useTaskChoices } from './use-task-choices';
import { taskPriorities } from './form-data';
import { DiscardChangesDialog } from './discard-changes-dialog';
import styles from './tasks.module.css';

export function TaskSeriesEditor({
  wedding,
  task,
  onClose,
  onSaved,
  onReturnFocus,
}) {
  const [retry, setRetry] = useState(0),
    [state, setState] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void apiRequest(`/weddings/${wedding.id}/tasks/${task.id}/series`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (active) setState({ key: retry, data: response.data });
      })
      .catch((error) => {
        if (active) setState({ key: retry, error: error.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [wedding.id, task.id, retry]);
  const data = state?.key === retry ? state.data : null;
  if (!data)
    return (
      <Dialog.Root
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content
            className={styles.drawer}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              onReturnFocus();
            }}
          >
            <header className={styles.drawerHeader}>
              <div>
                <Dialog.Title>Edit future repeats</Dialog.Title>
                <Dialog.Description>
                  Load the current pattern before making changes.
                </Dialog.Description>
              </div>
              <button
                type="button"
                aria-label="Close repeat settings"
                onClick={onClose}
              >
                <X size={20} />
              </button>
            </header>
            <div className={styles.drawerBody}>
              {state?.key === retry && state.error ? (
                <>
                  <p role="alert" className={styles.error}>
                    {state.error}
                  </p>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => setRetry((v) => v + 1)}
                  >
                    Retry repeat settings
                  </button>
                </>
              ) : (
                <p role="status">Loading repeat settings…</p>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  return (
    <SeriesForm
      key={`${data.series.id}:${data.series.version}:${retry}`}
      data={data}
      wedding={wedding}
      task={task}
      onClose={onClose}
      onSaved={onSaved}
      onReturnFocus={onReturnFocus}
      onReload={() => setRetry((v) => v + 1)}
    />
  );
}
function SeriesForm({
  data,
  wedding,
  task,
  onClose,
  onSaved,
  onReturnFocus,
  onReload,
}) {
  const { user, connectionError, retrySession, membership } = useSession();
  const canEdit = ['ADMIN', 'FAMILY_MEMBER'].includes(membership.role);
  const { series, effectiveFrom } = data;
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(seriesFormSchema),
    defaultValues: {
      title: series.template.title,
      description: series.template.description,
      priority: series.template.priority,
      assigneeIds: series.template.assigneeIds,
      eventId: series.template.eventId || '',
      dueTime: series.recurrence.time || '',
      repeatEnabled: series.active,
      repeatFrequency: series.recurrence.frequency,
      repeatInterval: series.recurrence.interval,
      repeatStartDate: series.recurrence.startDate,
      repeatEndDate: series.recurrence.endDate,
    },
  });
  const values = useWatch({ control });
  const [pending, setPending] = useState(false),
    [discard, setDiscard] = useState(false),
    [failure, setFailure] = useState(''),
    [conflict, setConflict] = useState(false),
    [unavailable, setUnavailable] = useState([]);
  const lock = useRef(false),
    attempt = useRef(null),
    errorTarget = useRef(null),
    connectionNotice = useRef(null);
  const events = useTaskChoices(wedding.id, 'events');
  useEffect(() => {
    if (failure) {
      errorTarget.current?.focus();
      errorTarget.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [failure]);
  useEffect(() => {
    if (connectionError) {
      connectionNotice.current?.focus({ preventScroll: true });
      connectionNotice.current?.scrollIntoView({ block: 'start' });
    }
  }, [connectionError]);
  useEffect(() => {
    if (!isDirty) return;
    const guard = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [isDirty]);
  function close() {
    if (lock.current || discard) return;
    if (isDirty) setDiscard(true);
    else onClose();
  }
  async function save(v) {
    if (lock.current || connectionError || conflict || discard || !canEdit)
      return;
    const body = JSON.stringify({
      active: v.repeatEnabled,
      recurrence: v.repeatEnabled ? repeatInput(v) : series.recurrence,
      template: v.repeatEnabled
        ? {
            title: v.title,
            description: v.description,
            priority: v.priority,
            assigneeIds: [...new Set(v.assigneeIds)].sort(),
            eventId: v.eventId || null,
          }
        : {
            title: series.template.title,
            description: series.template.description,
            priority: series.template.priority,
            assigneeIds: series.template.assigneeIds,
            eventId: series.template.eventId,
          },
    });
    if (attempt.current?.body !== body)
      attempt.current = { body, key: crypto.randomUUID() };
    lock.current = true;
    setPending(true);
    setFailure('');
    try {
      const response = await apiRequest(
        `/weddings/${wedding.id}/tasks/${task.id}/series`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': attempt.current.key,
            'If-Match': `"${series.version}"`,
          },
          body,
          timeoutMs: 30000,
        },
      );
      onSaved(response.data);
    } catch (error) {
      setFailure(error.message);
      if (['VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT'].includes(error.code))
        setConflict(true);
      if (error.code === 'ASSIGNEE_UNAVAILABLE')
        setUnavailable(error.details?.unavailableAssigneeIds || []);
      const mapping = {
        'recurrence.startDate': 'repeatStartDate',
        'recurrence.endDate': 'repeatEndDate',
        'recurrence.interval': 'repeatInterval',
        'recurrence.time': 'dueTime',
      };
      for (const [key, message] of Object.entries(error.details?.fields || {}))
        setError(mapping[key] || key.replace(/^template\./, ''), {
          type: 'server',
          message,
        });
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.drawer}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onReturnFocus();
          }}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            if (discard && !lock.current) setDiscard(false);
            else close();
          }}
          onPointerDownOutside={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <header className={styles.drawerHeader}>
            <div>
              <span className={styles.eyebrow}>Repeat configuration</span>
              <Dialog.Title>Edit future repeats</Dialog.Title>
              <Dialog.Description>
                Changes apply from {effectiveFrom} · IST. Completed and
                individually edited copies are kept.
              </Dialog.Description>
            </div>
            <button
              type="button"
              aria-label="Close repeat settings"
              disabled={pending}
              onClick={close}
            >
              <X size={20} />
            </button>
          </header>
          <div className={styles.drawerBody}>
            <p className={styles.hint}>
              Untouched upcoming copies follow the new pattern. Obsolete
              untouched dates leave the active list; completed, past and
              customized copies remain. Stopping prevents new generation and
              keeps existing tasks.
            </p>
            {series.generationIssue && (
              <p className={styles.error}>
                Automatic repeats need attention. Review active assignees and
                the ceremony, then save to resume with your current access.
              </p>
            )}
            {connectionError && (
              <p
                ref={connectionNotice}
                tabIndex={-1}
                role="alert"
                className={styles.error}
              >
                Connection interrupted. Your repeat settings are kept.{' '}
                <button type="button" onClick={retrySession}>
                  Retry session check
                </button>
              </p>
            )}
            {failure && (
              <section
                tabIndex={-1}
                ref={errorTarget}
                role="alert"
                className={styles.error}
              >
                <p>{failure}</p>
                {conflict && (
                  <>
                    <p>Loading latest settings replaces this draft.</p>
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={pending || !!connectionError}
                      onClick={onReload}
                    >
                      Load latest pattern
                    </button>
                  </>
                )}
              </section>
            )}
            <form
              id="task-series-form"
              noValidate
              onSubmit={(event) => {
                void handleSubmit(save)(event);
              }}
            >
              <fieldset
                className={styles.form}
                disabled={
                  pending ||
                  discard ||
                  conflict ||
                  !!connectionError ||
                  !canEdit
                }
              >
                <p className={styles.hint}>Edit scope: Future repeats</p>
                <Field
                  label="Task title *"
                  id="series-title"
                  maxLength={160}
                  {...register('title')}
                  error={errors.title?.message}
                />
                <TaskAssignees
                  weddingId={wedding.id}
                  userId={user.id}
                  ids={values.assigneeIds || []}
                  saved={series.template.assignees}
                  unavailableIds={unavailable}
                  disabled={pending || discard || conflict || !!connectionError}
                  error={errors.assigneeIds?.message}
                  onChange={(ids) => {
                    setUnavailable((old) =>
                      old.filter((id) => ids.includes(id)),
                    );
                    setValue('assigneeIds', ids, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                />
                <Field
                  label="Linked ceremony (optional)"
                  id="series-event"
                  as="select"
                  {...register('eventId')}
                  error={errors.eventId?.message}
                >
                  <option value="">Wedding-wide · No ceremony</option>
                  {values.eventId &&
                    !events.rows.some((row) => row.id === values.eventId) && (
                      <option value={values.eventId}>
                        {series.template.event?.available
                          ? series.template.event.name
                          : 'Unavailable ceremony · Replace or unlink'}
                      </option>
                    )}
                  {events.rows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </Field>
                <div className={styles.choiceActions}>
                  <button
                    type="button"
                    className={styles.textButton}
                    disabled={events.loading}
                    onClick={events.error ? events.retry : events.refresh}
                  >
                    {events.error ? 'Retry ceremonies' : 'Refresh ceremonies'}
                  </button>
                  {!events.loading &&
                    !events.error &&
                    events.page < events.totalPages && (
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={events.more}
                      >
                        Load more ceremonies
                      </button>
                    )}
                </div>
                <div className={styles.twoColumns}>
                  <Field
                    label="Priority"
                    id="series-priority"
                    as="select"
                    {...register('priority')}
                  >
                    {taskPriorities.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </Field>
                  <Field
                    label="Due time · IST (optional)"
                    id="series-time"
                    type="time"
                    {...register('dueTime')}
                    error={errors.dueTime?.message}
                  />
                </div>
                <p className={styles.hint}>
                  Current task statuses are preserved. New copies start as To
                  Do. Without a time, each deadline is the end of its India day.
                </p>
                <RepeatControls
                  values={values}
                  register={register}
                  errors={errors}
                  wedding={wedding}
                  effectiveFrom={effectiveFrom}
                  existing
                  onToggle={(value) =>
                    setValue('repeatEnabled', value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
                <Field
                  label="Notes (optional)"
                  id="series-notes"
                  as="textarea"
                  maxLength={2000}
                  rows={4}
                  {...register('description')}
                  error={errors.description?.message}
                />
              </fieldset>
            </form>
          </div>
          <footer className={styles.drawerFooter}>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={pending || discard}
                onClick={close}
              >
                Close
              </button>
              <button
                type="submit"
                form="task-series-form"
                className={styles.primary}
                disabled={
                  pending ||
                  discard ||
                  conflict ||
                  !!connectionError ||
                  !canEdit
                }
              >
                {pending
                  ? 'Saving repeats…'
                  : values.repeatEnabled
                    ? 'Save future repeats'
                    : 'Stop future generation'}
              </button>
            </div>
          </footer>
          <DiscardChangesDialog
            open={discard}
            pending={pending}
            title="Discard unsaved repeat changes?"
            onKeepEditing={() => {
              if (!lock.current) setDiscard(false);
            }}
            onDiscard={() => {
              if (!lock.current) onClose();
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
