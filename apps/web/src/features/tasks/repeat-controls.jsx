'use client';
import { Info, Repeat2 } from 'lucide-react';
import { indiaToday, repeatPreview } from './recurrence-data';
import styles from './tasks.module.css';
const units = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month' };
export function RepeatControls({
  values,
  register,
  errors,
  wedding,
  onToggle,
  disabled,
  effectiveFrom = '',
  existing = false,
}) {
  const dates = repeatPreview(values, effectiveFrom);
  const after = values.repeatEndDate > wedding.mainDate;
  return (
    <section className={styles.soft} aria-label="Recurrence settings">
      <div className={styles.sectionTitle}>
        <Repeat2 size={17} />
        <h3>Recurrence Settings</h3>
      </div>
      <label className={styles.disabledLabel}>
        <input
          type="checkbox"
          checked={!!values.repeatEnabled}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
        />
        Repeat task
      </label>
      {!values.repeatEnabled ? (
        <p className={styles.hint}>
          {existing
            ? 'Future generation is stopped. Already created tasks stay available.'
            : 'This is a single task. Enable repeats to create dated copies.'}
        </p>
      ) : (
        <>
          <div className={styles.twoColumns}>
            <label className={styles.field}>
              Repeat Frequency
              <select
                aria-label="Repeat Frequency"
                {...register('repeatFrequency')}
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </label>
            <label className={styles.field}>
              Interval
              <select
                aria-label="Interval"
                {...register('repeatInterval', { valueAsNumber: true })}
              >
                {Array.from({ length: 365 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Every {i + 1} {units[values.repeatFrequency] || 'period'}
                    {i ? 's' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Start date
              <input
                type="date"
                aria-label="Start date"
                min="1000-01-01"
                max="9999-12-31"
                {...register('repeatStartDate')}
              />
            </label>
            <label className={styles.field}>
              End date
              <input
                type="date"
                aria-label="End date"
                min="1000-01-01"
                max="9999-12-31"
                {...register('repeatEndDate')}
              />
            </label>
          </div>
          {(errors.repeatStartDate ||
            errors.repeatEndDate ||
            errors.repeatInterval) && (
            <p role="alert" className={styles.fieldError}>
              {errors.repeatStartDate?.message ||
                errors.repeatEndDate?.message ||
                errors.repeatInterval?.message}
            </p>
          )}
          {after && (
            <div className={styles.warning}>
              <Info size={18} />
              <p>
                This repeat pattern continues after your wedding date. You can
                save the end date you have chosen.
              </p>
            </div>
          )}
          {values.repeatStartDate && values.repeatStartDate < indiaToday() && (
            <p className={styles.hint}>
              The start date anchors the pattern. New patterns begin with
              today’s or the next scheduled repeat; earlier tasks are not
              backfilled.
            </p>
          )}
          <div
            className={styles.repeatPreview}
            aria-label="Upcoming repeat preview"
          >
            <strong>Upcoming dates · IST</strong>
            {dates.length ? (
              <ul>
                {dates.map((date) => (
                  <li key={date}>
                    {new Intl.DateTimeFormat('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'UTC',
                    }).format(new Date(date + 'T12:00:00Z'))}
                    {values.dueTime ? ' · ' + values.dueTime : ' · End of day'}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Choose dates that include an upcoming repeat.</p>
            )}
          </div>
          <p className={styles.hint}>
            Each repeat starts as To Do and is completed separately. Upcoming
            copies cover a 90-day window from the next scheduled date. More
            appear as planning continues. Monthly patterns use the last
            available day in shorter months.
          </p>
        </>
      )}
    </section>
  );
}
