'use client';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { X, ShieldCheck, AlertTriangle } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useSession } from '@/features/auth/session-provider';
import { DiscardChangesDialog } from '@/features/tasks/discard-changes-dialog';
import {
  relationshipChoices,
  roleLabels,
} from '@/features/invitations/invitation-data';
import styles from '@/features/invitations/invitations.module.css';
import editStyles from './member-editor.module.css';

function initial(member, actorId) {
  const common = relationshipChoices.includes(member.relationship);
  return {
    role: member.role,
    relationshipChoice: member.isCreator
      ? ''
      : common
        ? member.relationship
        : member.relationship
          ? 'OTHER'
          : '',
    customRelationship:
      !member.isCreator && !common ? member.relationship || '' : '',
    handoverToUserId: member.userId === actorId ? '' : actorId,
  };
}
export function MemberEditor(props) {
  const session = useSession();
  return (
    <ScopedMemberEditor
      key={`${session.wedding.id}/${session.user.id}/${props.memberId}`}
      {...props}
      session={session}
    />
  );
}
function ScopedMemberEditor({
  memberId,
  onClose,
  onSaved,
  onReturnFocus,
  session,
}) {
  const { user, wedding, connectionError, retrySession } = session;
  const [revision, setRevision] = useState(0),
    [result, setResult] = useState(null);
  const [draft, setDraft] = useState(null),
    [acknowledged, setAcknowledged] = useState('');
  const [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [discard, setDiscard] = useState(false);
  const [attempted, setAttempted] = useState(false),
    [blocked, setBlocked] = useState(false);
  const [submittedPreview, setSubmittedPreview] = useState(null);
  const [deniedPreview, setDeniedPreview] = useState(null);
  const lock = useRef(false),
    attempt = useRef(null),
    mounted = useRef(false),
    notice = useRef(null);
  const scope = `${wedding.id}/${user.id}/${memberId}`;
  const key = `${scope}/${revision}`;
  const current = result?.key === key ? result : null;
  const hasAttempt = attempted && submittedPreview?.scope === scope;
  // Failed recovery reads must not erase the preview belonging to the exact
  // submitted request. The request itself stays in the ref for unchanged retry.
  const data = current?.data || (hasAttempt ? submittedPreview.data : null);
  const retryOnly = hasAttempt && !current?.data;
  const previewDenied = !!deniedPreview;
  const feedback =
    connectionError || error || current?.error || deniedPreview?.message;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (connectionError) return;
    const controller = new AbortController();
    let active = true;
    apiRequest(`/weddings/${wedding.id}/members/${memberId}/management`, {
      signal: controller.signal,
      timeoutMs: 15000,
    })
      .then((response) => {
        if (!active) return;
        setResult({ key, data: response.data });
        setDeniedPreview(null);
        setDraft(
          (previous) => previous || initial(response.data.member, user.id),
        );
      })
      .catch((failure) => {
        if (!active) return;
        setResult({ key, error: failure.message, code: failure.code });
        if (
          [
            'SESSION_EXPIRED',
            'ADMIN_REQUIRED',
            'FORBIDDEN',
            'MEMBER_NOT_FOUND',
            'WEDDING_NOT_FOUND',
            'WEDDING_UNAVAILABLE',
            'ORIGIN_NOT_ALLOWED',
          ].includes(failure.code)
        )
          setDeniedPreview({ message: failure.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, wedding.id, user.id, memberId, connectionError]);
  useEffect(() => {
    if (feedback) {
      notice.current?.focus({ preventScroll: true });
      notice.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [feedback, connectionError, current?.error]);
  const needsHandover =
    !!data &&
    draft?.role === 'VIEWER' &&
    data.member.role !== 'VIEWER' &&
    data.managedRepeats.count > 0;
  const signature = data && draft ? JSON.stringify([data.preview, draft]) : '';
  const confirmed = !!signature && acknowledged === signature;
  const edited =
    !!data &&
    !!draft &&
    (draft.role !== data.member.role ||
      draft.relationshipChoice !==
        initial(data.member, user.id).relationshipChoice ||
      draft.customRelationship !==
        initial(data.member, user.id).customRelationship);
  function change(name, value) {
    if (lock.current) return;
    setDraft((old) => ({ ...old, [name]: value }));
    setError('');
    setAcknowledged('');
    setAttempted(false);
    setSubmittedPreview(null);
    attempt.current = null;
  }
  function close() {
    if (lock.current) return;
    if (edited || attempted) setDiscard(true);
    else onClose();
  }
  function reload() {
    if (lock.current) return;
    setDraft(null);
    setAcknowledged('');
    setError('');
    setAttempted(false);
    setSubmittedPreview(null);
    setBlocked(false);
    attempt.current = null;
    setRevision((value) => value + 1);
  }
  async function save(event) {
    event.preventDefault();
    if (
      lock.current ||
      connectionError ||
      blocked ||
      previewDenied ||
      !data ||
      !draft ||
      (!confirmed && !hasAttempt)
    )
      return;
    if (attempt.current && attempt.current.scope !== scope) {
      setError(
        'Your account or wedding changed. Reload the member details before saving.',
      );
      setBlocked(true);
      return;
    }
    if (
      !data.member.isCreator &&
      (!draft.relationshipChoice ||
        (draft.relationshipChoice === 'OTHER' &&
          !draft.customRelationship.trim()))
    ) {
      setError('Choose a relationship or specify it after selecting Other.');
      return;
    }
    if (needsHandover && !draft.handoverToUserId) {
      setError('Choose another active Admin to manage these repeat rules.');
      return;
    }
    attempt.current ||= {
      scope,
      data,
      key: crypto.randomUUID(),
      version: data.member.version,
      body: JSON.stringify({
        role: draft.role,
        relationshipChoice: draft.relationshipChoice,
        customRelationship:
          draft.relationshipChoice === 'OTHER' ? draft.customRelationship : '',
        preview: data.preview,
        handoverToUserId: needsHandover ? draft.handoverToUserId : null,
        confirmHandover: needsHandover,
      }),
    };
    const operation = attempt.current;
    setSubmittedPreview({ scope, data: operation.data });
    lock.current = true;
    setPending(true);
    setDiscard(false);
    setAttempted(true);
    setError('');
    try {
      const response = await apiRequest(
        `/weddings/${wedding.id}/members/${memberId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': String(operation.version),
            'Idempotency-Key': operation.key,
          },
          body: operation.body,
          timeoutMs: 20000,
        },
      );
      if (mounted.current) onSaved(response.data);
    } catch (failure) {
      if (!mounted.current) return;
      setError(failure.message);
      if (
        [
          'MEMBER_PREVIEW_STALE',
          'LAST_ADMIN',
          'NO_CHANGES',
          'ADMIN_REQUIRED',
          'MEMBER_NOT_FOUND',
        ].includes(failure.code)
      )
        setBlocked(true);
    } finally {
      lock.current = false;
      if (mounted.current) setPending(false);
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
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.modal}
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
          <header className={styles.modalHeader}>
            <div>
              <Dialog.Title className={editStyles.title}>
                Edit role &amp; relationship
              </Dialog.Title>
              <Dialog.Description>
                Review access and affected work before confirming.
              </Dialog.Description>
            </div>
            <button
              className={styles.close}
              type="button"
              aria-label="Close member editor"
              disabled={pending}
              onClick={close}
            >
              <X size={22} />
            </button>
          </header>
          <form onSubmit={save} className={styles.form}>
            <div className={styles.formBody}>
              {feedback && (
                <div
                  className={styles.error}
                  role="alert"
                  tabIndex={-1}
                  ref={notice}
                >
                  {feedback}
                  {current?.error && error && !connectionError && (
                    <p>{current.error}</p>
                  )}
                  {retryOnly && !previewDenied && !connectionError && (
                    <p>
                      Your submitted choices are kept below. Retry the unchanged
                      save to confirm its result, or retry loading the member
                      preview.
                    </p>
                  )}
                  {connectionError && (
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={pending}
                      onClick={retrySession}
                    >
                      Retry session check
                    </button>
                  )}
                  {(current?.error || previewDenied) && !connectionError && (
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={pending}
                      onClick={() => setRevision((value) => value + 1)}
                    >
                      Retry member preview
                    </button>
                  )}
                </div>
              )}
              {!current && !data && (
                <p role="status">
                  Loading current member access and affected work…
                </p>
              )}
              {data && draft && (
                <fieldset
                  disabled={
                    pending ||
                    !!connectionError ||
                    blocked ||
                    previewDenied ||
                    retryOnly
                  }
                >
                  <div className={editStyles.member}>
                    <strong>{data.member.name}</strong>
                    <span>
                      {data.member.isYou ? 'You · ' : ''}
                      {roleLabels[data.member.role]}
                      {data.member.relationship
                        ? ` · ${data.member.relationship}`
                        : ''}
                    </span>
                  </div>
                  <label htmlFor="member-role">Permission role</label>
                  <select
                    id="member-role"
                    value={draft.role}
                    onChange={(event) => change('role', event.target.value)}
                  >
                    {Object.entries(roleLabels).map(([value, label]) => (
                      <option
                        key={value}
                        value={value}
                        disabled={
                          data.member.role === 'ADMIN' &&
                          data.adminCount === 1 &&
                          value !== 'ADMIN'
                        }
                      >
                        {label}
                      </option>
                    ))}
                  </select>
                  {data.member.role === 'ADMIN' && data.adminCount === 1 && (
                    <p className={styles.info}>
                      <ShieldCheck size={18} /> This is the last active Admin.
                      Promote another member before changing this role.
                    </p>
                  )}
                  {draft.role === 'ADMIN' && data.member.role !== 'ADMIN' && (
                    <p className={styles.warning}>
                      <ShieldCheck size={18} /> Admin grants full wedding
                      authority, including member access management.
                    </p>
                  )}
                  {data.member.isCreator ? (
                    <p className={styles.info}>
                      The original wedding creator is exempt from a relationship
                      label.
                    </p>
                  ) : (
                    <>
                      <label htmlFor="member-relationship">
                        Relationship to this wedding *
                      </label>
                      <select
                        id="member-relationship"
                        required
                        value={draft.relationshipChoice}
                        onChange={(event) =>
                          change('relationshipChoice', event.target.value)
                        }
                      >
                        <option value="">Choose a relationship</option>
                        {relationshipChoices.map((choice) => (
                          <option key={choice}>{choice}</option>
                        ))}
                        <option value="OTHER">Other</option>
                      </select>
                      {draft.relationshipChoice === 'OTHER' && (
                        <>
                          <label htmlFor="member-relationship-custom">
                            Specify relationship *
                          </label>
                          <input
                            id="member-relationship-custom"
                            required
                            maxLength={80}
                            value={draft.customRelationship}
                            onChange={(event) =>
                              change('customRelationship', event.target.value)
                            }
                          />
                        </>
                      )}
                    </>
                  )}
                  {draft.role === 'VIEWER' && data.openTaskCount > 0 && (
                    <p className={styles.warning}>
                      <AlertTriangle size={18} /> This member has{' '}
                      {data.openTaskCount} open assigned tasks. Viewers cannot
                      complete tasks. Assignments stay unchanged; an Admin or
                      Family Member can reassign them from Tasks.
                    </p>
                  )}
                  {data.member.role === 'ADMIN' &&
                    draft.role !== 'ADMIN' &&
                    data.pendingInvitations > 0 && (
                      <p className={styles.warning}>
                        This Admin issued {data.pendingInvitations} pending
                        invitation{data.pendingInvitations === 1 ? '' : 's'}. A
                        current Admin will need to resend them after this role
                        change so their links can be used.
                      </p>
                    )}
                  {needsHandover && (
                    <div className={editStyles.handover}>
                      <strong>
                        {data.managedRepeats.count} repeating-task{' '}
                        {data.managedRepeats.count === 1
                          ? 'rule needs'
                          : 'rules need'}{' '}
                        a new manager
                      </strong>
                      <ul>
                        {data.managedRepeats.sample.map((row) => (
                          <li key={row.id}>{row.title}</li>
                        ))}
                      </ul>
                      {data.managedRepeats.count >
                        data.managedRepeats.sample.length && (
                        <p>
                          Showing the first {data.managedRepeats.sample.length}{' '}
                          rules. All {data.managedRepeats.count} will transfer.
                        </p>
                      )}
                      <label htmlFor="member-repeat-manager">
                        Transfer repeat management to *
                      </label>
                      <select
                        id="member-repeat-manager"
                        required
                        value={draft.handoverToUserId}
                        onChange={(event) =>
                          change('handoverToUserId', event.target.value)
                        }
                      >
                        <option value="">Choose another active Admin</option>
                        {data.handoverCandidates.map((candidate) => (
                          <option
                            value={candidate.userId}
                            key={candidate.userId}
                          >
                            {candidate.name}
                            {candidate.userId === user.id ? ' (you)' : ''}
                          </option>
                        ))}
                      </select>
                      <p>
                        Future tasks keep the same schedule and assignees.
                        Existing tasks, completed work and history stay
                        unchanged.
                      </p>
                    </div>
                  )}
                  <div className={editStyles.summary}>
                    <strong>Confirm this change</strong>
                    <p>
                      {roleLabels[data.member.role]} → {roleLabels[draft.role]}
                    </p>
                    <p>
                      {data.member.isCreator
                        ? 'Creator relationship exemption retained.'
                        : `Relationship: ${draft.relationshipChoice === 'OTHER' ? draft.customRelationship || 'Not specified' : draft.relationshipChoice || 'Not selected'}`}
                    </p>
                    <label className={editStyles.confirm}>
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) =>
                          setAcknowledged(event.target.checked ? signature : '')
                        }
                      />{' '}
                      <span>
                        I confirm these access/relationship changes
                        {needsHandover
                          ? ` and the handover of ${data.managedRepeats.count} repeat ${data.managedRepeats.count === 1 ? 'rule' : 'rules'}`
                          : ''}
                        .
                      </span>
                    </label>
                  </div>
                </fieldset>
              )}
              {(blocked || error || previewDenied) && !connectionError && (
                <button
                  className={styles.secondary}
                  type="button"
                  disabled={pending}
                  onClick={reload}
                >
                  Reload latest details (replaces unsaved choices)
                </button>
              )}
            </div>
            <footer className={styles.modalFooter}>
              <button
                className={styles.secondary}
                type="button"
                disabled={pending}
                onClick={close}
              >
                Cancel
              </button>
              <button
                className={styles.primary}
                type="submit"
                disabled={
                  pending ||
                  !!connectionError ||
                  blocked ||
                  previewDenied ||
                  !data ||
                  !draft ||
                  (!hasAttempt && (!edited || !confirmed))
                }
              >
                {pending
                  ? 'Saving changes…'
                  : hasAttempt
                    ? 'Retry unchanged save'
                    : 'Save member changes'}
              </button>
            </footer>
          </form>
          <DiscardChangesDialog
            open={discard}
            pending={pending}
            title="Discard member changes?"
            description="These choices have not been confirmed as saved. Keep editing or discard the choices in this form."
            onKeepEditing={() => setDiscard(false)}
            onDiscard={() => {
              if (!lock.current) onClose();
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
