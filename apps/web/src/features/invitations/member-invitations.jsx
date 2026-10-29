'use client';
import { useEffect, useRef, useState } from 'react';
import { Dialog, AlertDialog } from 'radix-ui';
import { Copy, Mail, RefreshCw, Send, ShieldCheck, X } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { refreshState } from '@/lib/refresh-state';
import { useSession } from '@/features/auth/session-provider';
import { DiscardChangesDialog } from '@/features/tasks/discard-changes-dialog';
import { relationshipChoices, roleLabels } from './invitation-data';
import styles from './invitations.module.css';
const date = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
const initial = {
  email: '',
  role: 'FAMILY_MEMBER',
  relationshipChoice: '',
  customRelationship: '',
};
const descriptions = {
  FAMILY_MEMBER:
    'Manage events, tasks and checklist planning. Cannot invite members, remove ceremonies or change wedding settings.',
  ADMIN:
    'Full wedding authority, including invitations and member management as those controls become available. Choose only someone you trust to manage access.',
  VIEWER:
    'View the wedding schedule, tasks and checklists. Cannot edit, complete tasks or manage members.',
};
export function MemberInvitations({
  inviteShortcut = false,
  onMembersRefresh,
  open,
  setOpen,
  triggerRef,
}) {
  const { wedding, user, membership, connectionError, retrySession } =
    useSession();
  const [draft, setDraft] = useState(initial);
  const [clock, setClock] = useState(() => Date.now());
  const [discard, setDiscard] = useState(false),
    [pending, setPending] = useState(false);
  const [error, setError] = useState(''),
    [outcome, setOutcome] = useState('');
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [result, setResult] = useState(null);
  const [rowBusy, setRowBusy] = useState(''),
    [rowError, setRowError] = useState(''),
    [link, setLink] = useState(null),
    [revoking, setRevoking] = useState(null);
  const lock = useRef(false),
    attempt = useRef(null),
    rowAttempt = useRef(null),
    rowLock = useRef(false),
    notice = useRef(null);
  const allowed = membership.role === 'ADMIN';
  const scope = JSON.stringify([wedding.id, user.id, membership.role, page]);
  const key = `${scope}/${revision}`;
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (
      inviteShortcut &&
      new URLSearchParams(window.location.search).get('invite') === '1'
    ) {
      const params = new URLSearchParams(window.location.search);
      params.delete('invite');
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${params.size ? `?${params}` : ''}`,
      );
    }
  }, [inviteShortcut]);
  useEffect(() => {
    if (!allowed || connectionError) return;
    let active = true;
    const controller = new AbortController();
    apiRequest(`/weddings/${wedding.id}/invitations?page=${page}`, {
      signal: controller.signal,
      timeoutMs: 15000,
    })
      .then((response) => {
        if (active) setResult({ scope, key, data: response.data });
      })
      .catch((failure) => {
        if (active) setResult({ scope, key, error: failure.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [allowed, connectionError, key, scope, wedding.id, page]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'hidden')
        setRevision((value) => value + 1);
    };
    window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener('focus', refresh);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (open && (error || connectionError)) {
      notice.current?.focus({ preventScroll: true });
      notice.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, error, connectionError]);
  function close() {
    if (lock.current) return;
    if (JSON.stringify(draft) !== JSON.stringify(initial)) setDiscard(true);
    else setOpen(false);
  }
  function change(name, value) {
    setDraft((old) => ({ ...old, [name]: value }));
    setError('');
    attempt.current = null;
  }
  async function send(event) {
    event.preventDefault();
    if (lock.current || connectionError || !allowed) return;
    if (
      !draft.relationshipChoice ||
      (draft.relationshipChoice === 'OTHER' && !draft.customRelationship.trim())
    ) {
      setError('Choose a relationship, or specify it after selecting Other.');
      return;
    }
    const body = JSON.stringify(draft);
    if (attempt.current?.body !== body)
      attempt.current = { key: crypto.randomUUID(), body };
    lock.current = true;
    setPending(true);
    setDiscard(false);
    setError('');
    try {
      const response = await apiRequest(`/weddings/${wedding.id}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': attempt.current.key,
        },
        body,
        timeoutMs: 20000,
      });
      const submitted = response.data.invitation.delivery === 'SUBMITTED';
      setOutcome(
        response.data.replayed
          ? 'Your earlier invitation was already saved. Check its current status below; no additional email was sent.'
          : submitted
            ? 'Invitation created and submitted to Gmail. The person joins only after accepting. Check their inbox to confirm delivery.'
            : 'Invitation created, but email submission is failed or unconfirmed. Use Copy Link below, or resend later.',
      );
      attempt.current = null;
      setDraft(initial);
      setOpen(false);
      setPage(1);
      setRevision((value) => value + 1);
      onMembersRefresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  async function action(operation, invite) {
    if (rowLock.current || connectionError || !allowed) return;
    rowLock.current = true;
    setRowBusy(`${operation}/${invite.id}`);
    setRowError('');
    setLink(null);
    try {
      if (operation === 'COPY') {
        const response = await apiRequest(
          `/weddings/${wedding.id}/invitations/${invite.id}/link`,
        );
        setLink({ id: invite.id, url: response.data.url, copied: false });
        try {
          await navigator.clipboard.writeText(response.data.url);
          setLink({ id: invite.id, url: response.data.url, copied: true });
        } catch {
          /* The selectable link remains available when clipboard access is denied. */
        }
      } else {
        const body = JSON.stringify({ version: invite.version }),
          signature = `${operation}/${invite.id}/${body}`;
        if (rowAttempt.current?.signature !== signature)
          rowAttempt.current = { signature, key: crypto.randomUUID() };
        const response = await apiRequest(
          `/weddings/${wedding.id}/invitations/${invite.id}${operation === 'RESEND' ? '/resend' : ''}`,
          {
            method: operation === 'RESEND' ? 'POST' : 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': rowAttempt.current.key,
            },
            body,
            timeoutMs: 20000,
          },
        );
        rowAttempt.current = null;
        setRevoking(null);
        setOutcome(
          response.data.replayed
            ? 'Your earlier invitation action was already saved. Check its current status below; no additional email was sent.'
            : operation === 'REVOKE'
              ? 'Invitation revoked. Its link can no longer be accepted.'
              : response.data.invitation.delivery === 'SUBMITTED'
                ? 'Fresh invitation submitted to Gmail. The old link is invalid; the new link expires in seven days.'
                : 'A fresh invitation link was created, but email submission is failed or unconfirmed. Use Copy Link.',
        );
        setRevision((value) => value + 1);
      }
    } catch (failure) {
      setRowError(failure.message);
    } finally {
      rowLock.current = false;
      setRowBusy('');
    }
  }
  const snapshot = refreshState(result, scope, key);
  const data = !connectionError ? snapshot.data : null;
  const listError = connectionError || snapshot.error;
  const refreshing = !connectionError && snapshot.refreshing;
  if (!allowed) return null;
  return (
    <>
      <section
        className={styles.invitations}
        aria-labelledby="invitations-heading"
        aria-busy={refreshing || (!data && !listError)}
      >
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="invitations-heading">
              <Mail size={20} /> Invitations
            </h2>
            <p>
              Pending invitations do not grant access or count as active
              members.
            </p>
          </div>
          <button
            type="button"
            className={styles.textButton}
            disabled={refreshing}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw size={15} />
            <span role={refreshing ? 'status' : undefined}>
              {refreshing ? 'Refreshing invitations…' : 'Refresh invitations'}
            </span>
          </button>
        </div>
        {outcome && (
          <p role="status" className={styles.info}>
            {outcome}
          </p>
        )}
        {rowError && (
          <p role="alert" className={styles.error}>
            {rowError}
          </p>
        )}
        {listError ? (
          <div role="alert" className={styles.error}>
            {listError}
            <button
              className={styles.secondary}
              onClick={() =>
                connectionError
                  ? retrySession()
                  : setRevision((value) => value + 1)
              }
            >
              Retry invitations
            </button>
          </div>
        ) : !data ? (
          <p role="status">Loading invitations…</p>
        ) : (
          <>
            <p className={styles.pendingSummary}>
              {data.pendingCount} pending · Links expire seven days after issue
              or resend
            </p>
            {!data.invitations.length ? (
              <p className={styles.empty}>
                No invitations yet. Invite someone to plan this wedding with
                you.
              </p>
            ) : (
              <div className={styles.cards}>
                {data.invitations.map((invite) => {
                  const cooldown = Math.max(
                    0,
                    Math.ceil(
                      (new Date(invite.lastSentAt).getTime() + 45000 - clock) /
                        1000,
                    ),
                  );
                  const active = invite.status === 'PENDING',
                    renewable = active || invite.status === 'EXPIRED';
                  return (
                    <article key={invite.id} className={styles.invitationCard}>
                      <div className={styles.cardHeading}>
                        <strong>{invite.email}</strong>
                        <span className={styles.badge}>
                          {invite.status === 'PENDING'
                            ? 'Awaiting acceptance'
                            : invite.status.toLowerCase()}
                        </span>
                      </div>
                      <p>
                        Invited as <strong>{roleLabels[invite.role]}</strong> ·{' '}
                        {invite.relationship}
                      </p>
                      <p>
                        {active ? 'Expires' : 'Link expiry'}:{' '}
                        {date(invite.expiresAt)}
                      </p>
                      {active && (
                        <p
                          className={
                            invite.delivery === 'FAILED'
                              ? styles.warning
                              : styles.muted
                          }
                        >
                          {invite.delivery === 'SUBMITTED'
                            ? 'Submitted to Gmail; inbox delivery is not confirmed.'
                            : 'Email submission failed or is unconfirmed. You can share the link directly.'}
                        </p>
                      )}
                      <div className={styles.cardActions}>
                        {renewable && (
                          <button
                            className={styles.secondary}
                            disabled={
                              !!rowBusy ||
                              !!connectionError ||
                              refreshing ||
                              cooldown > 0
                            }
                            onClick={() => action('RESEND', invite)}
                          >
                            <Send size={14} />
                            {rowBusy === `RESEND/${invite.id}`
                              ? 'Sending…'
                              : cooldown > 0
                                ? `Resend in ${cooldown}s`
                                : 'Resend'}
                          </button>
                        )}
                        {active && (
                          <button
                            className={styles.secondary}
                            disabled={
                              !!rowBusy || !!connectionError || refreshing
                            }
                            onClick={() => action('COPY', invite)}
                          >
                            <Copy size={14} />
                            Copy Link
                          </button>
                        )}
                        {renewable && (
                          <button
                            className={styles.danger}
                            disabled={
                              !!rowBusy || !!connectionError || refreshing
                            }
                            onClick={() => {
                              setRowError('');
                              setRevoking(invite);
                            }}
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                      {link?.id === invite.id && (
                        <div className={styles.link}>
                          <label htmlFor={`link-${invite.id}`}>
                            {link.copied
                              ? 'Copied. Share only with the invited person.'
                              : 'Select and copy this invitation link.'}
                          </label>
                          <textarea
                            id={`link-${invite.id}`}
                            readOnly
                            value={link.url}
                            onFocus={(event) => event.target.select()}
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
            <nav className={styles.pagination} aria-label="Invitation pages">
              <span>
                Page {data.pagination.page} of{' '}
                {Math.max(1, data.pagination.totalPages)}
              </span>
              <div>
                <button
                  className={styles.secondary}
                  disabled={data.pagination.page <= 1}
                  onClick={() => setPage(data.pagination.page - 1)}
                >
                  Previous
                </button>
                <button
                  className={styles.secondary}
                  disabled={data.pagination.page >= data.pagination.totalPages}
                  onClick={() => setPage(data.pagination.page + 1)}
                >
                  Next
                </button>
              </div>
            </nav>
          </>
        )}
      </section>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content
            className={styles.modal}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (triggerRef?.current?.isConnected)
                triggerRef.current.focus({ preventScroll: true });
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
                <Dialog.Title>Invite Collaborator</Dialog.Title>
                <Dialog.Description>
                  Grant role-based access to {wedding.name}.
                </Dialog.Description>
              </div>
              <button
                type="button"
                className={styles.close}
                aria-label="Close invitation form"
                disabled={pending}
                onClick={close}
              >
                <X size={22} />
              </button>
            </header>
            <form onSubmit={send} className={styles.form}>
              <div className={styles.formBody}>
                {(error || connectionError) && (
                  <div
                    className={styles.error}
                    tabIndex={-1}
                    ref={notice}
                    role="alert"
                  >
                    {connectionError ? (
                      <>
                        Your invitation details are kept in this tab.{' '}
                        {connectionError}
                        <button
                          type="button"
                          className={styles.secondary}
                          disabled={pending}
                          onClick={retrySession}
                        >
                          Retry session check
                        </button>
                      </>
                    ) : (
                      error
                    )}
                  </div>
                )}
                <fieldset disabled={pending || !!connectionError}>
                  <label htmlFor="invite-email">
                    Invitee Email Address <span>*</span>
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    required
                    maxLength={254}
                    value={draft.email}
                    autoComplete="email"
                    onChange={(event) => change('email', event.target.value)}
                  />
                  <p className={styles.muted}>
                    They must sign in or register using this exact email, verify
                    it and explicitly accept.
                  </p>
                  <label htmlFor="invite-relationship">
                    Relationship to this wedding <span>*</span>
                  </label>
                  <select
                    id="invite-relationship"
                    required
                    value={draft.relationshipChoice}
                    onChange={(event) =>
                      change('relationshipChoice', event.target.value)
                    }
                  >
                    <option value="">Choose a relationship</option>
                    {relationshipChoices.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                    <option value="OTHER">Other</option>
                  </select>
                  {draft.relationshipChoice === 'OTHER' && (
                    <>
                      <label htmlFor="invite-custom">
                        Specify relationship <span>*</span>
                      </label>
                      <input
                        id="invite-custom"
                        required
                        maxLength={80}
                        value={draft.customRelationship}
                        onChange={(event) =>
                          change('customRelationship', event.target.value)
                        }
                        placeholder="For example, Bride’s childhood friend"
                      />
                    </>
                  )}
                  <h3 className={styles.roleLegend}>Select Workspace Role</h3>
                  {Object.entries(roleLabels)
                    .sort(([a], [b]) =>
                      a === 'FAMILY_MEMBER'
                        ? -1
                        : b === 'FAMILY_MEMBER'
                          ? 1
                          : 0,
                    )
                    .map(([role, label]) => (
                      <label className={styles.roleChoice} key={role}>
                        <input
                          type="radio"
                          name="invite-role"
                          value={role}
                          checked={draft.role === role}
                          onChange={() => change('role', role)}
                        />
                        <span>
                          <strong>
                            {label}{' '}
                            {role === 'FAMILY_MEMBER' && (
                              <small>Recommended</small>
                            )}
                          </strong>
                          <span>{descriptions[role]}</span>
                        </span>
                      </label>
                    ))}
                  {draft.role === 'ADMIN' && (
                    <p className={styles.warning}>
                      <ShieldCheck size={18} /> Admin grants full wedding
                      authority. Only invite someone you trust with access
                      management.
                    </p>
                  )}
                  <div className={styles.emailPreview}>
                    <span>RECIPIENT INVITATION PREVIEW</span>
                    <p>
                      <strong>{wedding.name}</strong> has invited you to join
                      their wedding planning workspace as{' '}
                      <strong>{roleLabels[draft.role]}</strong>.
                    </p>
                    <p>
                      No separate wedding needed. Joining requires explicit
                      acceptance.
                    </p>
                  </div>
                  <p className={styles.muted}>
                    The link expires in seven days. A new resend replaces the
                    previous link.
                  </p>
                </fieldset>
              </div>
              <footer className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={pending}
                  onClick={close}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={pending || !!connectionError}
                >
                  <Send size={16} />
                  {pending ? 'Sending invitation…' : 'Send Invitation'}
                </button>
              </footer>
            </form>
            <DiscardChangesDialog
              open={discard}
              pending={pending}
              title="Discard invitation details?"
              description="This invitation has not been submitted. Keep editing or discard these details."
              onKeepEditing={() => setDiscard(false)}
              onDiscard={() => {
                if (lock.current) return;
                setDiscard(false);
                setDraft(initial);
                attempt.current = null;
                setOpen(false);
                setError('');
              }}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <AlertDialog.Root
        open={!!revoking}
        onOpenChange={(next) => {
          if (!next && !rowLock.current) setRevoking(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles.overlay} />
          <AlertDialog.Content
            className={styles.confirm}
            onEscapeKeyDown={(event) => {
              if (rowLock.current) event.preventDefault();
            }}
          >
            <AlertDialog.Title>Revoke this invitation?</AlertDialog.Title>
            <AlertDialog.Description>
              {revoking?.email} will no longer be able to accept this link.
              Existing members are unaffected.
            </AlertDialog.Description>
            {rowError && (
              <p role="alert" className={styles.error}>
                {rowError}
              </p>
            )}
            {connectionError && (
              <div role="alert" className={styles.error}>
                Reconnect before revoking. Your confirmation stays open.
                <button
                  className={styles.secondary}
                  disabled={!!rowBusy}
                  onClick={retrySession}
                >
                  Retry session check
                </button>
              </div>
            )}
            <div className={styles.cardActions}>
              <AlertDialog.Cancel asChild>
                <button className={styles.secondary} disabled={!!rowBusy}>
                  Keep invitation
                </button>
              </AlertDialog.Cancel>
              <button
                className={styles.primary}
                disabled={!!rowBusy || !!connectionError}
                onClick={() => revoking && action('REVOKE', revoking)}
              >
                {rowBusy ? 'Revoking…' : 'Revoke invitation'}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
