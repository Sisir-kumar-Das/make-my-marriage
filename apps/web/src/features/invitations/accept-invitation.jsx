'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  CalendarDays,
  Mail,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { Brand } from '@/features/home/brand';
import { inter, playfair } from '@/features/home/fonts';
import { apiRequest } from '@/lib/api-client';
import { useInvitationContext } from './use-invitation-context';
import {
  invitationAuthHref,
  roleLabels,
  readInvitation,
} from './invitation-data';
import styles from './invitations.module.css';
const states = {
  INVALID: [
    'This invitation link is invalid.',
    'Open the latest link from your email or ask the wedding Admin for a new invitation.',
  ],
  EXPIRED: [
    'This invitation has expired.',
    'Invitations last seven days. Ask the wedding Admin to resend a fresh invitation.',
  ],
  REVOKED: [
    'This invitation was revoked.',
    'The wedding Admin cancelled this invitation. Contact them if you still need access.',
  ],
  UNAVAILABLE: [
    'This invitation is unavailable.',
    'The wedding or inviting Admin is no longer available. Contact the wedding Admin for help.',
  ],
  ACCEPTED: [
    'This invitation was already accepted.',
    'Sign in using the account that accepted it to open your workspace. This link cannot join another account.',
  ],
};
export function AcceptInvitation() {
  const token = useInvitationContext('token');
  const [revision, setRevision] = useState(0),
    [result, setResult] = useState(null);
  const [failureState, setFailureState] = useState(null),
    [busy, setBusy] = useState(false),
    [accepted, setAccepted] = useState('');
  const lock = useRef(false),
    attempt = useRef(null),
    currentToken = useRef(token);
  const key = `${token}/${revision}`;
  useEffect(() => {
    currentToken.current = token;
  }, [token]);
  useEffect(() => {
    if (!token) return;
    let active = true;
    const controller = new AbortController();
    const identity = apiRequest('/auth/session', { signal: controller.signal })
      .then((response) => response.data)
      .catch((failure) => {
        if (failure.code === 'SESSION_EXPIRED') return null;
        throw failure;
      });
    Promise.all([
      apiRequest('/member-invitations/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: controller.signal,
      }),
      identity,
    ])
      .then(([preview, session]) => {
        if (active) setResult({ key, preview: preview.data, session });
      })
      .catch((failure) => {
        if (active) setResult({ key, error: failure.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, token]);
  useEffect(() => {
    const refresh = () => {
      if (!lock.current && document.visibilityState !== 'hidden')
        setRevision((value) => value + 1);
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  async function accept() {
    if (lock.current || !token) return;
    if (attempt.current?.token !== token)
      attempt.current = { token, key: crypto.randomUUID() };
    const operation = attempt.current;
    lock.current = true;
    setBusy(true);
    setFailureState(null);
    try {
      await apiRequest('/member-invitations/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': operation.key,
        },
        body: JSON.stringify({ token }),
        timeoutMs: 15000,
      });
      if (
        currentToken.current === operation.token &&
        readInvitation(window.location.hash, 'token') === operation.token
      )
        setAccepted(operation.token);
    } catch (failure) {
      if (
        currentToken.current === operation.token &&
        readInvitation(window.location.hash, 'token') === operation.token
      )
        setFailureState({ token, message: failure.message });
    } finally {
      lock.current = false;
      setBusy(false);
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
      setFailureState({ token, message: failure.message });
      lock.current = false;
      setBusy(false);
    }
  }
  const error = failureState?.token === token ? failureState.message : '';
  const current = result?.key === key ? result : null;
  const preview = current?.preview,
    session = current?.session;
  const matching =
    preview?.email?.trim().toLowerCase() ===
    session?.user?.email?.trim().toLowerCase();
  const alreadyWedding = !!session?.wedding;
  const acceptedSession = preview?.state === 'ACCEPTED' && !!session?.user;
  const success = token && accepted === token;
  const state = preview?.state && states[preview.state];
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
          {success ? <BadgeCheck size={20} /> : <ShieldCheck size={19} />}
          {success ? 'Invitation accepted' : 'Wedding workspace invitation'}
        </span>
        {success ? (
          <>
            <h1>Welcome to the celebration!</h1>
            <p>
              You have joined the wedding workspace. Your assigned role and
              relationship are saved.
            </p>
            <div className={styles.cardActions}>
              <a className={styles.primary} href="/dashboard">
                Open Workspace Dashboard
              </a>
            </div>
          </>
        ) : !token ? (
          <>
            <h1>Open your invitation link.</h1>
            <p>
              Use the complete link from your invitation email. If it is missing
              or invalid, ask the wedding Admin to resend it.
            </p>
            <Link className={styles.secondary} href="/login">
              Sign in
            </Link>
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
              {!acceptedSession && (
                <a
                  className={styles.secondary}
                  href={invitationAuthHref('/login', token)}
                >
                  Sign in
                </a>
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
            </div>
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
                  disabled={busy}
                  onClick={accept}
                >
                  {busy ? 'Accepting invitation…' : 'Accept invitation'}
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
            <p className={styles.muted}>
              Expires {dateLabel(preview.expiresAt)} · Joining requires your
              explicit acceptance.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
function dateLabel(value) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
