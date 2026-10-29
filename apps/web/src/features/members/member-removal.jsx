'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { X, UserMinus, ShieldCheck } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useSession } from '@/features/auth/session-provider';
import { roleLabels } from '@/features/invitations/invitation-data';
import { DiscardChangesDialog } from '@/features/tasks/discard-changes-dialog';
import { dueLabel, taskPriorities } from '@/features/tasks/form-data';
import common from '@/features/invitations/invitations.module.css';
import styles from './member-removal.module.css';

const priorityLabels = Object.fromEntries(taskPriorities);

export function MemberRemoval({ memberId, onClose, onSaved, onReturnFocus }) {
  const { user, wedding, connectionError, retrySession } = useSession();
  const [revision, setRevision] = useState(0),
    [result, setResult] = useState(null),
    [draft, setDraft] = useState(null);
  const [acknowledged, setAcknowledged] = useState(''),
    [error, setError] = useState(''),
    [blocked, setBlocked] = useState(false);
  const [pending, setPending] = useState(false),
    [discard, setDiscard] = useState(false),
    [attempted, setAttempted] = useState(false);
  const [choicePage, setChoicePage] = useState(1),
    [choiceRevision, setChoiceRevision] = useState(0),
    [choices, setChoices] = useState(null);
  const [submittedPreview, setSubmittedPreview] = useState(null);
  const attempt = useRef(null),
    lock = useRef(false),
    notice = useRef(null);
  const key = `${wedding.id}/${user.id}/${memberId}/${revision}`;
  const current = result?.key === key ? result : null;
  // A committed removal may make a subsequent preview unavailable. Retain the
  // exact submitted preview/body for receipt recovery, without authorizing a new write.
  const data = current?.data || (attempted ? submittedPreview : null);
  const feedback =
    connectionError ||
    (attempted && current?.code === 'MEMBER_NOT_FOUND' && !blocked
      ? 'The member preview is unavailable after your earlier attempt. Retry the unchanged removal to confirm whether it already saved.'
      : error || current?.error);
  const choiceScope = `${wedding.id}/${user.id}/${choiceRevision}`;
  useEffect(() => {
    if (connectionError) return;
    const controller = new AbortController();
    let active = true;
    apiRequest(`/weddings/${wedding.id}/members/${memberId}/removal`, {
      signal: controller.signal,
      timeoutMs: 15000,
    })
      .then(({ data }) => {
        if (!active) return;
        setResult({ key, data });
        setDraft(
          (old) =>
            old || {
              policy: '',
              replacementUserId: '',
              handoverToUserId: data.member.isYou ? '' : user.id,
            },
        );
      })
      .catch((failure) => {
        if (active)
          setResult({ key, error: failure.message, code: failure.code });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, wedding.id, user.id, memberId, connectionError]);
  useEffect(() => {
    if (draft?.policy !== 'REASSIGN' || connectionError) return;
    const controller = new AbortController();
    let active = true;
    apiRequest(
      `/weddings/${wedding.id}/tasks/assignees?page=${choicePage}&limit=50`,
      { signal: controller.signal, timeoutMs: 15000 },
    )
      .then(({ data }) => {
        if (!active) return;
        setChoices((old) => ({
          scope: choiceScope,
          page: choicePage,
          meta: data.meta,
          rows: [
            ...new Map(
              [
                ...(old?.scope === choiceScope ? old.rows : []),
                ...data.members,
              ].map((row) => [row.id, row]),
            ).values(),
          ],
        }));
      })
      .catch((failure) => {
        if (active)
          setChoices({
            scope: choiceScope,
            page: choicePage,
            rows: [],
            error: failure.message,
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [draft?.policy, connectionError, wedding.id, choicePage, choiceScope]);
  useEffect(() => {
    if (feedback) {
      notice.current?.focus({ preventScroll: true });
      notice.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [feedback]);
  const availableChoices = choices?.scope === choiceScope ? choices : null;
  const recipient = availableChoices?.rows.find(
    (row) =>
      row.id === draft?.replacementUserId && row.id !== data?.member.userId,
  );
  const choiceLoading = availableChoices?.page !== choicePage;
  const signature = data && draft ? JSON.stringify([data.preview, draft]) : '';
  const confirmed = !!signature && acknowledged === signature;
  const hasAssignments =
    !!data && (data.taskCount > 0 || data.assignmentRules > 0);
  const hasManagedRules = !!data && data.managedRules.count > 0;
  const cannotSave =
    pending ||
    !!connectionError ||
    blocked ||
    !data ||
    !draft ||
    data.lastAdmin ||
    data.tooLarge ||
    (!attempted &&
      (!confirmed ||
        (hasAssignments &&
          (!draft.policy ||
            (draft.policy === 'REASSIGN' &&
              (!recipient || !!availableChoices?.error)))) ||
        (hasManagedRules && !draft.handoverToUserId)));
  const dirty =
    !!draft &&
    (!!draft.policy ||
      !!draft.replacementUserId ||
      !!acknowledged ||
      (data && draft.handoverToUserId !== (data.member.isYou ? '' : user.id)));
  function change(field, value) {
    if (lock.current) return;
    setDraft((old) => ({
      ...old,
      [field]: value,
      ...(field === 'policy' ? { replacementUserId: '' } : {}),
    }));
    setAcknowledged('');
    setError('');
    setAttempted(false);
    setSubmittedPreview(null);
    attempt.current = null;
  }
  function close() {
    if (lock.current) return;
    if (dirty || attempted) setDiscard(true);
    else onClose();
  }
  function reload() {
    if (lock.current) return;
    setDraft(null);
    setAcknowledged('');
    setError('');
    setBlocked(false);
    setAttempted(false);
    setSubmittedPreview(null);
    attempt.current = null;
    setRevision((n) => n + 1);
    setChoicePage(1);
    setChoiceRevision((n) => n + 1);
  }
  async function save(event) {
    event.preventDefault();
    if (
      lock.current ||
      connectionError ||
      blocked ||
      !data ||
      !draft ||
      data.lastAdmin ||
      data.tooLarge ||
      (!attempted && !confirmed)
    )
      return;
    if (
      !attempt.current &&
      hasAssignments &&
      (!draft.policy ||
        (draft.policy === 'REASSIGN' &&
          (!recipient || availableChoices?.error)))
    ) {
      setError(
        'Choose reassignment with a current member, or explicitly leave the work unassigned.',
      );
      return;
    }
    if (!attempt.current && hasManagedRules && !draft.handoverToUserId) {
      setError('Choose another active Admin to manage the repeating tasks.');
      return;
    }
    attempt.current ||= {
      key: crypto.randomUUID(),
      version: data.member.version,
      data,
      body: JSON.stringify({
        preview: data.preview,
        policy: hasAssignments ? draft.policy : null,
        replacementUserId:
          hasAssignments && draft.policy === 'REASSIGN'
            ? draft.replacementUserId
            : null,
        handoverToUserId: hasManagedRules ? draft.handoverToUserId : null,
        confirmHandover: hasManagedRules,
        confirmRemoval: true,
      }),
    };
    const operation = attempt.current;
    setSubmittedPreview(operation.data);
    lock.current = true;
    setPending(true);
    setDiscard(false);
    setAttempted(true);
    setError('');
    try {
      const { data: outcome } = await apiRequest(
        `/weddings/${wedding.id}/members/${memberId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': String(operation.version),
            'Idempotency-Key': operation.key,
          },
          body: operation.body,
          timeoutMs: 20000,
        },
      );
      onSaved(outcome);
    } catch (failure) {
      setError(failure.message);
      if (
        [
          'MEMBER_PREVIEW_STALE',
          'LAST_ADMIN',
          'REMOVAL_TOO_LARGE',
          'ADMIN_REQUIRED',
          'MEMBER_NOT_FOUND',
          'INVALID_RECIPIENT',
          'IDEMPOTENCY_CONFLICT',
        ].includes(failure.code)
      )
        setBlocked(true);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={common.overlay} />
        <Dialog.Content
          className={`${common.modal} ${styles.modal}`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onReturnFocus();
          }}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            if (!discard) close();
          }}
          onPointerDownOutside={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <header className={`${common.modalHeader} ${styles.header}`}>
            <span className={styles.icon}>
              <UserMinus size={26} />
            </span>
            <div>
              <p className={styles.eyebrow}>Member access</p>
              <Dialog.Title>Remove Member with Task Reassignment</Dialog.Title>
              <Dialog.Description>
                Review affected work before removing wedding access.
              </Dialog.Description>
            </div>
            <button
              className={common.close}
              type="button"
              aria-label="Close member removal"
              disabled={pending}
              onClick={close}
            >
              <X size={20} />
            </button>
          </header>
          <form className={common.form} onSubmit={save}>
            <div className={common.formBody}>
              {feedback && (
                <div
                  role="alert"
                  tabIndex={-1}
                  ref={notice}
                  className={common.error}
                >
                  {feedback}
                  {connectionError && (
                    <button
                      className={common.secondary}
                      type="button"
                      disabled={pending}
                      onClick={retrySession}
                    >
                      Retry session check
                    </button>
                  )}
                  {current?.error && !connectionError && !attempted && (
                    <button
                      className={common.secondary}
                      type="button"
                      onClick={() => setRevision((n) => n + 1)}
                    >
                      Retry removal preview
                    </button>
                  )}
                </div>
              )}
              {!current && !data && (
                <p role="status">Loading member and affected work…</p>
              )}
              {data && draft && (
                <fieldset disabled={pending || !!connectionError || blocked}>
                  <div className={styles.member}>
                    <span className={styles.avatar} aria-hidden="true">
                      {data.member.name
                        .trim()
                        .split(/\s+/u)
                        .slice(0, 2)
                        .map((word) => [...word][0])
                        .join('')}
                    </span>
                    <div>
                      <strong>{data.member.name}</strong>
                      <p>
                        {roleLabels[data.member.role]}
                        {data.member.relationship
                          ? ` · ${data.member.relationship}`
                          : ''}
                        {data.member.isYou ? ' · You' : ''}
                      </p>
                    </div>
                    <span className={styles.badge}>
                      {attempted ? 'Result unconfirmed' : 'Active'}
                    </span>
                  </div>
                  <div className={styles.info}>
                    <ShieldCheck size={20} />
                    <p>
                      Removing this member ends their wedding workspace access.
                      Their account, created tasks and completed work stay
                      saved. Rejoining requires a new invitation and explicit
                      acceptance.
                    </p>
                  </div>
                  {data.member.isYou && (
                    <p className={common.warning}>
                      You will leave this wedding and return to wedding setup.
                      Your account stays signed in.
                    </p>
                  )}
                  {data.lastAdmin && (
                    <p className={common.error}>
                      This is the last active Admin. Promote another member
                      before removing this person.
                    </p>
                  )}
                  {data.tooLarge && (
                    <p className={common.error}>
                      Too much work is affected for one removal. Reassign some
                      work in Tasks first, then reload this preview.
                    </p>
                  )}
                  <div className={styles.sectionHeading}>
                    <h3>Pending Task Reallocation</h3>
                    <span className={styles.badge}>
                      {data.taskCount} unfinished{' '}
                      {data.taskCount === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>
                  <p className={styles.copy}>
                    {data.overdueCount} overdue · {data.assignmentRules} active
                    repeat-assignment{' '}
                    {data.assignmentRules === 1 ? 'rule' : 'rules'}. Includes
                    unfinished work with past or missing deadlines. Completed,
                    deleted and retired task records stay unchanged.
                  </p>
                  {data.taskSample.length > 0 && (
                    <ul className={styles.tasks}>
                      {data.taskSample.map((task, index) => (
                        <li key={index}>
                          <span>
                            {task.title}
                            <small>
                              {dueLabel(task)}
                              {task.dueAt ? ' · IST' : ''}
                            </small>
                          </span>
                          <span className={styles.badge}>
                            {task.overdue
                              ? 'Overdue'
                              : priorityLabels[task.priority]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {data.taskCount > data.taskSample.length && (
                    <p className={styles.copy}>
                      Showing the first {data.taskSample.length} tasks. The
                      choice applies to all {data.taskCount} unfinished tasks.
                    </p>
                  )}
                  {hasAssignments ? (
                    <>
                      <div
                        className={styles.options}
                        role="group"
                        aria-label="Choose what happens to assignments"
                      >
                        <label className={styles.option}>
                          <input
                            type="radio"
                            name="member-removal-policy"
                            value="REASSIGN"
                            checked={draft.policy === 'REASSIGN'}
                            onChange={() => change('policy', 'REASSIGN')}
                          />
                          <span>
                            <strong>Reassign to another active member</strong>
                            <span>
                              Replace only this member’s assignment. Keep all
                              other assignees.
                            </span>
                          </span>
                        </label>
                        {draft.policy === 'REASSIGN' && (
                          <div className={styles.recipient}>
                            <label htmlFor="member-removal-recipient">
                              New assignee *
                            </label>
                            <select
                              id="member-removal-recipient"
                              required
                              value={draft.replacementUserId}
                              onChange={(event) =>
                                change('replacementUserId', event.target.value)
                              }
                            >
                              <option value="">Choose a collaborator</option>
                              {draft.replacementUserId && !recipient && (
                                <option
                                  disabled
                                  value={draft.replacementUserId}
                                >
                                  Selection not loaded — reload collaborators
                                </option>
                              )}
                              {availableChoices?.rows
                                .filter((row) => row.id !== data.member.userId)
                                .map((row) => (
                                  <option value={row.id} key={row.id}>
                                    {row.name} · {roleLabels[row.role]}
                                  </option>
                                ))}
                            </select>
                            {choiceLoading && (
                              <p role="status">Loading collaborators…</p>
                            )}
                            {availableChoices?.error && (
                              <p role="alert">{availableChoices.error}</p>
                            )}
                            <button
                              type="button"
                              className={common.link}
                              disabled={pending}
                              onClick={() => {
                                setChoicePage(1);
                                setChoiceRevision((n) => n + 1);
                              }}
                            >
                              Reload collaborators
                            </button>
                            {availableChoices?.meta &&
                              choicePage < availableChoices.meta.totalPages && (
                                <button
                                  type="button"
                                  className={common.secondary}
                                  disabled={pending || choiceLoading}
                                  onClick={() => setChoicePage((n) => n + 1)}
                                >
                                  Load more collaborators
                                </button>
                              )}
                            {recipient?.role === 'VIEWER' && (
                              <p className={common.warning}>
                                This person is a Viewer. Assignment will not let
                                them edit or complete tasks; an Admin or Family
                                Member must do that.
                              </p>
                            )}
                          </div>
                        )}
                        <label className={styles.option}>
                          <input
                            type="radio"
                            name="member-removal-policy"
                            value="UNASSIGN"
                            checked={draft.policy === 'UNASSIGN'}
                            onChange={() => change('policy', 'UNASSIGN')}
                          />
                          <span>
                            <strong>Leave unassigned</strong>
                            <span>
                              Remove only this member. Shared tasks keep their
                              other assignees; tasks assigned only to this
                              member become unassigned.
                            </span>
                          </span>
                        </label>
                      </div>
                    </>
                  ) : (
                    <p className={styles.info}>
                      No unfinished task or active repeat assignment needs
                      reallocation.
                    </p>
                  )}
                  {hasManagedRules && (
                    <div className={styles.handover}>
                      <h3>
                        {data.managedRules.count} repeating-task{' '}
                        {data.managedRules.count === 1
                          ? 'rule needs'
                          : 'rules need'}{' '}
                        a new manager
                      </h3>
                      <ul>
                        {data.managedRules.sample.map((rule, index) => (
                          <li key={index}>{rule.title}</li>
                        ))}
                      </ul>
                      {data.managedRules.count >
                        data.managedRules.sample.length && (
                        <p>
                          Showing the first {data.managedRules.sample.length}{' '}
                          rules. All {data.managedRules.count} will transfer.
                        </p>
                      )}
                      <label htmlFor="member-removal-manager">
                        Transfer repeat management to *
                      </label>
                      <select
                        id="member-removal-manager"
                        required
                        value={draft.handoverToUserId}
                        onChange={(event) =>
                          change('handoverToUserId', event.target.value)
                        }
                      >
                        <option value="">Choose another active Admin</option>
                        {data.handoverCandidates.map((row) => (
                          <option value={row.userId} key={row.userId}>
                            {row.name}
                            {row.userId === user.id ? ' (you)' : ''}
                          </option>
                        ))}
                      </select>
                      <p>
                        Schedules keep running. This changes who manages the
                        rules, separately from your task-assignment choice.
                      </p>
                    </div>
                  )}
                  {data.pendingInvitations > 0 && (
                    <p className={common.warning}>
                      This Admin issued {data.pendingInvitations} pending
                      invitations. A current Admin must resend those links after
                      removal so they can be used.
                    </p>
                  )}
                  <label className={styles.confirm}>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) =>
                        setAcknowledged(event.target.checked ? signature : '')
                      }
                    />
                    <span>
                      I confirm removing this member’s wedding access
                      {hasAssignments
                        ? ` and ${draft.policy === 'REASSIGN' ? 'reassigning' : draft.policy === 'UNASSIGN' ? 'unassigning' : 'reviewing'} the affected assignments`
                        : ''}
                      {hasManagedRules
                        ? ' with the selected repeat-management handover'
                        : ''}
                      .
                    </span>
                  </label>
                </fieldset>
              )}
              {(blocked || error) && !connectionError && (
                <button
                  className={common.secondary}
                  type="button"
                  disabled={pending}
                  onClick={reload}
                >
                  Reload latest details (replaces unsaved choices)
                </button>
              )}
            </div>
            <footer className={common.modalFooter}>
              <button
                type="button"
                className={common.secondary}
                disabled={pending}
                onClick={close}
              >
                Keep Member
              </button>
              <button
                type="submit"
                className={common.primary}
                disabled={cannotSave}
              >
                {pending
                  ? 'Removing access…'
                  : attempted
                    ? 'Retry unchanged removal'
                    : draft?.policy === 'REASSIGN'
                      ? 'Reassign & Remove Access'
                      : draft?.policy === 'UNASSIGN'
                        ? 'Unassign & Remove Access'
                        : 'Remove Access'}
              </button>
            </footer>
          </form>
          <DiscardChangesDialog
            open={discard}
            pending={pending}
            title="Discard removal choices?"
            description={
              attempted
                ? 'Removal may already have saved. Retry the unchanged removal to confirm its result. Discarding these choices does not undo saved changes.'
                : 'Removal has not been submitted. Keep editing or discard the choices in this form.'
            }
            onKeepEditing={() => setDiscard(false)}
            onDiscard={onClose}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
