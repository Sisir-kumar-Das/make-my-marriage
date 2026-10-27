'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog } from 'radix-ui';
import { X, AlertTriangle, Info, Trash2 } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useSession } from '@/features/auth/session-provider';
import { RepeatControls } from './repeat-controls';
import { indiaToday } from './recurrence-data';
import {
  taskFormSchema,
  initialTask,
  taskInput,
  taskStatuses,
  taskPriorities,
  dueLabel,
  draftTaskWarnings,
  isOverdue,
} from './form-data';
import styles from './tasks.module.css';
import { TaskAssignees, AssigneeNames } from './task-assignees';
import { DiscardChangesDialog } from './discard-changes-dialog';

export function Field({
  label,
  id,
  error,
  as: Tag = 'input',
  children,
  ...props
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <Tag
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      >
        {children}
      </Tag>
      {error && (
        <p className={styles.fieldError} id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function TaskEditor({
  wedding,
  task,
  initialCeremony,
  canEdit,
  onClose,
  onSaved,
  onRemoved,
  onReturnFocus,
  onEditFuture,
}) {
  const { user, connectionError, retrySession } = useSession();
  const [record, setRecord] = useState(task);
  const [editing, setEditing] = useState(!task);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState('');
  const [conflict, setConflict] = useState(false);
  const [unavailableAssignees, setUnavailableAssignees] = useState([]);
  const [discard, setDiscard] = useState(false);
  const [removing, setRemoving] = useState(false);
  const deleteAttempt = useRef(null),
    cancelRemoval = useRef(null);
  const discardTarget = useRef('close');
  const lock = useRef(false),
    attempt = useRef(null),
    failureFocus = useRef(null),
    connectionNotice = useRef(null);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(taskFormSchema),
    defaultValues: initialTask(task, initialCeremony),
  });
  const values = useWatch({ control });
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setClock(Date.now());
    const timer = window.setInterval(update, 30000);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, []);
  const warnings = editing ? draftTaskWarnings(values, wedding, clock) : [];
  useEffect(() => {
    if (failure) {
      failureFocus.current?.focus();
      failureFocus.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [failure]);
  useEffect(() => {
    if (connectionError) {
      connectionNotice.current?.focus({ preventScroll: true });
      connectionNotice.current?.scrollIntoView({ block: 'start' });
    }
  }, [connectionError]);
  useEffect(() => {
    if (removing) cancelRemoval.current?.focus();
  }, [removing]);
  useEffect(() => {
    if (!editing || !isDirty) return;
    const protect = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [editing, isDirty]);
  const [choicePage, setChoicePage] = useState(1),
    [choiceRetry, setChoiceRetry] = useState(0);
  const [choices, setChoices] = useState({ rows: [], totalPages: 1 });
  const choiceKey = `${choicePage}:${choiceRetry}`;
  const [choiceResult, setChoiceResult] = useState(null);
  useEffect(() => {
    if (!editing) return;
    const controller = new AbortController();
    let active = true;
    void apiRequest(
      `/weddings/${wedding.id}/events?page=${choicePage}&limit=100`,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!active) return;
        setChoices((previous) => ({
          rows:
            choicePage === 1
              ? response.data.events
              : [
                  ...previous.rows,
                  ...response.data.events.filter(
                    (row) => !previous.rows.some((old) => old.id === row.id),
                  ),
                ],
          totalPages: response.meta.totalPages,
        }));
        setChoiceResult({ key: choiceKey });
      })
      .catch((error) => {
        if (active) setChoiceResult({ key: choiceKey, error: error.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [editing, wedding.id, choicePage, choiceKey]);
  const choicesLoading = choiceResult?.key !== choiceKey;
  function close(target = 'close') {
    if (lock.current || discard) return;
    if (removing) {
      setRemoving(false);
      return;
    }
    if (editing && isDirty) {
      discardTarget.current = target;
      setDiscard(true);
      return;
    }
    if (target === 'view') setEditing(false);
    else if (target === 'future') onEditFuture(record);
    else onClose();
  }
  async function save(raw) {
    if (
      lock.current ||
      connectionError ||
      conflict ||
      !canEdit ||
      discard ||
      removing
    )
      return;
    const body = JSON.stringify(taskInput(raw));
    const identity = `${record?.id || 'new'}/${record?.version}/${body}`;
    if (attempt.current?.identity !== identity)
      attempt.current = { identity, key: crypto.randomUUID() };
    lock.current = true;
    setPending(true);
    setDiscard(false);
    setFailure('');
    try {
      const response = await apiRequest(
        `/weddings/${wedding.id}/tasks${record ? '/' + record.id : ''}`,
        {
          method: record ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': attempt.current.key,
            ...(record && { 'If-Match': `"${record.version}"` }),
          },
          body,
          timeoutMs: 20000,
        },
      );
      const created = !record;
      setRecord(response.data.task);
      reset(initialTask(response.data.task));
      setEditing(false);
      attempt.current = null;
      setUnavailableAssignees([]);
      onSaved(response.data, created);
    } catch (error) {
      if (error.code === 'ASSIGNEE_UNAVAILABLE')
        setUnavailableAssignees(error.details?.unavailableAssigneeIds || []);
      if (['VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT'].includes(error.code))
        setConflict(true);
      for (const [key, message] of Object.entries(error.details?.fields || {}))
        setError(
          key.startsWith('recurrence.')
            ? {
                'recurrence.startDate': 'repeatStartDate',
                'recurrence.endDate': 'repeatEndDate',
                'recurrence.interval': 'repeatInterval',
                'recurrence.time': 'dueTime',
              }[key] || 'repeatEndDate'
            : key === 'dueAt'
              ? 'dueDate'
              : key,
          {
            type: 'server',
            message,
          },
        );
      setFailure(error.message);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  async function remove() {
    if (
      lock.current ||
      !record ||
      !canEdit ||
      connectionError ||
      conflict ||
      !removing
    )
      return;
    if (deleteAttempt.current?.version !== record.version)
      deleteAttempt.current = {
        version: record.version,
        key: crypto.randomUUID(),
      };
    lock.current = true;
    setPending(true);
    setFailure('');
    try {
      const response = await apiRequest(
        `/weddings/${wedding.id}/tasks/${record.id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': deleteAttempt.current.key,
            'If-Match': `"${deleteAttempt.current.version}"`,
          },
          body: '{}',
          timeoutMs: 20000,
        },
      );
      if (!response.data.task.deletedAt) {
        setConflict(true);
        setFailure(
          'Your earlier deletion was confirmed, but this task was restored afterward. Load the latest task before deleting it again.',
        );
      } else onRemoved(response.data);
    } catch (error) {
      if (
        [
          'VERSION_CONFLICT',
          'IDEMPOTENCY_CONFLICT',
          'TASK_STATE_CHANGED',
          'TASK_NOT_FOUND',
        ].includes(error.code)
      )
        setConflict(true);
      setFailure(error.message);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  async function loadLatest() {
    if (lock.current || !record || connectionError) return;
    lock.current = true;
    setPending(true);
    setFailure('');
    setDiscard(false);
    try {
      const response = await apiRequest(
        `/weddings/${wedding.id}/tasks/${record.id}`,
      );
      setRecord(response.data.task);
      reset(initialTask(response.data.task));
      setRemoving(false);
      deleteAttempt.current = null;
      attempt.current = null;
      setConflict(false);
      setUnavailableAssignees([]);
      setChoicePage(1);
      setChoiceRetry((value) => value + 1);
    } catch (error) {
      setFailure(error.message);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const selectedMissing =
    values.eventId && !choices.rows.some((row) => row.id === values.eventId);
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
              <span className={styles.eyebrow}>Task Configuration</span>
              <Dialog.Title>
                {record
                  ? editing
                    ? 'Edit task'
                    : record.title
                  : 'Create task'}
              </Dialog.Title>
              <Dialog.Description>
                {editing
                  ? 'Coordinate your wedding preparations. Due dates and times use IST.'
                  : 'Saved task details · India Standard Time (IST)'}
              </Dialog.Description>
            </div>
            <button
              type="button"
              aria-label="Close task details"
              disabled={pending}
              onClick={() => close()}
            >
              <X size={20} />
            </button>
          </header>
          <div className={styles.drawerBody}>
            {connectionError && (
              <section
                ref={connectionNotice}
                tabIndex={-1}
                role="alert"
                className={styles.error}
              >
                <strong>We could not check your session.</strong>
                <p>
                  Your unsaved task is kept in this tab. Reconnect and retry.
                </p>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    setFailure('');
                    retrySession();
                  }}
                >
                  Retry session check
                </button>
              </section>
            )}
            {failure && (
              <div
                ref={failureFocus}
                role="alert"
                tabIndex={-1}
                className={styles.error}
              >
                <p>{failure}</p>
                {conflict && (
                  <>
                    <p>
                      Your draft is kept. Loading the latest task replaces this
                      draft with its saved version.
                    </p>
                    <button
                      type="button"
                      disabled={pending || !!connectionError}
                      className={styles.secondary}
                      onClick={() => void loadLatest()}
                    >
                      Load latest task
                    </button>
                  </>
                )}
              </div>
            )}
            {editing ? (
              <form
                id="task-form"
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
                    removing ||
                    conflict ||
                    !!connectionError ||
                    !canEdit
                  }
                >
                  {record?.seriesId && (
                    <label className={styles.field}>
                      Edit scope
                      <select
                        aria-label="Edit scope"
                        value="this"
                        onChange={(event) => {
                          if (event.target.value === 'future') close('future');
                        }}
                      >
                        <option value="this">This task only</option>
                        <option value="future">Future repeats</option>
                      </select>
                    </label>
                  )}
                  <Field
                    label="Task title *"
                    id="task-title"
                    maxLength={160}
                    required
                    placeholder="e.g. Finalize the photographer shot list"
                    {...register('title')}
                    error={errors.title?.message}
                  />
                  <TaskAssignees
                    weddingId={wedding.id}
                    userId={user.id}
                    ids={values.assigneeIds || []}
                    saved={record?.assignees}
                    unavailableIds={unavailableAssignees}
                    disabled={
                      pending ||
                      discard ||
                      removing ||
                      conflict ||
                      !!connectionError
                    }
                    error={errors.assigneeIds?.message}
                    onChange={(ids) => {
                      setUnavailableAssignees((previous) =>
                        previous.filter((id) => ids.includes(id)),
                      );
                      setValue('assigneeIds', ids, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                  />
                  <Field
                    label="Linked ceremony (optional)"
                    id="task-event"
                    as="select"
                    {...register('eventId')}
                    value={values.eventId || ''}
                    error={errors.eventId?.message}
                  >
                    <option value="">Wedding-wide · No ceremony</option>
                    {selectedMissing && (
                      <option value={values.eventId}>
                        {record?.event?.available === false
                          ? 'Unavailable ceremony · Retained link'
                          : record?.event?.name ||
                            initialCeremony?.name ||
                            'Selected ceremony · Not loaded'}
                      </option>
                    )}
                    {choices.rows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </Field>
                  <div className={styles.choiceActions}>
                    {choicesLoading ? (
                      <p role="status">Loading ceremonies…</p>
                    ) : choiceResult?.error ? (
                      <p role="status">
                        Ceremonies couldn’t load. You can still save a
                        wedding-wide task.
                      </p>
                    ) : (
                      <p>
                        {choices.rows.length} available{' '}
                        {choices.rows.length === 1 ? 'ceremony' : 'ceremonies'}{' '}
                        loaded.
                      </p>
                    )}
                    <button
                      type="button"
                      className={styles.textButton}
                      disabled={choicesLoading}
                      onClick={() => {
                        setChoicePage(1);
                        setChoiceRetry((value) => value + 1);
                      }}
                    >
                      Refresh ceremonies
                    </button>
                    {!choicesLoading &&
                      !choiceResult?.error &&
                      choicePage < choices.totalPages && (
                        <button
                          type="button"
                          className={styles.textButton}
                          onClick={() => setChoicePage((value) => value + 1)}
                        >
                          Load more ceremonies
                        </button>
                      )}
                    {!choicesLoading && choiceResult?.error && (
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={() => setChoiceRetry((value) => value + 1)}
                      >
                        Retry ceremonies
                      </button>
                    )}
                  </div>
                  {record?.event?.available === false &&
                    values.eventId === record.eventId && (
                      <p className={styles.hint}>
                        This ceremony is unavailable. Keep its historical
                        association, choose another ceremony, or make this task
                        wedding-wide. Your task remains usable.
                      </p>
                    )}
                  <div className={styles.twoColumns}>
                    <Field
                      as="select"
                      label="Status"
                      id="task-status"
                      {...register('status')}
                      disabled={values.repeatEnabled}
                      error={errors.status?.message}
                    >
                      {taskStatuses.map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Field>
                    <Field
                      as="select"
                      label="Priority"
                      id="task-priority"
                      {...register('priority')}
                      error={errors.priority?.message}
                    >
                      {taskPriorities.map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Field>
                  </div>
                  <section className={styles.form}>
                    <h3>Due date &amp; time (optional)</h3>
                    <div className={styles.twoColumns}>
                      <Field
                        type="date"
                        label="Due date"
                        id="task-due-date"
                        min="1000-01-01"
                        max="9999-12-31"
                        {...register('dueDate')}
                        value={
                          values.repeatEnabled
                            ? values.repeatStartDate
                            : values.dueDate
                        }
                        readOnly={values.repeatEnabled}
                        error={errors.dueDate?.message}
                      />
                      <Field
                        type="time"
                        label="Due time · IST"
                        id="task-due-time"
                        {...register('dueTime')}
                        error={errors.dueTime?.message}
                      />
                    </div>
                    <p className={styles.hint}>
                      {values.repeatEnabled
                        ? 'Repeat start date is set below. This optional due time applies to each repeat.'
                        : 'Without a time, the deadline is the end of that day in India. Leave both blank for no deadline.'}
                    </p>
                    {warnings.map((warning) => (
                      <div
                        role={warning.severity === 'info' ? 'status' : 'alert'}
                        className={
                          warning.severity === 'info'
                            ? styles.deadlineInfo
                            : styles.warning
                        }
                        key={warning.code}
                      >
                        {warning.severity === 'info' ? (
                          <Info size={20} aria-hidden="true" />
                        ) : (
                          <AlertTriangle size={20} aria-hidden="true" />
                        )}
                        <div>
                          <strong>
                            {warning.code === 'PAST_DUE_DATE'
                              ? 'Past-due deadline — check before saving'
                              : 'Deadline after the wedding'}
                          </strong>
                          <p>{warning.message}</p>
                        </div>
                      </div>
                    ))}
                  </section>
                  {record?.seriesId ? (
                    <section className={styles.soft}>
                      <h3>Recurring task · This copy only</h3>
                      <p className={styles.hint}>
                        Changes here customize this dated copy. Its completion
                        and edits will be preserved when the repeat pattern
                        changes.
                      </p>
                      {record.repeat?.generationIssue && (
                        <p className={styles.error}>
                          Future generation needs attention. Edit future repeats
                          to review active assignees and the ceremony.
                        </p>
                      )}
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={() => close('future')}
                      >
                        Edit future repeats
                      </button>
                    </section>
                  ) : (
                    <RepeatControls
                      values={values}
                      register={register}
                      errors={errors}
                      wedding={wedding}
                      disabled={record?.status === 'COMPLETED'}
                      onToggle={(enabled) => {
                        setValue('repeatEnabled', enabled, {
                          shouldDirty: true,
                        });
                        if (enabled) {
                          setValue('status', 'TODO', { shouldDirty: true });
                          if (!values.repeatStartDate)
                            setValue(
                              'repeatStartDate',
                              values.dueDate || indiaToday(),
                              { shouldDirty: true },
                            );
                          if (!values.repeatEndDate)
                            setValue(
                              'repeatEndDate',
                              wedding.mainDate >= indiaToday()
                                ? wedding.mainDate
                                : '',
                              { shouldDirty: true },
                            );
                        }
                      }}
                    />
                  )}
                  {!record?.seriesId && record?.status === 'COMPLETED' && (
                    <p className={styles.hint}>
                      Save this task as To Do before turning it into a repeat
                      pattern.
                    </p>
                  )}
                  <Field
                    as="textarea"
                    label="Notes (optional)"
                    id="task-description"
                    rows={4}
                    maxLength={2000}
                    placeholder="Add preparation details or instructions…"
                    {...register('description')}
                    error={errors.description?.message}
                  />
                </fieldset>
              </form>
            ) : (
              record && (
                <section className={styles.details}>
                  <div className={styles.badges}>
                    <span data-status={record.status}>
                      {taskStatuses.find(([key]) => key === record.status)?.[1]}
                    </span>
                    <span data-priority={record.priority}>
                      {
                        taskPriorities.find(
                          ([key]) => key === record.priority,
                        )?.[1]
                      }
                    </span>
                    {isOverdue(record, clock) && (
                      <span className={styles.overdue}>Overdue</span>
                    )}
                  </div>
                  <dl>
                    <div>
                      <dt>Linked ceremony</dt>
                      <dd>
                        {record.event
                          ? record.event.available
                            ? record.event.name
                            : 'Unavailable ceremony · Historical link retained'
                          : 'Wedding-wide'}
                      </dd>
                    </div>
                    <div>
                      <dt>Due date</dt>
                      <dd>
                        {dueLabel(record)}
                        {record.dueAt && !record.dueDateOnly ? ' · IST' : ''}
                      </dd>
                    </div>
                    <div>
                      <dt>Assignees</dt>
                      <dd>
                        <AssigneeNames assignees={record.assignees} />
                      </dd>
                    </div>
                    <div>
                      <dt>Recurrence</dt>
                      <dd>
                        {record.repeat
                          ? `Every ${record.repeat.interval} ${record.repeat.frequency.toLowerCase().replace('daily', 'day').replace('weekly', 'week').replace('monthly', 'month')}${record.repeat.interval > 1 ? 's' : ''} · ${record.repeat.active ? 'Active' : 'Stopped'}`
                          : 'None'}
                      </dd>
                    </div>
                  </dl>
                  {record.seriesId && (
                    <section className={styles.soft}>
                      <p>
                        Scheduled copy: {record.occurrenceDate} · IST
                        {record.occurrenceEdited
                          ? ' · Individually edited'
                          : ''}
                      </p>
                      {record.repeat?.generationIssue && (
                        <p className={styles.error}>
                          Future repeat generation needs attention.
                        </p>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          className={styles.textButton}
                          disabled={pending || removing || !!connectionError}
                          onClick={() => {
                            if (!lock.current && !removing)
                              onEditFuture(record);
                          }}
                        >
                          Edit future repeats
                        </button>
                      )}
                    </section>
                  )}
                  {record.description && (
                    <section>
                      <h3>Notes</h3>
                      <p className={styles.notes}>{record.description}</p>
                    </section>
                  )}
                  {record.completedAt && (
                    <p className={styles.hint}>
                      Completed{' '}
                      {new Intl.DateTimeFormat('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(record.completedAt))}{' '}
                      · IST
                    </p>
                  )}
                  {!canEdit && (
                    <p className={styles.viewer}>Viewer access · Read only</p>
                  )}
                </section>
              )
            )}
          </div>
          <footer className={styles.drawerFooter}>
            {removing && (
              <section
                className={`${styles.discard} ${styles.deleteConfirm}`}
                role="alert"
                aria-label="Confirm task deletion"
              >
                <div className={styles.deleteSummary}>
                  <strong>Delete “{record.title}”?</strong>
                  <p>
                    This task can be restored from Settings → Deleted Items
                    Recovery.
                  </p>
                  {record.seriesId && (
                    <p>
                      Only this dated copy is removed. Other repeats and future
                      generation continue.
                    </p>
                  )}
                  {editing && isDirty && (
                    <p>
                      Your unsaved edits will be discarded if you delete this
                      task.
                    </p>
                  )}
                </div>
                <div className={styles.actions}>
                  <button
                    ref={cancelRemoval}
                    type="button"
                    className={styles.secondary}
                    disabled={pending}
                    onClick={() => {
                      if (!lock.current) setRemoving(false);
                    }}
                  >
                    Cancel deletion
                  </button>
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={
                      pending || conflict || !!connectionError || !canEdit
                    }
                    onClick={() => void remove()}
                  >
                    {pending ? 'Deleting…' : 'Confirm delete task'}
                  </button>
                </div>
              </section>
            )}
            {record && canEdit && (
              <button
                type="button"
                className={styles.deleteButton}
                disabled={
                  pending ||
                  discard ||
                  removing ||
                  conflict ||
                  !!connectionError
                }
                onClick={() => {
                  if (!lock.current) {
                    setRemoving(true);
                    setFailure('');
                  }
                }}
              >
                <Trash2 size={14} /> Delete task
              </button>
            )}
            <div className={styles.actions}>
              {editing && record && (
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={pending || discard || removing}
                  onClick={() => close('view')}
                >
                  Cancel edit
                </button>
              )}
              <button
                type="button"
                className={styles.secondary}
                disabled={pending || discard || removing}
                onClick={() => close()}
              >
                Close
              </button>
              {editing ? (
                <button
                  key="save-task"
                  type="submit"
                  form="task-form"
                  className={styles.primary}
                  disabled={
                    pending ||
                    discard ||
                    removing ||
                    conflict ||
                    !!connectionError ||
                    !canEdit
                  }
                >
                  {pending && !removing ? 'Saving task…' : 'Save Task'}
                </button>
              ) : (
                canEdit && (
                  <button
                    key="edit-task"
                    type="button"
                    className={styles.primary}
                    disabled={pending || removing || !!connectionError}
                    onClick={(event) => {
                      event.preventDefault();
                      reset(initialTask(record));
                      setFailure('');
                      setConflict(false);
                      setEditing(true);
                    }}
                  >
                    Edit task
                  </button>
                )
              )}
            </div>
          </footer>
          <DiscardChangesDialog
            open={discard}
            pending={pending}
            title="Discard unsaved task changes?"
            onKeepEditing={() => {
              if (!lock.current) setDiscard(false);
            }}
            onDiscard={() => {
              if (lock.current) return;
              setDiscard(false);
              if (discardTarget.current === 'view') {
                reset(initialTask(record));
                setEditing(false);
                setFailure('');
                setConflict(false);
              } else if (discardTarget.current === 'future')
                onEditFuture(record);
              else onClose();
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
