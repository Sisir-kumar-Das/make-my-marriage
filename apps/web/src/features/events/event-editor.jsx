'use client';

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
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useSession } from '@/features/auth/session-provider';
import { FutureButton, ComingSoon } from '@/features/dashboard/workspace-ui';
import {
  eventTypes,
  eventStatuses,
  eventFormSchema,
  initialEvent,
  eventInput,
  nextDate,
  mapsLink,
  eventDate,
  eventRange,
} from './form-data';
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
  const { connectionError, retrySession } = useSession();
  const [record, setRecord] = useState(event);
  const [editing, setEditing] = useState(!event);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [warnings, setWarnings] = useState(initialWarnings);
  const [pending, setPending] = useState(false);
  const lock = useRef(false),
    attempt = useRef(null);
  const keepEditingButton = useRef(null);
  const closeButton = useRef(null);
  const discardFocus = useRef(null);
  const failureNotice = useRef(null);
  useEffect(() => {
    if (!error) return;
    failureNotice.current?.focus({ preventScroll: true });
    failureNotice.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);
  useEffect(() => {
    if (discard) keepEditingButton.current?.focus();
    else if (discardFocus.current) {
      const target = discardFocus.current.isConnected
        ? discardFocus.current
        : closeButton.current;
      discardFocus.current = null;
      target?.focus();
    }
  }, [discard]);
  const {
    register,
    control,
    getValues,
    setValue,
    reset,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(eventFormSchema),
    defaultValues: initialEvent(wedding, event),
  });
  const [startDate, endDate] = useWatch({
    control,
    name: ['startDate', 'endDate'],
  });
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
    if (lock.current) return;
    if (editing && isDirty) {
      if (!discard) discardFocus.current = document.activeElement;
      setDiscard(true);
      return;
    }
    onClose();
  }
  function discardChanges() {
    if (lock.current) return;
    discardFocus.current = null;
    onClose();
  }
  async function latest() {
    if (lock.current) return;
    lock.current = true;
    discardFocus.current = null;
    setDiscard(false);
    setPending(true);
    setError('');
    try {
      const response = await apiRequest(
        `/weddings/${wedding.id}/events/${record.id}`,
      );
      setRecord(response.data.event);
      setWarnings(response.data.warnings);
      reset(initialEvent(wedding, response.data.event));
      attempt.current = null;
      setConflict(false);
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
    if (lock.current || connectionError || !canEdit) return;
    lock.current = true;
    discardFocus.current = null;
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
              <div className={styles.error} role="alert">
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
            {warnings.map((warning) => (
              <p key={warning.code} className={styles.warning}>
                <AlertTriangle size={17} />
                {warning.message}
              </p>
            ))}
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
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Input>
                  </div>
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
                    <div className={styles.places}>
                      <input
                        disabled
                        aria-label="Google Places venue search coming soon"
                        placeholder="Venue search · Coming soon"
                      />
                      <ComingSoon />
                    </div>
                    <p className={styles.hint}>
                      Enter a venue or address manually. Google Places search
                      follows in a later Events increment.
                    </p>
                    <Input
                      label="Venue name"
                      id="event-venue"
                      maxLength={200}
                      placeholder="Venue, hall or family home"
                      {...register('venueName')}
                      error={errors.venueName?.message}
                    />
                    <Input
                      as="textarea"
                      label="Full address / hall details"
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
                  <p>{record.venue?.name || 'Venue not specified'}</p>
                  <p>
                    {[
                      record.venue?.formattedAddress,
                      record.venue?.city,
                      record.venue?.state,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  {map && (
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
                    disabled={pending || !!connectionError}
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
            <section className={styles.formSection}>
              <div className={styles.sectionTitle}>
                <h3>Ceremony Activities</h3>
                <FutureButton>Add Activity</FutureButton>
              </div>
              <p className={styles.hint}>
                The smaller moments within this ceremony · Coming soon
              </p>
            </section>
            <section className={styles.formSection}>
              <div className={styles.sectionTitle}>
                <h3>Linked Tasks</h3>
                <ComingSoon />
              </div>
              <p className={styles.hint}>
                Task assignments and readiness will appear when Tasks is built.
              </p>
            </section>
            <div className={styles.deletePreview}>
              <FutureButton>Remove Event</FutureButton>
              <p>
                Safe deletion and restoration follow in their agreed Events
                increment.
              </p>
            </div>
          </div>
          <footer className={styles.drawerFooter}>
            {discard && (
              <section
                className={styles.discardDecision}
                role="group"
                aria-labelledby="event-discard-question"
              >
                <p id="event-discard-question">
                  Discard your unsaved event changes?
                </p>
                <div className={styles.actions}>
                  <button
                    ref={keepEditingButton}
                    type="button"
                    className={styles.secondary}
                    disabled={pending}
                    onClick={() => {
                      if (!lock.current) setDiscard(false);
                    }}
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={pending}
                    onClick={discardChanges}
                  >
                    Discard changes
                  </button>
                </div>
              </section>
            )}
            <button
              ref={closeButton}
              type="button"
              className={styles.secondary}
              onClick={close}
              disabled={pending || discard}
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
              canEdit && (
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
