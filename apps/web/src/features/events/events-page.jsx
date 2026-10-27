'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Download,
  ListChecks,
  MapPin,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useSession } from '@/features/auth/session-provider';
import {
  PageHeader,
  FutureButton,
  ComingSoon,
} from '@/features/dashboard/workspace-ui';
import { EventEditor } from './event-editor';
import { EventFilters } from './event-filters';
import {
  readEventFilters,
  eventFilterParams,
  eventFilterUrl,
  emptyEventFilters,
  hasEventFilters,
  filtersForCreatedEvent,
} from './filters';
import {
  eventDate,
  eventRange,
  eventStatuses,
  indiaParts,
  venueLabel,
} from './form-data';
import styles from './events.module.css';

export function EventsPage({ openCreate = false }) {
  const { wedding, membership } = useSession();
  const canEdit = ['ADMIN', 'FAMILY_MEMBER'].includes(membership.role);
  const params = useSearchParams();
  const hasReturnEvent = params.has('event');
  const returnEventId = params.get('event');
  const returnEventValid =
    !hasReturnEvent ||
    (params.getAll('event').length === 1 &&
      /^[a-f\d]{24}$/.test(returnEventId));
  const {
    filters,
    error: filterError,
    key: filterKey,
  } = readEventFilters(params);
  const query = eventFilterParams(filters).toString();
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [returnResult, setReturnResult] = useState(null);
  const [returnAttempt, setReturnAttempt] = useState(0);
  const returnError = !returnEventValid
    ? 'This ceremony link is invalid. Open a ceremony from the schedule.'
    : returnResult?.id === returnEventId &&
        returnResult?.attempt === returnAttempt
      ? returnResult.error
      : '';
  const [locate, setLocate] = useState(null);
  const requestKey = `${filterKey}:${retry}:${locate || ''}`;
  const loading = !filterError && result?.key !== requestKey;
  const list =
    !loading && !filterError && result?.key === requestKey
      ? result.response
      : null;
  const error =
    filterError ||
    detailError ||
    returnError ||
    (result?.key === requestKey ? result.error : '');
  const page = list?.meta.page || Number(filters.page) || 1;
  const [editor, setEditor] = useState(
    openCreate && canEdit ? { event: null } : null,
  );
  const [detail, setDetail] = useState(null);
  const [created, setCreated] = useState(null);
  const [removed, setRemoved] = useState(null);
  const detailRequest = useRef(null);
  const createdCard = useRef(null);
  const successNotice = useRef(null);
  const focusCreated = useRef(false);
  const returnFocus = useRef(null),
    addTrigger = useRef(null);
  const listRequest = useRef(0);
  useEffect(() => {
    if (!openCreate) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('create') !== '1') return;
    url.searchParams.delete('create');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, [openCreate]);
  useEffect(() => {
    if (filterError) return;
    const requestFilters = readEventFilters(new URLSearchParams(query)).filters;
    const controller = new AbortController();
    const sequence = ++listRequest.current;
    const current = () =>
      !controller.signal.aborted &&
      sequence === listRequest.current &&
      readEventFilters(new URL(window.location.href).searchParams).key ===
        filterKey;
    const queryParams = new URLSearchParams(query);
    queryParams.set('limit', '20');
    if (locate) queryParams.set('locate', locate);
    apiRequest(`/weddings/${wedding.id}/events?${queryParams}`, {
      signal: controller.signal,
      timeoutMs: 15000,
    })
      .then((response) => {
        if (!current()) return;
        if (
          locate &&
          !response.meta.located &&
          hasEventFilters(requestFilters)
        ) {
          // A concurrent edit may invalidate the creation snapshot's filter match.
          window.history.replaceState(
            null,
            '',
            eventFilterUrl(window.location.href, emptyEventFilters),
          );
          return;
        }
        // An edit/deletion can empty a later page. Canonicalize the server's bounded page.
        if (response.meta.page !== Number(requestFilters.page)) {
          window.history.replaceState(
            null,
            '',
            eventFilterUrl(window.location.href, {
              ...requestFilters,
              page: response.meta.page,
            }),
          );
        }
        setResult({ key: requestKey, response, error: '' });
        if (locate) setLocate(null);
      })
      .catch((failure) => {
        if (current())
          setResult({
            key: requestKey,
            response: null,
            error: failure.message,
          });
      });
    return () => controller.abort();
  }, [query, filterKey, requestKey, filterError, locate, wedding.id]);
  useEffect(() => () => detailRequest.current?.abort(), []);
  useEffect(() => {
    if (!returnEventId || !returnEventValid) return;
    const controller = new AbortController();
    const current = () =>
      !controller.signal.aborted &&
      new URLSearchParams(window.location.search).get('event') ===
        returnEventId;
    void apiRequest(`/weddings/${wedding.id}/events/${returnEventId}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!current()) return;
        setEditor({
          event: response.data.event,
          warnings: response.data.warnings,
        });
        setReturnResult({ id: returnEventId, attempt: returnAttempt });
      })
      .catch((failure) => {
        if (current())
          setReturnResult({
            id: returnEventId,
            attempt: returnAttempt,
            error: failure.message,
          });
      });
    return () => controller.abort();
  }, [returnEventId, returnEventValid, wedding.id, returnAttempt]);
  function closeEditor() {
    setEditor(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has('event')) {
      url.searchParams.delete('event');
      window.history.replaceState(
        null,
        '',
        url.pathname + url.search + url.hash,
      );
    }
  }
  useEffect(() => {
    if (!focusCreated.current || loading || editor) return;
    const target = createdCard.current || successNotice.current;
    if (!target) return;
    focusCreated.current = false;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center' });
  }, [list, loading, editor]);
  function refresh() {
    listRequest.current++;
    setDetailError('');
    setRetry((value) => value + 1);
  }
  function saved(result) {
    listRequest.current++;
    if (result.removed) {
      closeEditor();
      setCreated(null);
      setRemoved(result.event.name);
      setDetailError('');
      refresh();
      return;
    }
    setRemoved(null);
    if (result.created) {
      setCreated(result);
      focusCreated.current = true;
      returnFocus.current = null;
      setEditor(null);
      const next = filtersForCreatedEvent(
        filterError ? emptyEventFilters : filters,
        result.event,
      );
      setLocate(result.event.id);
      window.history.replaceState(
        null,
        '',
        eventFilterUrl(window.location.href, next),
      );
    } else setCreated(null);
    refresh();
  }
  function applyFilters(next) {
    listRequest.current++;
    setRetry((value) => value + 1);
    setCreated(null);
    detailRequest.current?.abort();
    setDetail(null);
    setDetailError('');
    setLocate(null);
    window.history.pushState(
      null,
      '',
      eventFilterUrl(window.location.href, next),
    );
  }
  function create(event) {
    detailRequest.current?.abort();
    setDetail(null);
    setCreated(null);
    returnFocus.current = event.currentTarget;
    setEditor({ event: null });
  }
  async function open(event) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setDetail(event.id);
    setDetailError('');
    try {
      const response = await apiRequest(
        `/weddings/${wedding.id}/events/${event.id}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted)
        setEditor({
          event: response.data.event,
          warnings: response.data.warnings,
        });
    } catch (failure) {
      if (!controller.signal.aborted) setDetailError(failure.message);
    } finally {
      if (detailRequest.current === controller) {
        detailRequest.current = null;
        setDetail(null);
      }
    }
  }
  const events = list?.data.events || [];
  const groups = Object.groupBy(events, (event) =>
    eventDate(event.startAt, {
      day: undefined,
      month: 'long',
      year: 'numeric',
    }),
  );
  return (
    <div className={styles.page}>
      {returnEventId &&
        returnEventValid &&
        (returnResult?.id !== returnEventId ||
          returnResult?.attempt !== returnAttempt) && (
          <p role="status">Opening ceremony…</p>
        )}
      {returnError && returnEventValid && (
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setReturnAttempt((value) => value + 1)}
        >
          Retry ceremony
        </button>
      )}
      {returnError && (
        <button
          type="button"
          className={styles.secondary}
          onClick={closeEditor}
        >
          Dismiss ceremony link
        </button>
      )}
      <PageHeader
        eyebrow="Master Itinerary"
        title="Ceremony Schedule & Events"
        description="Your wedding celebrations, venues and timings in one shared schedule."
      >
        <FutureButton>
          <Download size={16} />
          Export Run of Show
        </FutureButton>
        {canEdit && (
          <button
            ref={addTrigger}
            type="button"
            className={styles.primary}
            onClick={create}
          >
            <Plus size={17} />
            Add Event
          </button>
        )}
      </PageHeader>
      {!canEdit && (
        <p className={styles.notice}>
          Viewer access · You can view ceremonies and venue directions.
        </p>
      )}
      {removed && (
        <section className={styles.createdNotice} aria-label="Removed event">
          <p role="status">
            <strong>{removed}</strong> was removed from the schedule. Its
            activities and history are retained.
          </p>
          <Link className={styles.secondary} href="/recovery">
            Open Deleted Items Recovery
          </Link>
        </section>
      )}
      {created && (
        <section
          ref={successNotice}
          tabIndex={-1}
          className={styles.createdNotice}
          aria-label="Created event"
        >
          <p role="status">
            <strong>
              {created.replayed
                ? 'Your earlier event creation is confirmed.'
                : 'Event created successfully.'}
            </strong>{' '}
            {created.event.name}
          </p>
          {created.event.activityCount === 0 && (
            <p>Open this ceremony to add and save its activities.</p>
          )}
          {created.warnings?.map((warning) => (
            <p key={warning.code}>{warning.message}</p>
          ))}
          <button
            type="button"
            className={styles.secondary}
            disabled={!!detail}
            onClick={(click) => {
              returnFocus.current = click.currentTarget;
              open(created.event);
            }}
          >
            View created event
          </button>
        </section>
      )}
      <EventFilters
        filterKey={filterKey}
        filters={filters}
        counts={list?.meta.statusCounts}
        onApply={applyFilters}
      />
      {error && (
        <div role="alert" className={styles.error}>
          <p>{error}</p>
          <button
            type="button"
            onClick={
              filterError ? () => applyFilters(emptyEventFilters) : refresh
            }
            className={styles.secondary}
          >
            {filterError ? 'Clear invalid filters' : 'Retry loading events'}
          </button>
        </div>
      )}
      <div className={styles.layout}>
        <section aria-label="Ceremony schedule" aria-busy={loading}>
          <div className={styles.scheduleHeader}>
            <span className={styles.eyebrow}>Your ceremony schedule</span>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className={styles.refresh}
            >
              <RefreshCw size={14} />
              Refresh schedule
            </button>
          </div>
          {loading && (
            <p role="status" className={styles.loading}>
              Loading your ceremonies…
            </p>
          )}
          {!loading && !error && events.length === 0 && (
            <div className={styles.empty}>
              <CalendarDays size={30} />
              <h2>
                {hasEventFilters(filters)
                  ? 'No ceremonies match these filters'
                  : 'Your ceremony schedule starts here'}
              </h2>
              <p>
                {hasEventFilters(filters)
                  ? 'Try a different search, status or date range, or clear the filters to see your schedule.'
                  : canEdit
                    ? 'Add your first event to begin planning its timing and venue.'
                    : 'Your family has not added any ceremonies yet.'}
              </p>
              {hasEventFilters(filters) ? (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => applyFilters(emptyEventFilters)}
                >
                  Clear filters
                </button>
              ) : (
                canEdit && (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={create}
                  >
                    Add your first event
                  </button>
                )
              )}
            </div>
          )}
          {Object.entries(groups).map(([label, items]) => (
            <section key={label} className={styles.group}>
              <h2>{label}</h2>
              {items.map((event) => {
                const day = indiaParts(event.startAt).date;
                const overnight = day !== indiaParts(event.endAt).date;
                return (
                  <button
                    type="button"
                    key={event.id}
                    ref={
                      created?.event.id === event.id ? createdCard : undefined
                    }
                    className={`${styles.eventCard} ${created?.event.id === event.id ? styles.justCreated : ''}`}
                    aria-label={`View ${event.name}`}
                    onClick={(click) => {
                      returnFocus.current = click.currentTarget;
                      open(event);
                    }}
                    disabled={!!detail}
                  >
                    <div className={styles.eventIdentity}>
                      <div className={styles.dateTile}>
                        <span>
                          {eventDate(event.startAt, {
                            day: undefined,
                            month: 'short',
                            year: undefined,
                          })}
                        </span>
                        <strong>{day.slice(-2)}</strong>
                      </div>
                      <div className={styles.eventCopy}>
                        <div className={styles.badges}>
                          <h3>{event.name}</h3>
                          <span
                            className={`${styles.status} ${event.status === 'CONFIRMED' ? styles.confirmed : ''}`}
                          >
                            {
                              eventStatuses.find(
                                ([key]) => key === event.status,
                              )?.[1]
                            }
                          </span>
                          {overnight && (
                            <span className={styles.overnight}>Overnight</span>
                          )}
                        </div>
                        <div className={styles.eventMeta}>
                          <span>
                            <Clock3 size={15} />
                            {eventRange(event)} · IST
                          </span>
                          <span>
                            <MapPin size={15} />
                            {venueLabel(event.venue)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={styles.cardTail}>
                      <span>
                        <ListChecks size={14} /> {event.activityCount || 0}{' '}
                        {(event.activityCount || 0) === 1
                          ? 'activity'
                          : 'activities'}{' '}
                        · {event.taskCount ?? 0}{' '}
                        {(event.taskCount ?? 0) === 1 ? 'task' : 'tasks'}
                      </span>
                      {detail === event.id ? (
                        <span>Opening…</span>
                      ) : (
                        <ChevronRight size={20} />
                      )}
                    </div>
                  </button>
                );
              })}
            </section>
          ))}
          {list && (
            <nav className={styles.pagination} aria-label="Event pages">
              <span>
                {list.meta.total}{' '}
                {hasEventFilters(filters) ? 'matching' : 'saved'}{' '}
                {list.meta.total === 1 ? 'event' : 'events'} · Page {page} of{' '}
                {Math.max(1, list.meta.totalPages)}
              </span>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={loading || page === 1}
                  onClick={() => {
                    applyFilters({ ...filters, page: page - 1 });
                  }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={loading || page >= list.meta.totalPages}
                  onClick={() => {
                    applyFilters({ ...filters, page: page + 1 });
                  }}
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </section>
        <aside className={styles.aside}>
          <section className={styles.sideCard}>
            <div className={styles.sectionTitle}>
              <MapPin size={18} />
              <h2>Venues &amp; Locations</h2>
            </div>
            <p>
              Open a ceremony to see its venue, your entered directions and an
              Open in Maps link.
            </p>
            <div className={styles.soft}>
              <h3>Venue search</h3>
              <p>
                Search Google Maps when adding or editing a ceremony, or enter a
                venue manually. Linked Google details load when you open the
                ceremony.
              </p>
            </div>
          </section>
          <section className={styles.sideCard}>
            <h2>Timeline Readiness</h2>
            <p>
              Ceremony activities and timing warnings are available inside each
              event. Task-based readiness summaries are coming in a later
              increment.
            </p>
            <ComingSoon />
          </section>
        </aside>
      </div>
      {editor &&
        (!hasReturnEvent ||
          (returnEventValid && editor.event?.id === returnEventId)) && (
          <EventEditor
            key={editor.event?.id || 'create'}
            wedding={wedding}
            event={editor.event}
            initialWarnings={editor.warnings}
            canEdit={canEdit}
            onClose={closeEditor}
            onSaved={saved}
            onReturnFocus={() => {
              const target = returnFocus.current?.isConnected
                ? returnFocus.current
                : addTrigger.current;
              target?.focus();
            }}
          />
        )}
    </div>
  );
}
