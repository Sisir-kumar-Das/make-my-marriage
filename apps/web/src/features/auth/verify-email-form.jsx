'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { BadgeCheck, MailCheck } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { FormError, SubmitButton } from './form-controls';
import { ResendVerification } from './resend-verification';

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
  const token = new URLSearchParams(hash.slice(1)).get('token') || '';
  const validToken = /^[A-Za-z0-9_-]{43}$/.test(token);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');

  async function verify(event) {
    event.preventDefault();
    setState('pending');
    setError('');
    try {
      await apiRequest('/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        timeoutMs: 15000,
      });
      window.history.replaceState(null, '', window.location.pathname);
      setState('verified');
    } catch (failure) {
      setError(failure.message);
      setState(
        failure.code === 'INVALID_VERIFICATION_LINK' ? 'invalid' : 'idle',
      );
    }
  }

  if (state === 'verified')
    return (
      <>
        <BadgeCheck
          className="mb-5 text-[#6E334E]"
          size={40}
          aria-hidden="true"
        />
        <h1 id="auth-title">Email verified.</h1>
        <p
          role="status"
          className="mt-4 text-sm leading-relaxed text-[#5C5457]"
        >
          Your email address is confirmed. Your account is ready for the next
          step.
        </p>
        <Link
          href="/login"
          className="mt-7 inline-flex min-h-12 items-center rounded-full bg-[#6E334E] px-6 py-3 text-sm font-semibold text-white"
        >
          Continue to sign in
        </Link>
      </>
    );

  return (
    <>
      <MailCheck className="mb-5 text-[#6E334E]" size={36} aria-hidden="true" />
      <h1 id="auth-title">
        {validToken && state !== 'invalid'
          ? 'Verify your email.'
          : 'Check your inbox.'}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-[#5C5457]">
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
