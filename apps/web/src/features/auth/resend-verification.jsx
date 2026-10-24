'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { Field, FormError, SubmitButton } from './form-controls';

export function ResendVerification({
  initialEmail = '',
  initialCooldown = 0,
  onEdit,
  initialError,
  compact = false,
}) {
  const [email, setEmail] = useState(initialEmail);
  const [seconds, setSeconds] = useState(initialCooldown);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || '');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(
      () => setSeconds((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [seconds]);

  async function resend(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await apiRequest('/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        timeoutMs: 20000,
      });
      setSeconds(result.data.retryAfterSeconds);
      setMessage(
        'If this address needs verification, a new link is on its way. Check your inbox and spam folder.',
      );
    } catch (failure) {
      setError(failure.message);
      if (failure.retryAfterSeconds) setSeconds(failure.retryAfterSeconds);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={resend} className="mt-6 space-y-5">
      {compact && initialEmail ? (
        <p className="break-words text-sm text-[var(--auth-muted)]">
          Your account is waiting for email verification. Request a new link for{' '}
          <strong>{initialEmail}</strong>, then verify it before signing in.
        </p>
      ) : (
        <Field
          id="resend-email"
          label="Email address"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={!!initialEmail}
          disabled={busy}
        />
      )}
      <FormError message={error} />
      {message && (
        <p
          role="status"
          className="rounded bg-[var(--auth-soft)] p-3 text-sm leading-relaxed"
        >
          {message}
        </p>
      )}
      {seconds > 0 ? (
        <p
          role="status"
          className="text-center text-sm text-[var(--auth-muted)]"
        >
          You can request another email in {seconds}s.
        </p>
      ) : (
        <SubmitButton busy={busy} busyLabel="Sending email…">
          Resend verification email
        </SubmitButton>
      )}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          className="min-h-11 w-full text-sm font-medium text-[var(--auth-primary)] underline underline-offset-4"
        >
          Use a different email
        </button>
      )}
    </form>
  );
}
