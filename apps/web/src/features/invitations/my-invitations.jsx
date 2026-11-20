'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, RefreshCw } from 'lucide-react';
import { Brand } from '@/features/home/brand';
import { inter, playfair } from '@/features/home/fonts';
import { apiRequest } from '@/lib/api-client';
import { roleLabels } from './invitation-data';
import styles from './invitations.module.css';

export function MyInvitations({ initialSession }) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const key = `${page}/${revision}`;
  const current = result?.key === key ? result : null;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.all([
      apiRequest('/auth/session', { signal: controller.signal }),
      apiRequest(`/member-invitations/inbox?page=${page}`, {
        signal: controller.signal,
      }),
    ])
      .then(([identity, inbox]) => {
        if (!active) return;
        if (identity.data.user.id !== inbox.data.accountId)
          throw new Error(
            'Your signed-in account changed. Refresh invitations to continue.',
          );
        setResult({ key, data: inbox.data, session: identity.data });
      })
      .catch((failure) => {
        if (active)
          setResult({ key, error: failure.message, code: failure.code });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [page, key]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'hidden')
        setRevision((value) => value + 1);
    };
    const channel =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('mmm-invitations')
        : null;
    if (channel) channel.onmessage = refresh;
    const sessions =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('mmm-session')
        : null;
    if (sessions)
      sessions.onmessage = (event) => {
        if (event.data === 'logout') {
          setResult(null);
          setRevision((value) => value + 1);
        } else refresh();
      };
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      channel?.close();
      sessions?.close();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, []);
  const session = current?.session || initialSession;
  const data = current?.data;
  return (
    <div
      className={`${styles.recipient} ${inter.variable} ${playfair.variable}`}
    >
      <header className={styles.recipientHeader}>
        <Brand href="/" />
        <Link
          className={styles.textButton}
          href={session.wedding ? '/dashboard' : '/wedding-setup'}
        >
          {session.wedding ? 'Back to workspace' : 'Back to wedding setup'}
        </Link>
      </header>
      <main id="main-content" className={styles.acceptCard}>
        <span className={styles.acceptBadge}>
          <Mail size={19} /> Your wedding invitations
        </span>
        <h1>My Invitations</h1>
        <p>
          Review invitations sent to your verified email. Choose Accept or
          Reject here, or use the invitation in your email.
        </p>
        {session.wedding && (
          <p className={styles.info}>
            You already have a wedding workspace. You can review or reject other
            invitations; V1 allows one active wedding per account.
          </p>
        )}
        <button
          className={styles.secondary}
          disabled={!current}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={15} /> Refresh invitations
        </button>
        {current?.error ? (
          <div className={styles.error} role="alert">
            {current.error}
            {current.code === 'SESSION_EXPIRED' && (
              <a className={styles.textButton} href="/login">
                Sign in again
              </a>
            )}
          </div>
        ) : !data ? (
          <p role="status">Loading your invitations…</p>
        ) : (
          <>
            <p className={styles.muted}>
              {data.pagination.total} pending · Accepted and declined
              invitations leave this list.
            </p>
            {!data.invitations.length && (
              <p className={styles.empty}>
                No pending invitations.{' '}
                {session.wedding
                  ? 'Return to your workspace to continue planning.'
                  : 'You can create your own wedding or ask an Admin to invite your verified email.'}
              </p>
            )}
            <div className={styles.inboxCards}>
              {data.invitations.map((invite) => (
                <article className={styles.invitationCard} key={invite.id}>
                  <h2 className={styles.inboxTitle}>
                    {invite.wedding?.name || 'Invitation unavailable'}
                  </h2>
                  {invite.state === 'PENDING' ? (
                    <>
                      <p>Invited by {invite.inviterName}</p>
                      <p>
                        <strong>{roleLabels[invite.role]}</strong> ·{' '}
                        {invite.relationship}
                      </p>
                      <p>
                        Expires{' '}
                        {new Intl.DateTimeFormat('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(invite.expiresAt))}
                      </p>
                      <Link
                        className={styles.primary}
                        href={`/invitations/${invite.id}`}
                      >
                        Review invitation · Accept or Reject
                      </Link>
                    </>
                  ) : (
                    <>
                      <p>
                        This invitation is no longer available. Ask the wedding
                        Admin for help.
                      </p>
                      {invite.canReject && (
                        <Link
                          className={`${styles.primary} ${styles.rowAction}`}
                          href={`/invitations/${invite.id}`}
                        >
                          Review invitation · Reject only
                        </Link>
                      )}
                    </>
                  )}
                </article>
              ))}
            </div>
            <div className={styles.pagination}>
              <button
                className={styles.secondary}
                disabled={data.pagination.page <= 1}
                onClick={() => setPage(data.pagination.page - 1)}
              >
                Previous
              </button>
              <span>
                Page {data.pagination.page} of{' '}
                {Math.max(1, data.pagination.totalPages)}
              </span>
              <button
                className={styles.secondary}
                disabled={data.pagination.page >= data.pagination.totalPages}
                onClick={() => setPage(data.pagination.page + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
