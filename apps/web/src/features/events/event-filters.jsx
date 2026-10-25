'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { eventStatuses } from './form-data';
import { emptyEventFilters, eventFilterSchema } from './filters';
import styles from './events.module.css';

export function EventFilters({ filters, filterKey, counts, onApply }) {
  const form = useRef(null);
  const [failure, setFailure] = useState(null);
  const error = failure?.key === filterKey ? failure.message : '';
  useEffect(() => {
    // Reset to the URL's updated default values without unmounting focused controls.
    form.current?.reset();
  }, [filterKey]);
  function apply(status = filters.status) {
    const values = Object.fromEntries(new FormData(form.current));
    const parsed = eventFilterSchema.safeParse({ ...values, status, page: 1 });
    if (!parsed.success) {
      setFailure({ key: filterKey, message: parsed.error.issues[0].message });
      return;
    }
    setFailure(null);
    onApply(parsed.data);
  }
  return (
    <section className={styles.filters} aria-label="Event filters">
      <form
        ref={form}
        className={styles.filterForm}
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <label className={styles.search}>
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search ceremonies and venues"
            placeholder="Search ceremonies and venues…"
            maxLength={160}
            name="q"
            defaultValue={filters.q}
          />
        </label>
        <div className={styles.dateFilters}>
          {['from', 'to'].map((key) => (
            <label key={key}>
              {key === 'from' ? 'From' : 'To'}
              <input
                type="date"
                min="1000-01-01"
                max="9999-12-31"
                name={key}
                defaultValue={filters[key]}
              />
            </label>
          ))}
          <span className={styles.timezone}>IST</span>
        </div>
        <button type="submit" className={styles.secondary}>
          Apply filters
        </button>
        <button
          type="button"
          className={styles.refresh}
          onClick={() => {
            form.current.reset();
            setFailure(null);
            onApply(emptyEventFilters);
          }}
        >
          Clear filters
        </button>
      </form>
      <div
        className={styles.filterButtons}
        role="group"
        aria-label="Event status"
      >
        {[['', 'All'], ...eventStatuses].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filters.status === key}
            className={filters.status === key ? styles.activeFilter : undefined}
            onClick={() => apply(key)}
          >
            {label} ({counts?.[key || 'ALL'] ?? '—'})
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className={styles.filterError}>
          {error}
        </p>
      )}
      <p className={styles.filterHint}>
        Counts follow your applied search and dates. Date ranges include
        overnight ceremonies · India time. Search uses ceremony names and your
        entered venue details.
      </p>
    </section>
  );
}
