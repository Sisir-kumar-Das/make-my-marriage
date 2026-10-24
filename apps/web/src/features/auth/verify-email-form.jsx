'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { BadgeCheck, MailCheck } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { FormError, SubmitButton } from './form-controls';
import { ResendVerification } from './resend-verification';
import {
  cancelVerificationAttempt,
  runVerificationAttempt,
  verificationState,
} from './verification-state';

const subscribe = (notify) => {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
};

export function VerifyEmailForm() {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
  const [attempt, setAttempt] = useState(null);
  const request = useRef(null);
  const { token, validToken, state, error } = verificationState(hash, attempt);

  useEffect(
    () => () => {
      const operation = request.current;
      if (operation?.hash !== hash) return;
      request.current = null;
      operation.controller.abort();
      setAttempt((previous) => cancelVerificationAttempt(previous, operation));
    },
    [hash],
  );

  async function verify(event) {
    event.preventDefault();
    if (!validToken || state === 'pending') return;
    request.current?.controller.abort();
    const operation = { hash, controller: new AbortController() };
    request.current = operation;
    setAttempt({ hash, state: 'pending', error: '', operation });
    await runVerificationAttempt({
      operation,
      request,
      setAttempt,
      readHash: () => window.location.hash,
      send: () =>
        apiRequest('/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          timeoutMs: 15000,
          signal: operation.controller.signal,
        }),
      onVerified: () =>
        window.history.replaceState(null, '', window.location.pathname),
    });
  }

  if (state === 'verified')
    return (
      <>
        <BadgeCheck
          className="mb-5 text-[var(--auth-primary)]"
          size={40}
          aria-hidden="true"
        />
        <h1 id="auth-title">Email verified.</h1>
        <p
          role="status"
          className="mt-4 text-sm leading-relaxed text-[var(--auth-muted)]"
        >
          Your email address is confirmed. Your account is ready for the next
          step.
        </p>
        <Link
          href="/login"
          className="mt-7 inline-flex min-h-12 items-center rounded bg-[var(--auth-primary)] px-6 py-3 text-sm font-semibold text-white"
        >
          Continue to sign in
        </Link>
      </>
    );

  return (
    <>
      <MailCheck
        className="mb-5 text-[var(--auth-primary)]"
        size={36}
        aria-hidden="true"
      />
      <h1 id="auth-title">
        {validToken && state !== 'invalid'
          ? 'Verify your email.'
          : 'Check your inbox.'}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-[var(--auth-muted)]">
        {validToken && state !== 'invalid'
          ? 'Confirm your email address to finish creating your account. Verification links expire and can only be used once.'
          : 'Open the verification link in your email. If your link expired or was already used, you can request a new one below.'}
      </p>
      <div className="mt-5">
        <FormError
          message={
            error ||
            (hash && !validToken
              ? 'This verification link is invalid. Request another email below.'
              : '')
          }
        />
      </div>
      {validToken && state !== 'invalid' ? (
        <form onSubmit={verify} className="mt-6">
          <SubmitButton busy={state === 'pending'} busyLabel="Verifying email…">
            Verify email
          </SubmitButton>
        </form>
      ) : (
        <ResendVerification />
      )}
    </>
  );
}
