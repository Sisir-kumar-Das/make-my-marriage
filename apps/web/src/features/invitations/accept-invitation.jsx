'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertDialog } from 'radix-ui';
import {
  BadgeCheck,
  Ban,
  Building2,
  CalendarDays,
  CheckCheck,
  CircleX,
  History,
  Mail,
  MapPin,
  ShieldCheck,
  Unlink,
  UserRoundX,
  UserX,
} from 'lucide-react';
import { Brand } from '@/features/home/brand';
import { inter, playfair } from '@/features/home/fonts';
import { apiRequest } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/idempotency-key';
import { useInvitationContext } from './use-invitation-context';
import {
  invitationAuthHref,
  roleLabels,
  readInvitation,
} from './invitation-data';
import styles from './invitations.module.css';
// [heading, explanation, badge icon, badge label]; each closed state has its own badge (Stitch edge states).
const states = {
  INVALID: [
    'This invitation link is invalid.',
    'Open the latest link from your email or ask the wedding Admin for a new invitation.',
    Unlink,
    'Invalid link',
  ],
  EXPIRED: [
    'This invitation has expired.',
    'Invitations last seven days. Ask the wedding Admin to resend a fresh invitation.',
    History,
    'Expired invitation – 7-day limit',
  ],
  REVOKED: [
    'This invitation was revoked.',
    'The wedding Admin cancelled this invitation. Contact them if you still need access.',
    UserX,
    'Revoked invitation – Admin action',
  ],
  UNAVAILABLE: [
    'This invitation is unavailable.',
    'The wedding or inviting Admin is no longer available. Contact the wedding Admin for help.',
    Ban,
    'Invitation unavailable',
  ],
  DECLINED: [
    'This invitation was declined.',
    'It is closed and cannot be accepted. Ask the Admin for a fresh invitation if you change your mind.',
    CircleX,
    'Invitation declined',
  ],
  ACCEPTED: [
    'This invitation was already accepted.',
    'Sign in using the account that accepted it to open your workspace. This link cannot join another account.',
    CheckCheck,
    'Already used – Single-use link',
  ],
};
export function AcceptInvitation({ invitationId = '' }) {
  const token = useInvitationContext('token');
  return (
    <InvitationReview
      key={invitationId || token}
      token={token}
      invitationId={invitationId}
    />
  );
}
function InvitationReview({ token, invitationId }) {
  const context = invitationId || token;
  const fromApp = !!invitationId;
  const [revision, setRevision] = useState(0),
    [result, setResult] = useState(null);
  const [failureState, setFailureState] = useState(null),
    [busy, setBusy] = useState(false),
    [completed, setCompleted] = useState(null);
  // Sign-in state for the no-link screen: checking, signedIn, signedOut or unknown (check failed).
  const [auth, setAuth] = useState('checking');
  const [rejectOpen, setRejectOpen] = useState(false),
    [uncertainAction, setUncertainAction] = useState('');
  const mounted = useRef(false),
    rejectButton = useRef(null),
    rejectOpenRef = useRef(false),
    decisionSaved = useRef(false);
  const [pageId] = useState(newIdempotencyKey);
  useEffect(() => {
    const wasOpen = rejectOpenRef.current;
    rejectOpenRef.current = rejectOpen;
    // Catch up on refreshes skipped while the dialog was open.
    if (wasOpen && !rejectOpen && !decisionSaved.current)
      setRevision((value) => value + 1);
    decisionSaved.current = false;
  }, [rejectOpen]);
  const lock = useRef(false),
    attempt = useRef(null),
    currentToken = useRef(context);
  const key = `${context}/${revision}`;
  const fresh = result?.key === key ? result : null;
  // Keep the last loaded invitation on screen during a background refresh so clicks are not
  // lost; Express stays authoritative. Completed feedback still waits for the fresh identity
  // check (ADR-043), and a failed load is never reused.
  const current =
    fresh || (!completed && result && !result.error ? result : null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!context) return;
    let active = true;
    const controller = new AbortController();
    const identity = apiRequest('/auth/session', { signal: controller.signal })
      .then((response) => response.data)
      .catch((failure) => {
        if (failure.code === 'SESSION_EXPIRED') return null;
        throw failure;
      });
    Promise.all([
      fromApp
        ? apiRequest(`/member-invitations/inbox/${invitationId}`, {
            signal: controller.signal,
          })
        : apiRequest('/member-invitations/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
            signal: controller.signal,
          }),
      identity,
    ])
      .then(([preview, session]) => {
        if (!active) return;
        if (fromApp && preview.data.accountId !== session?.user.id)
          throw new Error(
            'Your signed-in account changed. Refresh the invitation to continue.',
          );
        if (attempt.current && attempt.current.actor !== session?.user.id) {
          attempt.current = null;
          setUncertainAction('');
          setFailureState(null);
        }
        // An unconfirmed accept cannot commit while the invitation is unavailable, so only Reject remains.
        if (
          preview.data.state === 'UNAVAILABLE' &&
          attempt.current?.action === 'accept'
        ) {
          attempt.current = null;
          setUncertainAction('');
          setFailureState(null);
        }
        setCompleted((saved) =>
          saved?.actor === session?.user.id ? saved : null,
        );
        setResult({ key, preview: preview.data, session });
      })
      .catch((failure) => {
        if (!active) return;
        setResult({ key, error: failure.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, context, fromApp, invitationId, token]);
  useEffect(() => {
    // Without a link there is no preview, so check sign-in separately; only confirmed expiry
    // counts as signed out.
    if (context) return;
    let active = true;
    const controller = new AbortController();
    apiRequest('/auth/session', { signal: controller.signal })
      .then(() => {
        if (active) setAuth('signedIn');
      })
      .catch((failure) => {
        if (!active) return;
        if (failure.code === 'SESSION_EXPIRED') setAuth('signedOut');
        // A failed check keeps any confirmed state; only the first check falls back to both links.
        else setAuth((value) => (value === 'checking' ? 'unknown' : value));
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [context, revision]);
  useEffect(() => {
    const refresh = () => {
      // Reloading blanks the invitation, which would disable Confirm rejection while its dialog is open.
      if (
        !lock.current &&
        !rejectOpenRef.current &&
        document.visibilityState !== 'hidden'
      )
        setRevision((value) => value + 1);
    };
    const channel =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('mmm-invitations')
        : null;
    // Other tabs announce their decisions; this page's own announcement must not reload it.
    if (channel)
      channel.onmessage = (event) => {
        if (event.data?.from !== pageId) refresh();
      };
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      clearInterval(timer);
      channel?.close();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [pageId]);
  async function decide(action) {
    const session = current?.session,
      preview = current?.preview;
    const allowed =
      preview?.state === 'PENDING' ||
      (action === 'decline' && preview?.canReject);
    if (lock.current || !context || !session || !allowed) return;
    if (
      attempt.current &&
      (attempt.current.actor !== session.user.id ||
        attempt.current.action !== action)
    )
      return;
    attempt.current ||= {
      actor: session.user.id,
      action,
      key: newIdempotencyKey(),
      path: fromApp
        ? `/member-invitations/inbox/${invitationId}/${action}`
        : `/member-invitations/${action}`,
      body: JSON.stringify({
        ...(fromApp ? { version: preview.version } : { token }),
        ...(action === 'decline' ? { confirmDecline: true } : {}),
      }),
    };
    const operation = attempt.current;
    lock.current = true;
    setBusy(true);
    setUncertainAction(action);
    setFailureState(null);
    try {
      await apiRequest(operation.path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': operation.key,
        },
        body: operation.body,
        timeoutMs: 15000,
      });
      // The decision is already saved here; retry the identity check quietly before reporting a problem.
      let identity;
      for (let tries = 0; !identity; tries += 1) {
        try {
          identity = await apiRequest('/auth/session');
        } catch (failure) {
          if (!mounted.current) return;
          if (tries >= 2 || failure.status === 401)
            throw new Error(
              'Your decision was saved, but we could not confirm your account yet. Retry or refresh this page.',
            );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      if (!mounted.current) return;
      if (identity.data.user.id !== operation.actor) {
        attempt.current = null;
        setUncertainAction('');
        setRevision((value) => value + 1);
        return;
      }
      if (
        !fromApp &&
        readInvitation(window.location.hash, 'token') !== currentToken.current
      )
        return;
      setCompleted({ actor: operation.actor, action: operation.action });
      // Closing after a saved decision must not reload and replace the result screen.
      decisionSaved.current = true;
      setRejectOpen(false);
      setUncertainAction('');
      if (typeof BroadcastChannel !== 'undefined') {
        for (const name of ['mmm-invitations', 'mmm-session']) {
          const channel = new BroadcastChannel(name);
          channel.postMessage(
            name === 'mmm-session'
              ? 'membership-changed'
              : { type: 'changed', from: pageId },
          );
          channel.close();
        }
      }
    } catch (failure) {
      if (
        !mounted.current ||
        (!fromApp &&
          readInvitation(window.location.hash, 'token') !==
            currentToken.current)
      )
        return;
      setFailureState({ token: context, message: failure.message });
      if (
        failure.status >= 400 &&
        failure.status < 500 &&
        [
          'INVITATION_ACCEPTED',
          'INVITATION_DECLINED',
          'INVITATION_EXPIRED',
          'INVITATION_REVOKED',
          'INVITATION_CHANGED',
          'INVITATION_UNAVAILABLE',
          'WEDDING_ALREADY_EXISTS',
          'INVITATION_EMAIL_MISMATCH',
        ].includes(failure.code)
      ) {
        attempt.current = null;
        setUncertainAction('');
        setRejectOpen(false);
        setRevision((value) => value + 1);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function switchAccount() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailureState(null);
    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('mmm-session');
        channel.postMessage('logout');
        channel.close();
      }
      window.location.replace(invitationAuthHref('/login', token));
    } catch (failure) {
      setFailureState({ token: context, message: failure.message });
      lock.current = false;
      setBusy(false);
    }
  }
  const error = failureState?.token === context ? failureState.message : '';
  const preview = current?.preview,
    session = current?.session;
  const matching =
    preview?.email?.trim().toLowerCase() ===
    session?.user?.email?.trim().toLowerCase();
  const alreadyWedding = !!session?.wedding;
  const acceptedSession = preview?.state === 'ACCEPTED' && !!session?.user;
  const completion =
    completed && completed.actor === session?.user.id ? completed.action : '';
  const success = !!completion;
  const state = preview?.state && states[preview.state];
  const [BadgeIcon, badgeLabel] = success
    ? [
        BadgeCheck,
        completion === 'accept' ? 'Invitation accepted' : 'Invitation declined',
      ]
    : !context
      ? [Unlink, 'Invitation link missing']
      : state
        ? state.slice(2)
        : preview && session && !matching
          ? [UserRoundX, 'Wrong email address']
          : preview && session && alreadyWedding
            ? [Building2, 'One wedding per account']
            : [ShieldCheck, 'Wedding workspace invitation'];
  return (
    <div
      className={`${styles.recipient} ${inter.variable} ${playfair.variable}`}
    >
      <header className={styles.recipientHeader}>
        <Brand href="/" />
        <Link href="/" className={styles.textButton}>
          Back to home
        </Link>
      </header>
      <main id="main-content" className={styles.acceptCard}>
        <span className={styles.acceptBadge}>
          <BadgeIcon size={19} aria-hidden="true" />
          {badgeLabel}
        </span>
        {success ? (
          <>
            <h1>
              {completion === 'accept'
                ? 'Welcome to the celebration!'
                : 'Invitation declined.'}
            </h1>
            <p>
              {completion === 'accept'
                ? 'You have joined the wedding workspace. Your assigned role and relationship are saved.'
                : 'You have not joined this wedding. This invitation is closed in the app and email. The Admin can send a fresh invitation if you change your mind.'}
            </p>
            <div className={styles.cardActions}>
              <a
                className={styles.primary}
                href={completion === 'accept' ? '/dashboard' : '/invitations'}
              >
                {completion === 'accept'
                  ? 'Open Workspace Dashboard'
                  : 'My Invitations'}
              </a>
            </div>
          </>
        ) : !context ? (
          <>
            <h1>Open your invitation link.</h1>
            <p>
              Use the complete link from your invitation email. If it is missing
              or invalid, ask the wedding Admin to resend it.
            </p>
            {auth === 'checking' ? null : auth === 'signedOut' ? (
              <>
                <div className={styles.cardActions}>
                  <Link className={styles.primary} href="/login">
                    Sign in
                  </Link>
                  <SignedOutInvitations />
                </div>
                <SignInHint />
              </>
            ) : auth === 'signedIn' ? (
              <Link className={styles.primary} href="/invitations">
                My Invitations
              </Link>
            ) : (
              <>
                <Link className={styles.primary} href="/invitations">
                  My Invitations
                </Link>
                <Link className={styles.secondary} href="/login">
                  Sign in
                </Link>
              </>
            )}
          </>
        ) : current?.error ? (
          <>
            <h1>We could not load your invitation.</h1>
            <p role="alert" className={styles.error}>
              {current.error}
            </p>
            <button
              className={styles.secondary}
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry invitation
            </button>
            <Link className={styles.textButton} href="/invitations">
              My Invitations
            </Link>
          </>
        ) : !current ? (
          <>
            <h1>Checking your invitation…</h1>
            <p role="status">
              Checking the link and your saved sign-in. No membership is added
              until you accept.
            </p>
          </>
        ) : state ? (
          <>
            <h1>{state[0]}</h1>
            <p>
              {acceptedSession
                ? alreadyWedding
                  ? 'This invitation has already been used. Open your existing wedding workspace below.'
                  : 'This invitation has already been used. Switch to the account that accepted it to continue.'
                : state[1]}
            </p>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <div className={styles.cardActions}>
              {session ? (
                <Link className={styles.secondary} href="/invitations">
                  My Invitations
                </Link>
              ) : (
                <>
                  <a
                    className={styles.primary}
                    href={invitationAuthHref('/login', token)}
                  >
                    Sign in
                  </a>
                  <SignedOutInvitations />
                </>
              )}
              {acceptedSession && !alreadyWedding && (
                <button
                  className={styles.secondary}
                  disabled={busy}
                  onClick={switchAccount}
                >
                  Sign out and switch account
                </button>
              )}
              {session?.wedding && (
                <a className={styles.primary} href="/dashboard">
                  Open my existing wedding
                </a>
              )}
              {session && preview.canReject && matching && (
                <button
                  ref={rejectButton}
                  type="button"
                  className={
                    session.wedding ? styles.secondary : styles.primary
                  }
                  disabled={busy}
                  onClick={() => setRejectOpen(true)}
                >
                  {uncertainAction === 'decline'
                    ? 'Retry rejection'
                    : 'Reject invitation'}
                </button>
              )}
            </div>
            {!session && <SignInHint />}
          </>
        ) : (
          <>
            <h1>{preview.wedding.name}</h1>
            <div className={styles.acceptMeta}>
              <span>
                <CalendarDays size={15} className="inline" />{' '}
                {new Intl.DateTimeFormat('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  dateStyle: 'long',
                }).format(
                  new Date(`${preview.wedding.mainDate}T00:00:00+05:30`),
                )}
              </span>
              {preview.wedding.city && (
                <span>
                  <MapPin size={15} className="inline" /> {preview.wedding.city}
                </span>
              )}
            </div>
            <p>
              Personal invitation sent by <strong>{preview.inviterName}</strong>
              .
            </p>
            <section className={styles.emailPreview}>
              <span>YOUR ASSIGNED ROLE</span>
              <p>
                <strong>{roleLabels[preview.role]}</strong> ·{' '}
                {preview.relationship}
              </p>
              <p>
                {preview.role === 'VIEWER'
                  ? 'You can view the wedding plan. Editing and completing tasks are unavailable.'
                  : preview.role === 'ADMIN'
                    ? 'Full wedding authority, including planning and invitation management.'
                    : 'You can manage events, tasks and checklist planning. Member management remains Admin-only.'}
              </p>
            </section>
            <div className={styles.info}>
              <Mail size={18} />
              <p>
                This invitation is reserved for <strong>{preview.email}</strong>
                . Use this exact verified email, then explicitly accept. You do
                not need to create another wedding.
              </p>
            </div>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            {uncertainAction && !busy && (
              <p className={styles.warning}>
                Your earlier{' '}
                {uncertainAction === 'accept' ? 'acceptance' : 'rejection'}{' '}
                result is unconfirmed. Retry the same decision, or refresh its
                status before choosing another action.
              </p>
            )}
            <button
              type="button"
              className={styles.textButton}
              disabled={busy || !fresh}
              onClick={() => setRevision((value) => value + 1)}
            >
              {fresh ? 'Refresh invitation status' : 'Refreshing…'}
            </button>
            {!session ? (
              <div className={styles.cardActions}>
                <a
                  className={styles.primary}
                  href={invitationAuthHref('/login', token)}
                >
                  Sign In
                </a>
                <a
                  className={styles.secondary}
                  href={invitationAuthHref('/register', token)}
                >
                  Register Account
                </a>
              </div>
            ) : !matching ? (
              <>
                <p className={styles.warning}>
                  You are signed in as <strong>{session.user.email}</strong>.
                  Switch to the invited account to accept.
                </p>
                <button
                  className={styles.primary}
                  disabled={busy}
                  onClick={switchAccount}
                >
                  Sign out and switch account
                </button>
              </>
            ) : alreadyWedding ? (
              <>
                <p className={styles.warning}>
                  You already belong to a wedding. V1 allows one active wedding
                  per account; this invitation cannot change your existing
                  membership.
                </p>
                <a className={styles.primary} href="/dashboard">
                  Open my existing wedding
                </a>
              </>
            ) : (
              <div className={styles.cardActions}>
                <button
                  className={styles.primary}
                  disabled={busy || uncertainAction === 'decline'}
                  onClick={() => decide('accept')}
                >
                  {busy
                    ? 'Saving decision…'
                    : uncertainAction === 'accept'
                      ? 'Retry acceptance'
                      : 'Accept invitation'}
                </button>
                <button
                  className={styles.secondary}
                  disabled={busy}
                  onClick={switchAccount}
                >
                  Switch account
                </button>
              </div>
            )}
            {session && matching && (
              <button
                ref={rejectButton}
                type="button"
                className={styles.secondary}
                disabled={busy || uncertainAction === 'accept'}
                onClick={() => setRejectOpen(true)}
              >
                {uncertainAction === 'decline'
                  ? 'Retry rejection'
                  : 'Reject invitation'}
              </button>
            )}
            <p className={styles.muted}>
              Expires {dateLabel(preview.expiresAt)} · Joining requires your
              explicit acceptance.
            </p>
          </>
        )}
      </main>
      <AlertDialog.Root
        open={rejectOpen}
        onOpenChange={(next) => {
          if (!busy) setRejectOpen(next);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles.overlay} />
          <AlertDialog.Content
            className={styles.confirm}
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              rejectButton.current?.focus();
            }}
          >
            <AlertDialog.Title>Reject this invitation?</AlertDialog.Title>
            <AlertDialog.Description>
              You will not join this wedding. This invitation closes in the app
              and email; the Admin can send a fresh invitation later.
            </AlertDialog.Description>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <div className={styles.cardActions}>
              <AlertDialog.Cancel className={styles.secondary} disabled={busy}>
                Cancel
              </AlertDialog.Cancel>
              <button
                className={styles.primary}
                disabled={
                  busy ||
                  !current ||
                  (preview?.state !== 'PENDING' && !preview?.canReject)
                }
                onClick={() => decide('decline')}
              >
                {busy ? 'Rejecting…' : 'Confirm rejection'}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
// My Invitations needs a signed-in account, so signed-out visitors see it disabled with the reason.
// aria-disabled (not disabled) keeps it focusable so screen readers announce the hint.
function SignedOutInvitations() {
  return (
    <button
      type="button"
      className={styles.secondary}
      aria-disabled="true"
      aria-describedby="invitation-sign-in-hint"
      onClick={(event) => event.preventDefault()}
    >
      My Invitations
    </button>
  );
}
function SignInHint() {
  return (
    <p id="invitation-sign-in-hint" className={styles.muted}>
      Sign in to see your invitations.
    </p>
  );
}
function dateLabel(value) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
