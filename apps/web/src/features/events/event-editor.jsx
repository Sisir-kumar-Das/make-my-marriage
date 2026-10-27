'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog } from 'radix-ui';
import {
  X,
  MapPin,
  CalendarDays,
  AlertTriangle,
  ExternalLink,
  LockKeyhole,
  Trash2,
  Info,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useSession } from '@/features/auth/session-provider';
import { DiscardChangesDialog } from '@/features/tasks/discard-changes-dialog';
import {
  eventTypes,
  eventStatuses,
  eventFormValidation,
  eventStatusTiming,
  initialEvent,
  eventInput,
  nextDate,
  mapsLink,
  eventDate,
  eventRange,
} from './form-data';
import { ActivityForm, ActivityList } from './ceremony-activities';
import { CeremonyTasks } from './ceremony-tasks';
import { VenuePicker, GoogleVenueDetails } from './venue-picker';
import {
  newActivity,
  activityLimit,
  activityFormSchema,
  activityEditValues,
  activityDraftWarnings,
} from './activity-data';
import styles from './events.module.css';

function Input({ label, id, error, as: Tag = 'input', children, ...props }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <Tag
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? id + '-error' : undefined}
        {...props}
      >
        {children}
      </Tag>
      {error && (
        <p id={id + '-error'} role="alert" className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
export function EventEditor({
  wedding,
  event,
  initialWarnings = [],
  canEdit,
  onClose,
  onSaved,
  onReturnFocus,
}) {
  const router = useRouter();
  const { connectionError, retrySession, membership } = useSession();
  const canRemove = membership.role === 'ADMIN';
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const removalAttempt = useRef(null);
  const keepEvent = useRef(null);
  useEffect(() => {
    if (removeConfirm) keepEvent.current?.focus();
  }, [removeConfirm]);
  const [record, setRecord] = useState(event);
  const [editing, setEditing] = useState(!event);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [warnings, setWarnings] = useState(initialWarnings);
  const [pending, setPending] = useState(false);
  const [activityEditor, setActivityEditor] = useState(null);
  const activityAttempt = useRef(null);
  const activitySection = useRef(null);
  const activitySummary = useRef(null);
  const activityWasOpen = useRef(false);
  const discardTarget = useRef('close');
  const [taskDestination, setTaskDestination] = useState(null);
  const activityForm = useForm({
    resolver: zodResolver(activityFormSchema),
    defaultValues: newActivity(initialEvent(wedding, event)),
  });
  const activityDirty = activityForm.formState.isDirty;
  const focusActivity = activityForm.setFocus;
  useEffect(() => {
    if (!activityEditor) {
      if (activityWasOpen.current) {
        activitySummary.current?.focus({ preventScroll: true });
        activitySummary.current?.scrollIntoView({ block: 'nearest' });
        activityWasOpen.current = false;
      }
      return;
    }
    activityWasOpen.current = true;
    activitySection.current?.scrollIntoView({ block: 'nearest' });
    if (activityEditor.operation !== 'REMOVE') focusActivity('name');
  }, [activityEditor, focusActivity]);
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
  const lock = useRef(false),
    attempt = useRef(null);
  const failureNotice = useRef(null);
  const connectionNotice = useRef(null);
  useEffect(() => {
    if (!connectionError) return;
    connectionNotice.current?.focus({ preventScroll: true });
    connectionNotice.current?.scrollIntoView({ block: 'start' });
  }, [connectionError]);
  useEffect(() => {
    if (!error) return;
    failureNotice.current?.focus({ preventScroll: true });
    failureNotice.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);
  const {
    register,
    control,
    getValues,
    setValue,
    reset,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm({
    resolver: (values, context, options) =>
      zodResolver(
        eventFormValidation({
          canRetry: (parsed) =>
            attempt.current?.identity ===
            `${record?.id || 'new'}/${record?.version}/${JSON.stringify(eventInput(parsed))}`,
        }),
      )(values, context, options),
    defaultValues: initialEvent(wedding, event),
  });
  function startActivity(row = null, operation = row ? 'EDIT' : 'ADD') {
    if (
      lock.current ||
      connectionError ||
      discard ||
      conflict ||
      !canEdit ||
      editing ||
      activityEditor ||
      !record
    )
      return;
    if (
      operation === 'ADD' &&
      (record.activities || []).length >= activityLimit
    )
      return;
    activityForm.reset(activityEditValues(row, initialEvent(wedding, record)));
    activityAttempt.current = null;
    setActivityEditor({ operation, id: row?.id || null, name: row?.name });
    setNotice('');
    setError('');
  }
  function cancelActivity() {
    if (lock.current || discard) return;
    if (activityDirty) {
      setTaskDestination(null);
      discardTarget.current = 'activity';
      setDiscard(true);
    } else {
      setActivityEditor(null);
      activityAttempt.current = null;
      setError('');
    }
  }
  async function saveActivity(input, another = false) {
    if (
      lock.current ||
      connectionError ||
      !canEdit ||
      conflict ||
      discard ||
      !activityEditor ||
      !record
    )
      return;
    lock.current = true;
    setDiscard(false);
    setPending(true);
    setError('');
    setNotice('');
    const operation = activityEditor.operation;
    const body = JSON.stringify(operation === 'REMOVE' ? {} : input);
    const identity = `${record.id}/${record.version}/${operation}/${activityEditor.id}/${body}`;
    if (activityAttempt.current?.identity !== identity)
      activityAttempt.current = { identity, key: crypto.randomUUID() };
    try {
      const response = await apiRequest(
        `/weddings/${wedding.id}/events/${record.id}/activities${activityEditor.id ? '/' + activityEditor.id : ''}`,
        {
          method: { ADD: 'POST', EDIT: 'PATCH', REMOVE: 'DELETE' }[operation],
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': activityAttempt.current.key,
            'If-Match': `"${record.version}"`,
          },
          body,
          timeoutMs: 20000,
        },
      );
      const current = response.data.event;
      setRecord(current);
      setWarnings(response.data.warnings);
      reset(initialEvent(wedding, current));
      activityAttempt.current = null;
      setConflict(false);
      activityForm.reset(newActivity(initialEvent(wedding, current)));
      setActivityEditor(
        another && current.activities.length < activityLimit
          ? { operation: 'ADD', id: null }
          : null,
      );
      setNotice(
        response.data.replayed
          ? 'Your earlier activity save was confirmed. Showing the latest details.'
          : operation === 'REMOVE'
            ? 'Activity removed.'
            : another
              ? 'Activity saved. Add the next activity below.'
              : 'Activity saved. You can edit it again at any time.',
      );
      onSaved({ ...response.data, created: false });
    } catch (failure) {
      setError(failure.message);
      setConflict(
        failure.code === 'VERSION_CONFLICT' ||
          failure.code === 'IDEMPOTENCY_CONFLICT',
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const [startDate, endDate, startTime, endTime, status] = useWatch({
    control,
    name: ['startDate', 'endDate', 'startTime', 'endTime', 'status'],
  });
  const googlePlaceId = useWatch({ control, name: 'googlePlaceId' });
  const timing = eventStatusTiming(
    { startDate, endDate, startTime, endTime, status },
    new Date(clock),
  );
  const startField = register('startDate');
  function changeStartDate(event) {
    const previousStart = getValues('startDate');
    const previousEnd = getValues('endDate');
    void startField.onChange(event);
    if (previousEnd === previousStart)
      setValue('endDate', event.target.value, { shouldDirty: true });
    else if (previousEnd === nextDate(previousStart))
      setValue('endDate', nextDate(event.target.value), { shouldDirty: true });
  }
  function close() {
    if (lock.current || discard) return;
    if ((editing && isDirty) || (activityEditor && activityDirty)) {
      setTaskDestination(null);
      discardTarget.current = 'close';
      setDiscard(true);
      return;
    }
    onClose();
  }
  function navigateTasks(href) {
    if (lock.current || connectionError || discard || removeConfirm) return;
    if (!record) return;
    if ((editing && isDirty) || (activityEditor && activityDirty)) {
      setTaskDestination(href);
      discardTarget.current = 'tasks';
      setDiscard(true);
    } else router.push(href);
  }
  function discardChanges() {
    if (lock.current) return;
    if (discardTarget.current === 'activity') {
      setActivityEditor(null);
      activityAttempt.current = null;
      setDiscard(false);
      setError('');
      activityForm.reset(newActivity(initialEvent(wedding, record)));
    } else if (discardTarget.current === 'tasks' && taskDestination) {
      router.push(taskDestination);
    } else onClose();
  }
  async function removeEvent() {
    if (
      lock.current ||
      connectionError ||
      !canRemove ||
      !record ||
      editing ||
      activityEditor ||
      !removeConfirm ||
      conflict
    )
      return;
    lock.current = true;
    setPending(true);
    setError('');
    setNotice('');
    const identity = `${record.id}/${record.version}`;
    if (removalAttempt.current?.identity !== identity)
      removalAttempt.current = { identity, key: crypto.randomUUID() };
    try {
      const response = await apiRequest(
        `/weddings/${wedding.id}/events/${record.id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': removalAttempt.current.key,
            'If-Match': `"${record.version}"`,
          },
          body: '{}',
          timeoutMs: 20000,
        },
      );
      removalAttempt.current = null;
      setRemoveConfirm(false);
      if (response.data.event.deletedAt) {
        onSaved({ ...response.data, created: false, removed: true });
      } else {
        setRecord(response.data.event);
        setWarnings(response.data.warnings);
        reset(initialEvent(wedding, response.data.event));
        setNotice(
          'Your earlier removal was confirmed, but this ceremony has since been restored. Showing its current details.',
        );
        onSaved({ ...response.data, created: false });
      }
    } catch (failure) {
      setError(failure.message);
      setConflict(
        [
          'VERSION_CONFLICT',
          'IDEMPOTENCY_CONFLICT',
          'EVENT_STATE_CHANGED',
        ].includes(failure.code),
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  async function latest() {
    if (lock.current) return;
    lock.current = true;
    setDiscard(false);
    setPending(true);
    setError('');
    try {
      const response = await apiRequest(
        `/weddings/${wedding.id}/events/${record.id}${canRemove && (removeConfirm || removalAttempt.current) ? '/recovery' : ''}`,
      );
      if (response.data.event.deletedAt) {
        onSaved({ ...response.data, created: false, removed: true });
        return;
      }
      setRemoveConfirm(false);
      removalAttempt.current = null;
      setRecord(response.data.event);
      setWarnings(response.data.warnings);
      reset(initialEvent(wedding, response.data.event));
      attempt.current = null;
      setConflict(false);
      setActivityEditor(null);
      activityAttempt.current = null;
      activityForm.reset(
        newActivity(initialEvent(wedding, response.data.event)),
      );
      setNotice('Latest details loaded. Review them before editing again.');
      setEditing(false);
    } catch (failure) {
      setError(failure.message);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  async function save(values) {
    if (lock.current || connectionError || discard || !canEdit) return;
    lock.current = true;
    setDiscard(false);
    setPending(true);
    setError('');
    setNotice('');
    const body = JSON.stringify(eventInput(values));
    const version = record?.version;
    const identity = `${record?.id || 'new'}/${version}/${body}`;
    if (attempt.current?.identity !== identity)
      attempt.current = { identity, key: crypto.randomUUID() };
    try {
      const response = await apiRequest(
        `/weddings/${wedding.id}/events${record ? '/' + record.id : ''}`,
        {
          method: record ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': attempt.current.key,
            ...(record ? { 'If-Match': `"${version}"` } : {}),
          },
          body,
          timeoutMs: 20000,
        },
      );
      if (!record) {
        attempt.current = null;
        onSaved({ ...response.data, created: true });
        return;
      }
      setRecord(response.data.event);
      setWarnings(response.data.warnings);
      reset(initialEvent(wedding, response.data.event));
      setEditing(false);
      attempt.current = null;
      setConflict(false);
      setNotice(
        response.data.replayed
          ? 'Your earlier save was confirmed. Showing the latest details.'
          : 'Your event is saved.',
      );
      onSaved({ ...response.data, created: false });
    } catch (failure) {
      setError(failure.message);
      setConflict(
        failure.code === 'VERSION_CONFLICT' ||
          failure.code === 'IDEMPOTENCY_CONFLICT',
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const map = mapsLink(record?.venue);
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
            if (
              event.target?.getAttribute('role') === 'combobox' &&
              event.target.getAttribute('aria-expanded') === 'true'
            )
              return;
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
              <span className={styles.eyebrow}>Event Details</span>
              <Dialog.Title>
                {record
                  ? editing
                    ? `Edit ${record.name}`
                    : record.name
                  : 'Add a ceremony'}
              </Dialog.Title>
              <Dialog.Description>
                {editing
                  ? 'Plan your ceremony, timing and venue. All times are India Standard Time (IST).'
                  : 'Saved ceremony details · India Standard Time (IST)'}
              </Dialog.Description>
            </div>
            <button
              type="button"
              aria-label="Close event details"
              onClick={close}
              disabled={pending}
            >
              <X size={20} />
            </button>
          </header>
          <div className={styles.drawerBody}>
            {connectionError && (
              <div
                ref={connectionNotice}
                tabIndex={-1}
                className={styles.error}
                role="alert"
              >
                <p>
                  Your unsaved event details are kept in this tab. Reconnect
                  before continuing.
                </p>
                <p>{connectionError}</p>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={retrySession}
                >
                  Retry session check
                </button>
              </div>
            )}
            {notice && (
              <p className={styles.notice} role="status">
                {notice}
              </p>
            )}
            {error && (
              <div
                ref={failureNotice}
                tabIndex={-1}
                role="alert"
                className={styles.error}
              >
                <p>{error}</p>
                {!conflict && (
                  <p>
                    For a lost save response, retry the same details to confirm
                    that save.
                  </p>
                )}
              </div>
            )}
            {conflict && (
              <div className={styles.warning}>
                <p>
                  Your unsaved entries are still in the form. Loading the latest
                  event replaces those entries; review or copy them first.
                </p>
                <button
                  type="button"
                  disabled={pending || !!connectionError}
                  className={styles.secondary}
                  onClick={latest}
                >
                  Load latest event
                </button>
              </div>
            )}
            {warnings
              .filter(
                (warning) =>
                  (!editing && !activityEditor) ||
                  !warning.code.startsWith('ACTIVITY_'),
              )
              .map((warning) => (
                <p key={warning.code} className={styles.warning}>
                  <AlertTriangle size={17} />
                  {warning.message}
                </p>
              ))}
            {editing &&
              activityDraftWarnings(getValues()).map((warning) => (
                <p key={warning.code} className={styles.warning} role="status">
                  <AlertTriangle size={17} /> {warning.message}
                </p>
              ))}
            {timing.reviewStatus && (
              <p className={styles.warning} role="status">
                <AlertTriangle size={17} />
                This ceremony&apos;s date has passed. Please review its status.
              </p>
            )}
            {editing ? (
              <form
                id="event-form"
                onSubmit={(event) => {
                  void handleSubmit(save)(event);
                }}
                noValidate
              >
                <fieldset
                  disabled={
                    pending ||
                    discard ||
                    !!connectionError ||
                    conflict ||
                    !canEdit
                  }
                  className={styles.form}
                >
                  <Input
                    label="Event name *"
                    id="event-name"
                    maxLength={160}
                    required
                    placeholder="e.g. Mehendi Sundowner"
                    {...register('name')}
                    error={errors.name?.message}
                  />
                  <div className={styles.twoColumns}>
                    <Input
                      as="select"
                      label="Ceremony type *"
                      id="event-type"
                      {...register('type')}
                      error={errors.type?.message}
                    >
                      {eventTypes.map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Input>
                    <Input
                      as="select"
                      label="Event status *"
                      id="event-status"
                      {...register('status')}
                      error={errors.status?.message}
                    >
                      {eventStatuses.map(([key, label]) => (
                        <option
                          key={key}
                          value={key}
                          disabled={key === 'COMPLETED' && timing.future}
                        >
                          {label}
                          {key === 'COMPLETED' && timing.future
                            ? ' · Not started yet'
                            : ''}
                        </option>
                      ))}
                    </Input>
                  </div>
                  {timing.future && (
                    <p className={styles.hint}>
                      Completed is available once the ceremony has started.
                      Dates and times use IST.
                    </p>
                  )}
                  <Input
                    as="textarea"
                    label="Description (optional)"
                    id="event-description"
                    rows={3}
                    maxLength={2000}
                    placeholder="Notes for family coordinators, traditions or decor…"
                    {...register('description')}
                    error={errors.description?.message}
                  />
                  <section className={styles.timing}>
                    <div className={styles.sectionTitle}>
                      <CalendarDays size={17} />
                      <h3>Dates &amp; times · IST</h3>
                    </div>
                    <p className={styles.hint}>
                      Past and future dates are allowed. Use an end date after
                      the start date for overnight celebrations.
                    </p>
                    <div className={styles.twoColumns}>
                      <Input
                        label="Start date *"
                        id="event-start-date"
                        type="date"
                        required
                        {...startField}
                        onChange={changeStartDate}
                        error={errors.startDate?.message}
                      />
                      <Input
                        label="Start time *"
                        id="event-start-time"
                        type="time"
                        required
                        {...register('startTime')}
                        error={errors.startTime?.message}
                      />
                    </div>
                    <label className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={!!startDate && endDate === nextDate(startDate)}
                        onChange={(e) =>
                          setValue(
                            'endDate',
                            e.target.checked
                              ? nextDate(getValues('startDate'))
                              : getValues('startDate'),
                            { shouldDirty: true, shouldValidate: true },
                          )
                        }
                      />
                      Ends next day
                    </label>
                    <div className={styles.twoColumns}>
                      <Input
                        label="End date *"
                        id="event-end-date"
                        type="date"
                        required
                        {...register('endDate')}
                        error={errors.endDate?.message}
                      />
                      <Input
                        label="End time *"
                        id="event-end-time"
                        type="time"
                        required
                        {...register('endTime')}
                        error={errors.endTime?.message}
                      />
                    </div>
                  </section>
                  <section className={styles.formSection}>
                    <div className={styles.sectionTitle}>
                      <MapPin size={17} />
                      <h3>
                        Venue &amp; Location <small>(Optional)</small>
                      </h3>
                    </div>
                    <VenuePicker
                      control={control}
                      setValue={setValue}
                      disabled={
                        pending ||
                        discard ||
                        !!connectionError ||
                        conflict ||
                        !canEdit
                      }
                    />
                    {googlePlaceId ? (
                      <div
                        role="note"
                        aria-label="Optional venue directions"
                        className={styles.venueGuidance}
                      >
                        <Info size={18} aria-hidden="true" />
                        <div>
                          <h4>
                            Want to add more specific directions?{' '}
                            <span>Optional</span>
                          </h4>
                          <p>
                            Your selected venue is ready to save. Add a hall
                            name, floor, entrance or nearby landmark below if
                            helpful.{' '}
                            <strong>
                              No need to repeat the Google Maps address.
                            </strong>
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className={styles.hint}>
                        Enter your own venue label and directions here. These
                        are saved with your ceremony and can be searched from
                        the schedule.
                      </p>
                    )}
                    <Input
                      label={
                        googlePlaceId
                          ? 'Your venue label (optional)'
                          : 'Your venue label'
                      }
                      id="event-venue"
                      maxLength={200}
                      placeholder="Venue, hall or family home"
                      {...register('venueName')}
                      error={errors.venueName?.message}
                    />
                    <Input
                      as="textarea"
                      label={
                        googlePlaceId
                          ? 'Extra directions (optional)'
                          : 'Your address / hall details'
                      }
                      id="event-address"
                      rows={2}
                      maxLength={500}
                      {...register('address')}
                      error={errors.address?.message}
                    />
                    <div className={styles.twoColumns}>
                      <Input
                        label="City"
                        id="event-city"
                        maxLength={100}
                        {...register('city')}
                        error={errors.city?.message}
                      />
                      <Input
                        label="State"
                        id="event-state"
                        maxLength={100}
                        {...register('state')}
                        error={errors.state?.message}
                      />
                    </div>
                  </section>
                  <section
                    className={styles.formSection}
                    aria-label="Activity saving guidance"
                  >
                    <h3>Ceremony Activities</h3>
                    <p className={styles.hint}>
                      {record
                        ? 'Save your ceremony changes first. Then use Add Activity or Edit beside a saved activity to save each activity separately.'
                        : 'Create this ceremony first, then open it to add and save activities individually.'}
                    </p>
                  </section>
                </fieldset>
              </form>
            ) : (
              record && (
                <section className={styles.details}>
                  <div className={styles.badges}>
                    <span className={styles.status}>
                      {
                        eventStatuses.find(
                          ([key]) => key === record.status,
                        )?.[1]
                      }
                    </span>
                    <span>
                      {eventTypes.find(([key]) => key === record.type)?.[1]}
                    </span>
                  </div>
                  <h3>{eventDate(record.startAt)}</h3>
                  <p>{eventRange(record)} · IST</p>
                  {record.description && (
                    <p className={styles.description}>{record.description}</p>
                  )}
                  <h3>Venue &amp; Location</h3>
                  {record.venue?.source === 'GOOGLE' &&
                    record.venue.googlePlaceId && (
                      <GoogleVenueDetails
                        placeId={record.venue.googlePlaceId}
                      />
                    )}
                  <p>
                    {record.venue?.name ||
                      (record.venue?.source === 'GOOGLE'
                        ? 'No custom venue label entered'
                        : 'Venue not specified')}
                  </p>
                  <p>
                    {[
                      record.venue?.formattedAddress,
                      record.venue?.city,
                      record.venue?.state,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  {map && record.venue?.source !== 'GOOGLE' && (
                    <a
                      className={styles.mapLink}
                      href={map}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in Maps <ExternalLink size={14} />
                    </a>
                  )}
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={
                      pending ||
                      !!connectionError ||
                      !!activityEditor ||
                      removeConfirm
                    }
                    onClick={latest}
                  >
                    Refresh event details
                  </button>
                  {!canEdit && (
                    <p className={styles.hint}>
                      <LockKeyhole size={14} /> Viewer access · Read only
                    </p>
                  )}
                </section>
              )
            )}
            {!editing && (
              <ActivityList
                sectionRef={activitySummary}
                activities={record?.activities}
                warnings={warnings}
                onAdd={canEdit ? () => startActivity() : undefined}
                onEdit={canEdit ? (row) => startActivity(row) : undefined}
                onRemove={
                  canEdit ? (row) => startActivity(row, 'REMOVE') : undefined
                }
                disabled={
                  pending ||
                  !!connectionError ||
                  !!activityEditor ||
                  removeConfirm ||
                  discard ||
                  conflict
                }
              />
            )}
            {activityEditor && (
              <section
                ref={activitySection}
                className={styles.formSection}
                aria-label="Activity editor"
              >
                {activityEditor.operation === 'REMOVE' ? (
                  <div className={styles.activityRow}>
                    <h3>Remove {activityEditor.name}?</h3>
                    <p className={styles.hint}>
                      Only this activity will be removed. The ceremony stays in
                      your schedule.
                    </p>
                    <div className={styles.activityActions}>
                      <button
                        type="button"
                        className={styles.primary}
                        disabled={
                          pending || !!connectionError || discard || conflict
                        }
                        onClick={() => saveActivity({})}
                      >
                        {pending ? 'Removing activity…' : 'Confirm Remove'}
                      </button>
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={pending}
                        onClick={cancelActivity}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <ActivityForm
                    form={activityForm}
                    record={record}
                    activityId={activityEditor.id}
                    pending={pending}
                    disabled={
                      pending || !!connectionError || discard || conflict
                    }
                    onSave={saveActivity}
                    onCancel={cancelActivity}
                    canAddAnother={
                      (record.activities || []).length <
                      activityLimit - (activityEditor.id ? 0 : 1)
                    }
                  />
                )}
              </section>
            )}
            <CeremonyTasks
              weddingId={wedding.id}
              event={record}
              canEdit={canEdit}
              disabled={
                pending ||
                !!connectionError ||
                discard ||
                removeConfirm ||
                conflict
              }
              onNavigate={navigateTasks}
            />
            {record && !editing && !activityEditor && (
              <div className={styles.deletePreview}>
                {canRemove ? (
                  <button
                    type="button"
                    className={styles.dangerButton}
                    disabled={
                      pending ||
                      !!connectionError ||
                      discard ||
                      conflict ||
                      removeConfirm
                    }
                    onClick={() => {
                      setRemoveConfirm(true);
                      setError('');
                      setNotice('');
                    }}
                  >
                    <Trash2 size={16} /> Remove Event
                  </button>
                ) : (
                  <p>Only an Admin can remove or restore whole events.</p>
                )}
                <p>
                  Removed ceremonies can be restored from{' '}
                  <Link href="/recovery">Deleted Items Recovery</Link>.
                  Activities and history are retained.
                </p>
              </div>
            )}
          </div>
          <footer className={styles.drawerFooter}>
            {removeConfirm && (
              <section
                className={styles.discardDecision}
                role="group"
                aria-label="Confirm event removal"
              >
                <h3>Remove “{record.name}”?</h3>
                <p>
                  This ceremony will leave the schedule. Its{' '}
                  {record.activityCount}{' '}
                  {record.activityCount === 1 ? 'activity' : 'activities'} and
                  history are kept for restoration. Related records are not
                  deleted.
                </p>
                <div className={styles.actions}>
                  <button
                    ref={keepEvent}
                    type="button"
                    className={styles.secondary}
                    disabled={pending}
                    onClick={() => setRemoveConfirm(false)}
                  >
                    Keep Event
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    disabled={pending || !!connectionError || conflict}
                    onClick={removeEvent}
                  >
                    {pending ? 'Removing event…' : 'Confirm Remove Event'}
                  </button>
                </div>
              </section>
            )}
            <button
              type="button"
              className={styles.secondary}
              onClick={close}
              disabled={pending || discard || removeConfirm}
            >
              Close
            </button>
            {editing ? (
              <button
                key="save"
                type="submit"
                form="event-form"
                className={styles.primary}
                disabled={
                  pending ||
                  discard ||
                  !!connectionError ||
                  conflict ||
                  !canEdit
                }
              >
                {pending
                  ? 'Saving event…'
                  : record
                    ? 'Save Changes'
                    : 'Create Event'}
              </button>
            ) : (
              canEdit &&
              !activityEditor &&
              !removeConfirm && (
                <button
                  key="edit"
                  type="button"
                  className={styles.primary}
                  disabled={pending || !!connectionError}
                  onClick={(event) => {
                    event.preventDefault();
                    setEditing(true);
                    setNotice('');
                    setError('');
                  }}
                >
                  Edit event
                </button>
              )
            )}
          </footer>
          <DiscardChangesDialog
            open={discard}
            pending={pending}
            title={
              activityEditor
                ? 'Discard unsaved activity changes?'
                : 'Discard unsaved event changes?'
            }
            description={
              taskDestination
                ? 'Your changes have not been saved. Keep editing to save them, or discard these changes to open Tasks.'
                : activityEditor
                  ? 'Your activity changes have not been saved. Keep editing to finish this activity, or discard these changes to continue.'
                  : 'Your event changes have not been saved. Keep editing to finish this ceremony, or discard these changes to continue.'
            }
            onKeepEditing={() => {
              if (!lock.current) setDiscard(false);
            }}
            onDiscard={discardChanges}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
