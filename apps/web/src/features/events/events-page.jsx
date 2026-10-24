'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Download,
  ListChecks,
  MapPin,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useSession } from '@/features/auth/session-provider';
import {
  PageHeader,
  FutureButton,
  ComingSoon,
} from '@/features/dashboard/workspace-ui';
import { EventEditor } from './event-editor';
import { eventDate, eventRange, eventStatuses, indiaParts } from './form-data';
import styles from './events.module.css';

export function EventsPage({ openCreate = false }) {
  const { wedding, membership } = useSession();
  const canEdit = ['ADMIN', 'FAMILY_MEMBER'].includes(membership.role);
  const [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  const [list, setList] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [editor, setEditor] = useState(
    openCreate && canEdit ? { event: null } : null,
  );
  const [detail, setDetail] = useState(null);
  const [created, setCreated] = useState(null);
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
    const controller = new AbortController();
    const sequence = ++listRequest.current;
    apiRequest(`/weddings/${wedding.id}/events?page=${page}&limit=20`, {
      signal: controller.signal,
      timeoutMs: 15000,
    })
      .then((response) => {
        if (!controller.signal.aborted && sequence === listRequest.current) {
          setList(response);
          setError('');
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted && sequence === listRequest.current)
          setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted && sequence === listRequest.current)
          setLoading(false);
      });
    return () => controller.abort();
  }, [page, retry, wedding.id]);
  useEffect(() => () => detailRequest.current?.abort(), []);
  useEffect(() => {
    if (!focusCreated.current || loading || editor) return;
    const target = createdCard.current || successNotice.current;
    if (!target) return;
    focusCreated.current = false;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center' });
  }, [list, loading, editor]);
  function refresh() {
    setLoading(true);
    setRetry((value) => value + 1);
  }
  function saved(result) {
    if (result.created) {
      setCreated(result);
      focusCreated.current = true;
      returnFocus.current = null;
      setEditor(null);
      setPage(Math.max(1, Math.ceil((result.schedulePosition || 1) / 20)));
    } else setCreated(null);
    refresh();
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
    setError('');
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
      if (!controller.signal.aborted) setError(failure.message);
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
      <section
        className={styles.filters}
        aria-label="Event filters coming soon"
      >
        <div className={styles.search}>
          <Search size={17} />
          <input
            disabled
            aria-label="Search events coming soon"
            placeholder="Search events… Coming soon"
          />
        </div>
        <div className={styles.filterButtons}>
          <span className={styles.activeFilter}>All Events</span>
          {eventStatuses.map(([key, label]) => (
            <button key={key} type="button" disabled>
              {label}
            </button>
          ))}
          <ComingSoon />
        </div>
      </section>
      {error && (
        <div role="alert" className={styles.error}>
          <p>{error}</p>
          <button type="button" onClick={refresh} className={styles.secondary}>
            Retry loading events
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
              <h2>Your ceremony schedule starts here</h2>
              <p>
                {canEdit
                  ? 'Add your first event to begin planning its timing and venue.'
                  : 'Your family has not added any ceremonies yet.'}
              </p>
              {canEdit && (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={create}
                >
                  Add your first event
                </button>
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
                            {[event.venue?.name, event.venue?.city]
                              .filter(Boolean)
                              .join(', ') || 'Venue to be decided'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={styles.cardTail}>
                      <span>
                        <ListChecks size={14} /> Tasks &amp; activities · Coming
                        soon
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
                {list.meta.total} saved{' '}
                {list.meta.total === 1 ? 'event' : 'events'} · Page {page} of{' '}
                {Math.max(1, list.meta.totalPages)}
              </span>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={loading || page === 1}
                  onClick={() => {
                    setLoading(true);
                    setPage((value) => value - 1);
                  }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={loading || page >= list.meta.totalPages}
                  onClick={() => {
                    setLoading(true);
                    setPage((value) => value + 1);
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
              Open a ceremony to see its saved venue, address and Open in Maps
              link.
            </p>
            <div className={styles.soft}>
              <h3>Venue search</h3>
              <p>
                Manual venue details work now. Google Places search and venue
                summaries follow within Events.
              </p>
              <ComingSoon />
            </div>
          </section>
          <section className={styles.sideCard}>
            <h2>Timeline Readiness</h2>
            <p>
              Task progress and ceremony activity summaries will appear as those
              features are built.
            </p>
            <ComingSoon />
          </section>
        </aside>
      </div>
      {editor && (
        <EventEditor
          key={editor.event?.id || 'create'}
          wedding={wedding}
          event={editor.event}
          initialWarnings={editor.warnings}
          canEdit={canEdit}
          onClose={() => setEditor(null)}
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
