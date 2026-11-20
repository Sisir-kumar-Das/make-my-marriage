'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Dialog } from 'radix-ui';
import { Check, LockKeyhole, ReceiptText, RefreshCw, X } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useSession } from '@/features/auth/session-provider';
import styles from './checklist.module.css';

const date = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
  }).format(new Date(value));
const time = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
function useHistoryRead(path, revision, enabled) {
  const [result, setResult] = useState(null);
  const key = `${path}/${revision}`;
  useEffect(() => {
    if (!path || !enabled) return;
    let active = true;
    const controller = new AbortController();
    void apiRequest(path, { signal: controller.signal })
      .then((response) => {
        if (active) setResult({ key, data: response.data });
      })
      .catch((error) => {
        if (active) setResult({ key, error: error.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, key, enabled]);
  return enabled && result?.key === key
    ? { ...result, loading: false }
    : { loading: true };
}
function Results({ record }) {
  return (
    <div className={styles.historyResults}>
      <span>{record.added} added</span>
      <span>{record.kept} kept</span>
      <span>{record.deleted} deleted skipped</span>
    </div>
  );
}
export function GenerationHistory({ generationVersion }) {
  const { wedding, connectionError, retrySession } = useSession();
  const [navigation, setNavigation] = useState({
    page: 1,
    generationVersion,
    refresh: 0,
  });
  const [selected, setSelected] = useState(null);
  const [detailRetry, setDetailRetry] = useState(0);
  const trigger = useRef(null),
    heading = useRef(null),
    notice = useRef(null);
  const page =
    navigation.generationVersion === generationVersion ? navigation.page : 1;
  const base = `/weddings/${wedding.id}/checklists/generations`;
  const list = useHistoryRead(
    `${base}?page=${page}&limit=20`,
    `${generationVersion}/${navigation.refresh}`,
    !connectionError,
  );
  const detail = useHistoryRead(
    selected ? `${base}/${selected}` : null,
    detailRetry,
    !connectionError,
  );
  const record = detail.data?.generation;
  const pagination = list.data?.pagination;
  useEffect(() => {
    if (selected && (connectionError || detail.error)) {
      notice.current?.focus({ preventScroll: true });
      notice.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [selected, connectionError, detail.error]);
  function movePage(next) {
    setNavigation({
      page: next,
      generationVersion,
      refresh: navigation.refresh + 1,
    });
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start' });
  }
  return (
    <section
      className={styles.history}
      aria-labelledby="generation-history-title"
    >
      <div className={styles.sectionHeading}>
        <div>
          <h2
            id="generation-history-title"
            tabIndex={-1}
            ref={heading}
            className={styles.historyTitle}
          >
            Generation History &amp; Audit Log
          </h2>
          <p>A read-only record of the planning packs added to your wedding.</p>
        </div>
        <span className={styles.readOnly}>
          <LockKeyhole size={14} /> Read-only history
        </span>
      </div>
      <div className={styles.sectionHeading}>
        <p>
          <strong>Results at the time of generation.</strong> Later task edits,
          completion or deletion do not change these counts.
        </p>
        <button
          className={styles.secondary}
          type="button"
          disabled={list.loading && !connectionError}
          onClick={() =>
            connectionError ? retrySession() : movePage(pagination?.page || 1)
          }
        >
          <RefreshCw size={14} /> Refresh history
        </button>
      </div>
      {connectionError ? (
        <div className={styles.error} role="alert">
          <p>{connectionError}</p>
          <button
            className={styles.secondary}
            type="button"
            onClick={retrySession}
          >
            Retry session check
          </button>
        </div>
      ) : list.loading ? (
        <p role="status" className={styles.state}>
          Loading generation history…
        </p>
      ) : list.error ? (
        <div role="alert" className={styles.error}>
          <h3>History could not be loaded.</h3>
          <p>{list.error}</p>
          <button
            className={styles.secondary}
            type="button"
            onClick={() => movePage(page)}
          >
            Retry history
          </button>
        </div>
      ) : !list.data.generations.length ? (
        <div className={styles.historyEmpty}>
          <ReceiptText size={24} />
          <h3>No generations yet</h3>
          <p>
            Confirmed checklist generations will appear here. Previewing or
            canceling a pack adds no history.
          </p>
        </div>
      ) : (
        <>
          <div
            className={styles.historyTableWrap}
            role="region"
            aria-label="Generation records; scroll horizontally for more columns"
            tabIndex={0}
          >
            <table className={styles.historyTable}>
              <caption className="sr-only">
                Results at the time of generation, newest first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Timestamp</th>
                  <th scope="col">Template pack</th>
                  <th scope="col">Initiated by</th>
                  <th scope="col">Task result</th>
                  <th scope="col">Status</th>
                  <th scope="col">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {list.data.generations.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <time dateTime={row.createdAt}>
                        {date(row.createdAt)}
                        <span className={styles.historySubtle}>
                          {time(row.createdAt)} IST
                        </span>
                      </time>
                    </td>
                    <td>
                      <strong className={styles.packName}>
                        {row.templateName}
                      </strong>
                      <span className={styles.historySubtle}>
                        Version {row.templateVersion}
                      </span>
                    </td>
                    <td>
                      <span className={styles.initiator}>
                        {row.initiator.name || 'Unavailable member'}
                      </span>
                    </td>
                    <td>
                      <Results record={row} />
                    </td>
                    <td>
                      <span className={styles.applied}>
                        <Check size={12} /> Applied
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.historyDetails}
                        aria-label={`Details for ${row.templateName}, ${date(row.createdAt)}, ${time(row.createdAt)} IST`}
                        onClick={(event) => {
                          trigger.current = event.currentTarget;
                          setDetailRetry((value) => value + 1);
                          setSelected(row.id);
                        }}
                      >
                        <ReceiptText size={15} /> Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.historyPagination}>
            <p role="status">
              {pagination.total}{' '}
              {pagination.total === 1 ? 'generation' : 'generations'} · Page{' '}
              {pagination.page} of {pagination.totalPages}
            </p>
            <div>
              <button
                className={styles.secondary}
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => movePage(pagination.page - 1)}
              >
                Previous
              </button>
              <button
                className={styles.secondary}
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => movePage(pagination.page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
      <Dialog.Root
        open={!!selected}
        onOpenChange={(next) => {
          if (!next) setSelected(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.confirmOverlay} />
          <Dialog.Content
            className={styles.confirmDialog}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              (trigger.current?.isConnected
                ? trigger.current
                : heading.current
              )?.focus();
            }}
          >
            <header className={styles.confirmHeader}>
              <div>
                <Dialog.Title>Generation details</Dialog.Title>
                <Dialog.Description>
                  Results at the time of generation. This saved summary is
                  read-only.
                </Dialog.Description>
              </div>
              <Dialog.Close aria-label="Close generation details">
                <X size={20} />
              </Dialog.Close>
            </header>
            <div className={styles.confirmBody}>
              {connectionError || detail.error ? (
                <div
                  ref={notice}
                  tabIndex={-1}
                  className={styles.error}
                  role="alert"
                >
                  <p>{connectionError || detail.error}</p>
                  <button
                    className={styles.secondary}
                    type="button"
                    onClick={() =>
                      connectionError
                        ? retrySession()
                        : setDetailRetry((value) => value + 1)
                    }
                  >
                    {connectionError ? 'Retry session check' : 'Retry details'}
                  </button>
                </div>
              ) : detail.loading ? (
                <p role="status">Loading generation details…</p>
              ) : (
                record && (
                  <>
                    <h3 className={styles.detailPack}>{record.templateName}</h3>
                    <dl className={styles.historyFacts}>
                      <div>
                        <dt>Template version</dt>
                        <dd>{record.templateVersion}</dd>
                      </div>
                      <div>
                        <dt>Generated</dt>
                        <dd>
                          {date(record.createdAt)} · {time(record.createdAt)}{' '}
                          IST
                        </dd>
                      </div>
                      <div>
                        <dt>Initiated by</dt>
                        <dd>{record.initiator.name || 'Unavailable member'}</dd>
                      </div>
                      <div>
                        <dt>Wedding date used</dt>
                        <dd>{date(`${record.weddingDate}T00:00:00+05:30`)}</dd>
                      </div>
                    </dl>
                    <div className={styles.generationCounts}>
                      <div>
                        <strong>{record.added}</strong>
                        <span>Tasks added</span>
                      </div>
                      <div>
                        <strong>{record.kept}</strong>
                        <span>Existing kept</span>
                      </div>
                      <div>
                        <strong>{record.deleted}</strong>
                        <span>Deleted skipped</span>
                      </div>
                    </div>
                    <p>
                      Kept tasks were left unchanged. Previously deleted items
                      were skipped. View current tasks to see their latest
                      details and status.
                    </p>
                  </>
                )
              )}
            </div>
            <footer className={styles.confirmFooter}>
              <Dialog.Close className={styles.secondary}>Close</Dialog.Close>
              <Link href="/tasks" className={styles.primary}>
                View Tasks
              </Link>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
