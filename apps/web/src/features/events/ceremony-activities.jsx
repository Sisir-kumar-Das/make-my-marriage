'use client';

import { useWatch } from 'react-hook-form';
import { Plus, AlertTriangle, Clock3 } from 'lucide-react';
import {
  activityDuration,
  activityTimingWarnings,
  activityInput,
  activityWriteBody,
  activityFormSchema,
  activityLimit,
} from './activity-data';
import { eventDate, eventTime, eventRange } from './form-data';
import styles from './events.module.css';

function Field({ label, id, error, children, ...props }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {children || (
        <input
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
      )}
      {error && (
        <p className={styles.fieldError} id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function ActivityForm({
  form,
  record,
  activityId,
  pending,
  disabled,
  onSave,
  onCancel,
  canAddAnother,
}) {
  const {
    register,
    control,
    formState: { errors },
    setValue,
  } = form;
  const row = useWatch({ control });
  const parsed = activityFormSchema.safeParse(row);
  const candidate = parsed.success ? activityInput(parsed.data) : null;
  const duration = candidate ? activityDuration(candidate) : null;
  const warnings = candidate
    ? activityTimingWarnings({
        ...record,
        activities: [
          ...(record.activities || [])
            .filter((item) => item.id !== activityId)
            .map((item) => ({ ...item, _id: item.id })),
          { ...candidate, _id: activityId || 'new-activity' },
        ],
      })
    : [];
  return (
    <form
      id="activity-form"
      noValidate
      onSubmit={form.handleSubmit((values) =>
        onSave(activityWriteBody(values), false),
      )}
      className={styles.activityForm}
    >
      <fieldset
        disabled={disabled}
        className={`${styles.activityRow} ${warnings.some((warning) => warning.activityIds.includes(activityId || 'new-activity')) ? styles.activityFlagged : ''}`}
      >
        <legend>
          {activityId ? 'Edit activity' : 'New activity'} · Unsaved changes
        </legend>
        <p className={styles.hint}>
          Save this activity below. Ceremony details are unchanged.
        </p>
        <div className={styles.twoColumns}>
          <Field
            label="Activity name"
            id="activity-name"
            maxLength={160}
            required
            error={errors.name?.message}
            {...register('name')}
          />
          <Field
            label="Start time · IST"
            id="activity-start-time"
            type="time"
            required
            error={errors.startTime?.message}
            {...register('startTime')}
          />
        </div>
        <Field
          label="Start date"
          id="activity-start-date"
          type="date"
          required
          error={errors.startDate?.message}
          {...register('startDate')}
        />
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            {...register('hasEnd')}
            onChange={(event) => {
              void register('hasEnd').onChange(event);
              if (event.target.checked && !row.endTime)
                setValue('endDate', row.startDate, { shouldDirty: true });
            }}
          />{' '}
          Set an end time
        </label>
        {row.hasEnd && (
          <div className={styles.twoColumns}>
            <Field
              label="End date"
              id="activity-end-date"
              type="date"
              required
              error={errors.endDate?.message}
              {...register('endDate')}
            />
            <Field
              label="End time · IST"
              id="activity-end-time"
              type="time"
              required
              error={errors.endTime?.message}
              {...register('endTime')}
            />
          </div>
        )}
        <p className={styles.hint}>Duration: {duration || 'Not specified'}</p>
        <div className={styles.field}>
          <label htmlFor="activity-description">Description (optional)</label>
          <textarea
            id="activity-description"
            rows={2}
            maxLength={1000}
            aria-invalid={!!errors.description}
            {...register('description')}
          />
          {errors.description?.message && (
            <p role="alert" className={styles.fieldError}>
              {errors.description.message}
            </p>
          )}
        </div>
        {warnings.map((warning) => (
          <p key={warning.code} className={styles.warning} role="status">
            <AlertTriangle size={16} />{' '}
            {warning.message.replace(
              'Review the highlighted activities',
              'Review these timings',
            )}
          </p>
        ))}
        <div className={styles.activityActions}>
          <button type="submit" className={styles.primary}>
            {pending ? 'Saving activity…' : 'Save Activity'}
          </button>
          {canAddAnother && (
            <button
              type="button"
              className={styles.secondary}
              onClick={form.handleSubmit((values) =>
                onSave(activityWriteBody(values), true),
              )}
            >
              Save &amp; Add Another
            </button>
          )}
          <button type="button" className={styles.secondary} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}
export function ActivityList({
  sectionRef,
  activities = [],
  onAdd,
  onEdit,
  onRemove,
  disabled,
  warnings = [],
}) {
  const flagged = new Set(
    warnings
      .filter((warning) => warning.code.startsWith('ACTIVITY_'))
      .flatMap((warning) => warning.activityIds || []),
  );
  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      className={styles.formSection}
      aria-label="Ceremony activities"
    >
      <div className={styles.sectionTitle}>
        <h3>Ceremony Activities ({activities.length})</h3>
        {onAdd && (
          <button
            type="button"
            className={styles.secondary}
            onClick={onAdd}
            disabled={disabled || activities.length >= activityLimit}
          >
            <Plus size={15} /> Add Activity
          </button>
        )}
      </div>
      {activities.length === 0 && (
        <p className={styles.hint}>No activities added to this ceremony yet.</p>
      )}
      <ol className={styles.activityList}>
        {activities.map((row) => (
          <li
            key={row.id}
            className={`${styles.activityRow} ${flagged.has(row.id) ? styles.activityFlagged : ''}`}
          >
            <div className={styles.activityReadHeading}>
              <Clock3 size={15} />
              <strong>{eventTime(row.startAt)}</strong>
              <h4>{row.name}</h4>
              {flagged.has(row.id) && (
                <span className={styles.hint}>Review timing</span>
              )}
            </div>
            <p className={styles.hint}>
              {eventDate(row.startAt)} ·{' '}
              {row.endAt
                ? `${eventRange(row)} · ${activityDuration(row)}`
                : 'Start time only'}{' '}
              · IST
            </p>
            <span className={styles.savedActivity}>Saved</span>
            {row.description && (
              <p className={`${styles.hint} ${styles.description}`}>
                {row.description}
              </p>
            )}
            {(onEdit || onRemove) && (
              <div className={styles.activityActions}>
                {onEdit && (
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={disabled}
                    onClick={() => onEdit(row)}
                    aria-label={`Edit activity: ${row.name}`}
                  >
                    Edit
                  </button>
                )}
                {onRemove && (
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={disabled}
                    onClick={() => onRemove(row)}
                    aria-label={`Remove activity: ${row.name}`}
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
