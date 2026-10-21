'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { BadgeCheck, KeyRound, TimerOff } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { Field, FormError, SubmitButton } from './form-controls';
import { passwordSchema, PasswordRequirements } from './password-fields';

const schema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
const subscribe = (notify) => {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
};
export function ResetPasswordForm() {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => null,
  );
  const [completedToken, setCompletedToken] = useState('');
  const token = new URLSearchParams((hash || '').slice(1)).get('token') || '';
  if (completedToken && (token === completedToken || hash === ''))
    return <ResetSuccess />;
  if (hash === null)
    return (
      <>
        <h1 id="auth-title">Set a new password.</h1>
        <p role="status" className="mt-4 text-sm text-[#5C5457]">
          Reading your secure reset link…
        </p>
      </>
    );
  return (
    <ResetPasswordFields
      key={token}
      token={token}
      onSuccess={() => setCompletedToken(token)}
    />
  );
}

function ResetPasswordFields({ token, onSuccess }) {
  const valid = /^[A-Za-z0-9_-]{43}$/.test(token);
  const [state, setState] = useState('idle');
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const password = useWatch({ control, name: 'password' });
  async function submit(values) {
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: values.password }),
        timeoutMs: 20000,
      });
      reset();
      window.history.replaceState(null, '', window.location.pathname);
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('mmm-session');
        channel.postMessage('logout');
        channel.close();
      }
      onSuccess();
    } catch (failure) {
      setError('root', { message: failure.message });
      if (failure.code === 'INVALID_RESET_LINK') {
        reset();
        setState('invalid');
      } else if (failure.details?.fields?.password)
        setError('password', { message: failure.details.fields.password });
    }
  }
  if (!valid || state === 'invalid')
    return (
      <>
        <TimerOff
          className="mb-5 text-[#6E334E]"
          size={36}
          aria-hidden="true"
        />
        <h1 id="auth-title">Link expired or invalid.</h1>
        <p className="mt-4 text-sm leading-relaxed text-[#5C5457]">
          This password reset link is missing, expired or already used. For your
          security, request a new single-use link.
        </p>
        <Link
          href="/forgot-password"
          className="mt-7 inline-flex min-h-12 items-center rounded-full bg-[#6E334E] px-6 py-3 text-sm font-semibold text-white"
        >
          Request a new link
        </Link>
        <p className="mt-5 text-sm">
          <Link
            href="/login"
            className="font-semibold text-[#6E334E] underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </p>
      </>
    );
  return (
    <>
      <KeyRound className="mb-5 text-[#6E334E]" size={36} aria-hidden="true" />
      <h1 id="auth-title">Set a new password.</h1>
      <p className="mb-7 mt-3 text-sm leading-relaxed text-[#5C5457]">
        Choose and confirm a strong password for your account. Changing it signs
        out existing sessions.
      </p>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5">
        <fieldset disabled={isSubmitting} className="space-y-5">
          <Field
            id="reset-password"
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            maxLength={128}
            {...register('password')}
            error={errors.password?.message}
            aria-describedby="reset-password-requirements"
          />
          <PasswordRequirements
            password={password}
            id="reset-password-requirements"
          />
          <Field
            id="reset-confirm"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            maxLength={128}
            {...register('confirmPassword')}
            error={errors.confirmPassword?.message}
          />
        </fieldset>
        <FormError message={errors.root?.message} />
        <SubmitButton busy={isSubmitting} busyLabel="Updating password…">
          Reset password
        </SubmitButton>
      </form>
      <p className="mt-7 text-center text-sm">
        <Link
          href="/login"
          className="font-semibold text-[#6E334E] underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </p>
    </>
  );
}

function ResetSuccess() {
  return (
    <>
      <BadgeCheck
        className="mb-5 text-[#6E334E]"
        size={40}
        aria-hidden="true"
      />
      <h1 id="auth-title">Password updated.</h1>
      <p role="status" className="mt-4 text-sm leading-relaxed text-[#5C5457]">
        Your password has been changed. Existing sessions for this account have
        been signed out. Sign in with your new password to continue.
      </p>
      <Link
        href="/login"
        className="mt-7 inline-flex min-h-12 items-center rounded-full bg-[#6E334E] px-6 py-3 text-sm font-semibold text-white"
      >
        Continue to sign in
      </Link>
    </>
  );
}
