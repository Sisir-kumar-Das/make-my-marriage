'use client';
import { useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useTaskChoices } from './use-task-choices';
import { taskStatuses, taskPriorities } from './form-data';
import { emptyTaskFilters, taskFilterSchema } from './filters';
import styles from './tasks.module.css';

export function TaskFilters({ weddingId, filters, filterKey, onApply }) {
  const form = useRef(null);
  const [draftState, setDraftState] = useState({ key: filterKey, value: null });
  const [failure, setFailure] = useState(null);
  // Forget unapplied edits when URL identity changes, including Back to an earlier URL.
  // React retries this render before committing children; controls keep their identity/focus.
  if (draftState.key !== filterKey) {
    setDraftState({ key: filterKey, value: null });
    if (failure) setFailure(null);
  }
  const draft =
    draftState.key === filterKey && draftState.value
      ? draftState.value
      : filters;
  function change(event) {
    setDraftState({
      key: filterKey,
      value: { ...draft, [event.target.name]: event.target.value },
    });
  }
  const members = useTaskChoices(weddingId, 'members'),
    events = useTaskChoices(weddingId, 'events');
  function apply(overrides = {}) {
    const raw = Object.fromEntries(new FormData(form.current));
    const parsed = taskFilterSchema.safeParse({
      ...emptyTaskFilters,
      ...raw,
      view: filters.view,
      page: 1,
      ...overrides,
    });
    if (!parsed.success) {
      setFailure({ key: filterKey, message: parsed.error.issues[0].message });
      return;
    }
    setFailure(null);
    setDraftState({ key: filterKey, value: null });
    onApply(parsed.data);
  }
  const options = [
    ['members', 'assigneeId', 'Assignee', members],
    ['events', 'eventId', 'Ceremony', events],
  ];
  return (
    <section className={styles.filters} aria-label="Task filters">
      <form
        ref={form}
        className={styles.filterForm}
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <div className={styles.filterControls}>
          <label className={styles.search}>
            <Search size={16} aria-hidden="true" />
            <input
              name="q"
              type="search"
              maxLength={160}
              value={draft.q}
              onChange={change}
              placeholder="Search task titles and notes…"
              aria-label="Search task titles and notes"
            />
          </label>
          <select
            name="status"
            aria-label="Task status filter"
            value={draft.status}
            onChange={change}
          >
            <option value="">Status: All</option>
            {taskStatuses.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            name="priority"
            aria-label="Task priority filter"
            value={draft.priority}
            onChange={change}
          >
            <option value="">Priority: All</option>
            {taskPriorities.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {options.map(([kind, key, label, choices]) => (
            <select
              key={key}
              name={key}
              aria-label={`${label} filter`}
              value={draft[key]}
              onChange={change}
            >
              <option value="">{label}: All</option>
              <option value={kind === 'members' ? 'unassigned' : 'none'}>
                {kind === 'members'
                  ? 'Unassigned'
                  : 'Wedding-wide · No ceremony'}
              </option>
              {filters[key] &&
                !['unassigned', 'none'].includes(filters[key]) &&
                !choices.rows.some((row) => row.id === filters[key]) && (
                  <option value={filters[key]}>
                    Selected {label.toLowerCase()} · Not loaded or unavailable
                  </option>
                )}
              {choices.rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          ))}
        </div>
        <div className={styles.dateFilters}>
          {['from', 'to'].map((key) => (
            <label key={key}>
              {key === 'from' ? 'From' : 'To'}
              <input
                type="date"
                min="1000-01-01"
                max="9999-12-31"
                name={key}
                value={draft[key]}
                onChange={change}
              />
            </label>
          ))}
          <span>Due dates · IST</span>
          <button type="submit" className={styles.secondary}>
            Apply filters
          </button>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => {
              setFailure(null);
              setDraftState({ key: filterKey, value: null });
              onApply({ ...emptyTaskFilters, view: filters.view });
            }}
          >
            Reset filters
          </button>
        </div>
        <input type="hidden" name="overdue" value={filters.overdue} />
        <input type="hidden" name="recurring" value={filters.recurring} />
        <div className={styles.quickFilters}>
          <span>Quick Filters:</span>
          <button
            type="button"
            aria-pressed={filters.recurring === 'true'}
            onClick={() =>
              apply({ recurring: filters.recurring === 'true' ? '' : 'true' })
            }
          >
            Has Recurrence
          </button>
          {filters.recurring === 'false' && (
            <button type="button" onClick={() => apply({ recurring: '' })}>
              Single tasks · Clear
            </button>
          )}
          <button
            type="button"
            aria-pressed={filters.overdue === 'true'}
            onClick={() =>
              apply({ overdue: filters.overdue === 'true' ? '' : 'true' })
            }
          >
            Overdue
          </button>
          <button type="button" disabled>
            Due This Week · Coming soon
          </button>
          {filters.overdue === 'false' && (
            <button type="button" onClick={() => apply({ overdue: '' })}>
              Not overdue · Clear
            </button>
          )}
        </div>
      </form>
      {failure?.key === filterKey && (
        <p role="alert" className={styles.fieldError}>
          {failure.message}
        </p>
      )}
      <p className={styles.hint}>
        All filters combine. Search checks titles and notes. From/To include the
        full India day; tasks without a deadline do not match a date range.
        Overdue means incomplete with a passed deadline. Counts follow the
        applied filters.
      </p>
      <div className={styles.choiceActions}>
        {options.map(([kind, , label, choices]) => (
          <div key={kind}>
            {choices.loading ? (
              <span role="status">Loading {label.toLowerCase()} choices…</span>
            ) : choices.error ? (
              <span role="status">
                {label} choices could not load. Your filters are kept.
              </span>
            ) : null}
            <button
              type="button"
              className={styles.textButton}
              disabled={choices.loading}
              aria-label={`${choices.error ? 'Retry' : 'Refresh'} ${label.toLowerCase()} choices`}
              onClick={choices.error ? choices.retry : choices.refresh}
            >
              {choices.error ? 'Retry' : 'Refresh'} {label.toLowerCase()}{' '}
              choices
            </button>
            {!choices.loading &&
              !choices.error &&
              choices.page < choices.totalPages && (
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={choices.more}
                >
                  Load more {label.toLowerCase()} choices
                </button>
              )}
          </div>
        ))}
      </div>
    </section>
  );
}
