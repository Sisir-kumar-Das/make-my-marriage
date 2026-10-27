'use client';
import { useEffect, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import styles from './tasks.module.css';

const roles = {
  ADMIN: 'Admin',
  FAMILY_MEMBER: 'Family Member',
  VIEWER: 'Viewer',
};
export function AssigneeNames({ assignees = [] }) {
  if (!assignees.length) return <span>Unassigned</span>;
  return (
    <div className={styles.assigneeNames}>
      {assignees.map((member) => (
        <span
          key={member.id}
          className={member.available ? styles.memberLabel : styles.unavailable}
        >
          {member.available ? member.name : 'Unavailable member'}
        </span>
      ))}
    </div>
  );
}
export function TaskAssignees({
  weddingId,
  userId,
  ids,
  saved = [],
  unavailableIds = [],
  onChange,
  error,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  const [choices, setChoices] = useState({ rows: [], totalPages: 1 });
  const [result, setResult] = useState(null);
  const key = `${page}:${retry}`;
  const loading = result?.key !== key;
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void apiRequest(
      `/weddings/${weddingId}/tasks/assignees?page=${page}&limit=50`,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!active) return;
        setChoices((previous) => ({
          rows:
            page === 1
              ? response.data.members
              : [
                  ...previous.rows,
                  ...response.data.members.filter(
                    (m) => !previous.rows.some((old) => old.id === m.id),
                  ),
                ],
          totalPages: response.meta.totalPages,
        }));
        setResult({ key });
      })
      .catch((failure) => {
        if (active) setResult({ key, error: failure.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [weddingId, page, key]);
  const members = new Map([...saved, ...choices.rows].map((m) => [m.id, m]));
  for (const id of unavailableIds) members.set(id, { id, available: false });
  function toggle(id) {
    if (disabled) return;
    onChange(
      ids.includes(id)
        ? ids.filter((value) => value !== id)
        : [...ids, id].sort(),
    );
  }
  return (
    <section className={styles.form} aria-labelledby="task-assignees-title">
      <h3 id="task-assignees-title">Assignees (Multi-select)</h3>
      <p className={styles.hint}>
        Choose one or more active wedding members, or leave this task
        unassigned. Assignment does not change anyone’s permissions.
      </p>
      <div className={styles.assigneeChips}>
        {ids.map((id) => {
          const member = members.get(id);
          return (
            <span
              key={id}
              className={styles.assigneeChip}
              data-unavailable={member?.available === false}
            >
              <span>
                {member?.available === false
                  ? 'Unavailable member'
                  : member?.name || 'Selected member'}
                {id === userId ? ' (you)' : ''}
              </span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${member?.available === false ? 'unavailable member' : member?.name || 'selected member'}`}
                onClick={() => toggle(id)}
              >
                <X size={14} />
              </button>
            </span>
          );
        })}
        {!ids.length && <span className={styles.hint}>Unassigned</span>}
        <button
          type="button"
          className={styles.textButton}
          aria-expanded={open}
          aria-controls="task-member-options"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
        >
          <UserPlus size={15} />
          {open ? 'Hide members' : 'Add Member'}
        </button>
      </div>
      {error && (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
      {ids.some((id) => members.get(id)?.available === false) && (
        <p className={styles.error}>
          An assigned member is unavailable. Remove or replace them before
          saving. The task itself remains available.
        </p>
      )}
      {open && (
        <div id="task-member-options" className={styles.memberOptions}>
          <p className={styles.hint}>
            Only current members appear here. Invitations will be added in the
            Members feature.
          </p>
          {loading ? (
            <p role="status">Loading wedding members…</p>
          ) : result?.error ? (
            <p role="alert">{result.error}</p>
          ) : (
            <>
              {!choices.rows.length && (
                <p>No assignable members are available.</p>
              )}
              {choices.rows.map((member) => (
                <label key={member.id} className={styles.memberOption}>
                  <input
                    type="checkbox"
                    checked={ids.includes(member.id)}
                    disabled={
                      disabled || (!ids.includes(member.id) && ids.length >= 50)
                    }
                    onChange={() => toggle(member.id)}
                  />
                  <span>
                    {member.name}
                    {member.id === userId ? ' (you)' : ''}
                    <small>{roles[member.role]}</small>
                  </span>
                </label>
              ))}
            </>
          )}
          <div className={styles.choiceActions}>
            <button
              type="button"
              className={styles.textButton}
              disabled={loading || disabled}
              onClick={() => {
                setPage(1);
                setRetry((value) => value + 1);
              }}
            >
              {result?.error ? 'Retry members' : 'Refresh members'}
            </button>
            {!loading && !result?.error && page < choices.totalPages && (
              <button
                type="button"
                className={styles.textButton}
                disabled={disabled}
                onClick={() => setPage((value) => value + 1)}
              >
                Load more members
              </button>
            )}
          </div>
          {ids.length >= 50 && (
            <p role="status">Maximum 50 assignees per task.</p>
          )}
        </div>
      )}
    </section>
  );
}
