'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { TaskFilters } from './task-filters';
import {
  emptyTaskFilters,
  readTaskFilters,
  taskFilterParams,
  taskFilterUrl,
  hasTaskFilters,
} from './filters';
import { AssigneeNames } from './task-assignees';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Plus,
  RefreshCw,
  Eye,
  ClipboardList,
  AlertTriangle,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { refreshState } from '@/lib/refresh-state';
import { useSession } from '@/features/auth/session-provider';
import { PageHeader } from '@/features/dashboard/workspace-ui';
import { TaskEditor } from './task-editor';
import { TaskSeriesEditor } from './task-series-editor';
import { TaskShortcut } from './task-shortcut';
import { taskStatuses, taskPriorities, dueLabel } from './form-data';
import styles from './tasks.module.css';
import {
  ceremonyReturnUrl,
  consumeTaskIntent,
  taskPageCorrectionUrl,
} from './navigation';

export function TasksPage() {
  const { user, wedding, membership, connectionError } = useSession();
  const search = useSearchParams();
  const {
    filters,
    error: filterError,
    key: filterKey,
    navigation,
  } = readTaskFilters(search);
  const fromEvent = navigation.fromEvent;
  const view = filters.view;
  const query = taskFilterParams(filters, true).toString();
  const canEdit = ['ADMIN', 'FAMILY_MEMBER'].includes(membership.role);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null),
    [editor, setEditor] = useState(null);
  const [detailPending, setDetailPending] = useState(false),
    [detailError, setDetailError] = useState('');
  const [notice, setNotice] = useState(null);
  const [seriesEditor, setSeriesEditor] = useState(null);
  const createButton = useRef(null),
    trigger = useRef(null),
    detailController = useRef(null);
  const scope = JSON.stringify([
    wedding.id,
    user.id,
    membership.role,
    filterKey,
  ]);
  const requestKey = `${scope}:${revision}`;
  const snapshot = refreshState(result, scope, requestKey);
  const response = !filterError ? snapshot.data : null;
  const listError = filterError || snapshot.error;
  const loading = !response && !listError;
  const refreshing = !filterError && snapshot.refreshing;
  function applyFilters(next, replace = false) {
    const url = taskFilterUrl(next, fromEvent);
    if (url !== window.location.pathname + window.location.search)
      window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
  }
  const setPage = (value) => applyFilters({ ...filters, page: value });
  const receiveShortcut = useCallback(
    (nextEditor) => {
      trigger.current = createButton.current;
      setDetailError('');
      setEditor(nextEditor);
      window.history.replaceState(
        null,
        '',
        consumeTaskIntent(window.location.href),
      );
    },
    [setEditor, setDetailError],
  );
  const shortcutActive =
    !filterError && (navigation.create || !!navigation.taskId);
  useEffect(() => {
    if (filterError) return;
    const controller = new AbortController();
    const current = () =>
      !controller.signal.aborted &&
      readTaskFilters(new URLSearchParams(window.location.search)).key ===
        filterKey;
    const params = new URLSearchParams(query);
    params.set('limit', '20');
    void apiRequest(
      `/weddings/${wedding.id}/tasks${view === 'my' ? '/my' : ''}?${params}`,
      { signal: controller.signal, timeoutMs: 15000 },
    )
      .then((response) => {
        if (!current()) return;
        const requested = readTaskFilters(new URLSearchParams(query)).filters;
        if (response.meta.page !== Number(requested.page)) {
          // Canonicalize a page emptied by edits without adding a Back entry.
          window.history.replaceState(
            null,
            '',
            taskPageCorrectionUrl(window.location.href, response.meta.page),
          );
          return;
        }
        setResult({ scope, key: requestKey, data: response });
      })
      .catch((error) => {
        if (current())
          setResult({ scope, key: requestKey, error: error.message });
      });
    return () => controller.abort();
  }, [
    wedding.id,
    view,
    query,
    filterKey,
    scope,
    requestKey,
    filterError,
    fromEvent,
  ]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'hidden')
        setRevision((value) => value + 1);
    };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      detailController.current?.abort();
    };
  }, []);
  async function openTask(id, element) {
    if (detailPending || shortcutActive || connectionError) return;
    trigger.current = element || createButton.current;
    setDetailPending(true);
    setDetailError('');
    const controller = new AbortController();
    detailController.current?.abort();
    detailController.current = controller;
    try {
      const result = await apiRequest(`/weddings/${wedding.id}/tasks/${id}`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setEditor({ task: result.data.task });
    } catch (error) {
      if (!controller.signal.aborted) setDetailError(error.message);
    } finally {
      if (!controller.signal.aborted) setDetailPending(false);
    }
  }
  const counts = response?.meta.counts;
  return (
    <div className={styles.page}>
      {fromEvent && (
        <Link className={styles.returnLink} href={ceremonyReturnUrl(fromEvent)}>
          ← Back to ceremony
        </Link>
      )}
      <PageHeader
        eyebrow="Master wedding plan · Task orchestration"
        title="Tasks & Checklist Templates"
        description="Coordinate ritual obligations, wedding preparations and recurring planning checkpoints."
      >
        <Link className={styles.secondary} href="/checklist">
          <BookOpen size={16} />
          Browse Templates
        </Link>
        {canEdit && (
          <button
            ref={createButton}
            type="button"
            className={styles.primary}
            disabled={!!connectionError || detailPending || shortcutActive}
            onClick={(event) => {
              trigger.current = event.currentTarget;
              setEditor({ task: null });
              setDetailError('');
            }}
          >
            <Plus size={16} />
            Create Task
          </button>
        )}
      </PageHeader>
      {!canEdit && (
        <p className={styles.viewer}>
          Viewer access · You can read task details. Creating and editing
          require Admin or Family Member access.
        </p>
      )}
      <section className={styles.metrics} aria-label="Task summary">
        {[
          ['total', 'Total Tasks'],
          ['completed', 'Completed'],
          ['inProgress', 'In Progress'],
          ['overdue', 'Overdue'],
        ].map(([key, label]) => (
          <div key={key}>
            <span>{label}</span>
            <strong>{counts?.[key] ?? '—'}</strong>
            <small>
              {counts
                ? view === 'my'
                  ? hasTaskFilters(filters)
                    ? 'Matching tasks assigned to you'
                    : 'Tasks assigned to you'
                  : hasTaskFilters(filters)
                    ? 'Matching tasks in your wedding'
                    : 'Saved tasks across your wedding'
                : 'Counts appear after loading'}
            </small>
          </div>
        ))}
      </section>
      <nav className={styles.tabs} aria-label="Task views">
        <Link
          href={taskFilterUrl({ ...filters, view: 'all', page: 1 }, fromEvent)}
          aria-current={view === 'all' ? 'page' : undefined}
        >
          All Tasks {response ? `(${response.meta.allTotal})` : ''}
        </Link>
        <Link
          href={taskFilterUrl({ ...filters, view: 'my', page: 1 }, fromEvent)}
          aria-current={view === 'my' ? 'page' : undefined}
        >
          My Tasks {response ? `(${response.meta.myTotal})` : ''}
        </Link>
        <Link href="/checklist">Checklist Templates</Link>
      </nav>
      <TaskFilters
        key={wedding.id}
        weddingId={wedding.id}
        filters={filters}
        filterKey={filterKey}
        onApply={applyFilters}
      />
      {notice && (
        <section role="status" className={styles.success}>
          <strong>
            {notice.removed
              ? 'Your task was removed.'
              : notice.series
                ? 'Repeat pattern changes are saved.'
                : notice.created
                  ? 'Your task was created.'
                  : 'Your task changes are saved.'}
          </strong>
          {notice.removed && (
            <p>
              <Link href="/recovery" className={styles.textButton}>
                Open Deleted Items Recovery
              </Link>
            </p>
          )}
          {notice.generatedCount > 0 && (
            <p>
              {notice.generatedCount} new dated copies created. Each is
              completed separately.
            </p>
          )}
          {notice.series && (
            <p>Completed and individually edited copies are kept.</p>
          )}
          {notice.pastDue && (
            <p>
              This task has a past deadline. Incomplete tasks appear as Overdue.
            </p>
          )}
          {notice.created && hasTaskFilters(filters) && (
            <p>
              Filters remain applied. Use View created task if it is not shown.
            </p>
          )}
          {notice.created && (
            <button
              className={styles.textButton}
              type="button"
              disabled={detailPending || shortcutActive || !!connectionError}
              onClick={(event) => void openTask(notice.id, event.currentTarget)}
            >
              View created task
            </button>
          )}
        </section>
      )}
      {detailError && (
        <p role="alert" className={styles.error}>
          {detailError} Select the task again to retry.
        </p>
      )}
      {shortcutActive && (
        <TaskShortcut
          key={`${wedding.id}:${navigation.create}:${navigation.taskId}:${navigation.fromEvent}:${filters.eventId}`}
          weddingId={wedding.id}
          navigation={navigation}
          eventId={filters.eventId}
          canEdit={canEdit}
          onReady={receiveShortcut}
        />
      )}
      {detailPending && <p role="status">Loading task details…</p>}
      <div className={styles.toolbar}>
        <span className={styles.eyebrow}>
          {view === 'my' ? 'Tasks assigned to you' : 'Your wedding tasks'}
        </span>
        <button
          type="button"
          className={styles.textButton}
          disabled={loading || refreshing || !!connectionError}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={14} />
          <span role={refreshing ? 'status' : undefined}>
            {refreshing ? 'Refreshing tasks…' : 'Refresh tasks'}
          </span>
        </button>
      </div>
      <section
        className={styles.tableCard}
        aria-label="Wedding task list"
        aria-busy={loading || refreshing}
      >
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                {[
                  'Status',
                  'Task Title & Rhythm',
                  'Linked Event',
                  'Assignee',
                  'Due Date',
                  'Priority',
                  'Actions',
                ].map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {response?.data.tasks.map((task) => (
                <tr key={task.id}>
                  <td>
                    <span className={styles.badge} data-status={task.status}>
                      {taskStatuses.find(([key]) => key === task.status)?.[1]}
                    </span>
                  </td>
                  <td>
                    <button
                      className={styles.taskTitle}
                      type="button"
                      disabled={
                        detailPending || shortcutActive || !!connectionError
                      }
                      onClick={(event) =>
                        void openTask(task.id, event.currentTarget)
                      }
                    >
                      {task.title}
                    </button>
                    {task.source?.type === 'CHECKLIST' && (
                      <small className={styles.repeatLabel}>
                        Checklist task
                      </small>
                    )}
                    {task.repeat && (
                      <small className={styles.repeatLabel}>
                        {task.repeat.generationIssue
                          ? 'Repeats need attention'
                          : task.repeat.active
                            ? 'Repeats'
                            : 'Repeats stopped'}{' '}
                        · Every {task.repeat.interval}{' '}
                        {
                          { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month' }[
                            task.repeat.frequency
                          ]
                        }
                        {task.repeat.interval > 1 ? 's' : ''}
                        {task.occurrenceEdited ? ' · Customized copy' : ''}
                      </small>
                    )}
                    {task.description && (
                      <p className={styles.taskDescription}>
                        {task.description}
                      </p>
                    )}
                  </td>
                  <td>
                    {task.event ? (
                      task.event.available ? (
                        task.event.name
                      ) : (
                        <span className={styles.unavailable}>
                          Ceremony unavailable
                        </span>
                      )
                    ) : (
                      'Wedding-wide'
                    )}
                  </td>
                  <td>
                    <AssigneeNames assignees={task.assignees} />
                  </td>
                  <td>
                    <span>{dueLabel(task)}</span>
                    {task.dueAt && !task.dueDateOnly && <small>IST</small>}
                    {task.overdue && (
                      <span className={styles.overdue}>
                        <AlertTriangle size={12} />
                        Overdue
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className={styles.badge}
                      data-priority={task.priority}
                    >
                      {
                        taskPriorities.find(
                          ([key]) => key === task.priority,
                        )?.[1]
                      }
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`View ${task.title}`}
                      disabled={
                        detailPending || shortcutActive || !!connectionError
                      }
                      onClick={(event) =>
                        void openTask(task.id, event.currentTarget)
                      }
                    >
                      <Eye size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? (
          <p className={styles.empty} role="status">
            Loading your tasks…
          </p>
        ) : listError ? (
          <div className={styles.empty} role="alert">
            <p>{listError}</p>
            <button
              type="button"
              className={styles.secondary}
              onClick={() =>
                filterError
                  ? applyFilters({
                      ...emptyTaskFilters,
                      view: view === 'my' ? 'my' : 'all',
                    })
                  : setRevision((value) => value + 1)
              }
            >
              {filterError ? 'Reset invalid filters' : 'Retry tasks'}
            </button>
          </div>
        ) : (
          !response?.data.tasks.length && (
            <div className={styles.empty}>
              <ClipboardList size={28} />
              <h2>
                {hasTaskFilters(filters)
                  ? 'No tasks match these filters'
                  : view === 'my'
                    ? 'No tasks assigned to you yet'
                    : 'Your wedding task list starts here'}
              </h2>
              <p>
                {hasTaskFilters(filters)
                  ? 'Try another search or reset filters to see more tasks in this view.'
                  : view === 'my'
                    ? 'Tasks assigned to you will appear here. You can still view all wedding tasks in All Tasks.'
                    : canEdit
                      ? 'Create your first task to organize a ceremony or wedding-wide preparation.'
                      : 'Your planning team has not added tasks yet.'}
              </p>
              {hasTaskFilters(filters) && (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => applyFilters({ ...emptyTaskFilters, view })}
                >
                  Reset filters
                </button>
              )}
            </div>
          )
        )}
        {response && (
          <nav className={styles.pagination} aria-label="Task pages">
            <span>
              {response.meta.total}{' '}
              {hasTaskFilters(filters) ? 'matching' : 'saved'}{' '}
              {response.meta.total === 1 ? 'task' : 'tasks'}
              {view === 'my' ? ' assigned to you' : ''} · Page{' '}
              {response.meta.page} of {Math.max(1, response.meta.totalPages)}
            </span>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={response.meta.page <= 1 || !!connectionError}
                onClick={() => setPage(response.meta.page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={
                  response.meta.page >= response.meta.totalPages ||
                  !!connectionError
                }
                onClick={() => setPage(response.meta.page + 1)}
              >
                Next
              </button>
            </div>
          </nav>
        )}
      </section>
      {editor && (
        <TaskEditor
          wedding={wedding}
          task={editor.task}
          initialCeremony={editor.initialCeremony}
          canEdit={canEdit}
          onClose={() => setEditor(null)}
          onEditFuture={(record) => {
            setEditor(null);
            setSeriesEditor(record);
          }}
          onReturnFocus={() =>
            (trigger.current?.isConnected
              ? trigger.current
              : createButton.current
            )?.focus()
          }
          onRemoved={() => {
            trigger.current = createButton.current;
            setEditor(null);
            setNotice({ removed: true });
            setRevision((value) => value + 1);
          }}
          onSaved={(result, created) => {
            setNotice({
              id: result.task.id,
              created,
              generatedCount: result.generatedCount,
              pastDue: result.warnings.some(
                (warning) => warning.code === 'PAST_DUE_DATE',
              ),
            });
            if (created) {
              applyFilters(
                {
                  ...(filterError ? emptyTaskFilters : filters),
                  view:
                    view === 'my' && !result.task.assigneeIds.includes(user.id)
                      ? 'all'
                      : view,
                  page: 1,
                },
                true,
              );
              setEditor(null);
            }
            setRevision((value) => value + 1);
          }}
        />
      )}
      {seriesEditor && (
        <TaskSeriesEditor
          wedding={wedding}
          task={seriesEditor}
          onClose={() => setSeriesEditor(null)}
          onSaved={(result) => {
            setSeriesEditor(null);
            setRevision((value) => value + 1);
            setNotice({ series: true, generatedCount: result.generatedCount });
          }}
          onReturnFocus={() =>
            (trigger.current?.isConnected
              ? trigger.current
              : createButton.current
            )?.focus()
          }
        />
      )}
    </div>
  );
}
