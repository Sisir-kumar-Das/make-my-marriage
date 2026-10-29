'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { Field, FormError, SubmitButton } from './form-controls';
import { ResendVerification } from './resend-verification';
import { cancelLoginRequest, runLoginRequest } from './login-request';
import { useInvitationContext } from '@/features/invitations/use-invitation-context';
import {
  invitationAuthHref,
  invitationHref,
  readInvitation,
} from '@/features/invitations/invitation-data';

const schema = z.object({
  email: z.string().trim().max(254).email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.').max(128),
});
export function LoginForm({ accountExists = false }) {
  const invitation = useInvitationContext();
  const loginRequest = useRef(null);
  const [checking, setChecking] = useState(true);
  const [unverified, setUnverified] = useState('');
  const {
    register,
    handleSubmit,
    resetField,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  useEffect(() => {
    const changeContext = (event) => {
      const operation = loginRequest.current;
      if (!operation) return;
      // newURL preserves intermediate A → B → A changes even before React renders.
      const location = event.newURL ? new URL(event.newURL) : window.location;
      const context = `${location.pathname}/${readInvitation(location.hash)}`;
      if (context === operation.context) return;
      cancelLoginRequest(loginRequest);
      resetField('password');
      setError('root', {
        message:
          'The invitation changed. Sign in again to continue with the current invitation.',
      });
    };
    window.addEventListener('hashchange', changeContext);
    window.addEventListener('popstate', changeContext);
    return () => {
      window.removeEventListener('hashchange', changeContext);
      window.removeEventListener('popstate', changeContext);
      cancelLoginRequest(loginRequest);
    };
  }, [resetField, setError]);
  useEffect(() => {
    let active = true;
    apiRequest('/auth/session')
      .then((result) => {
        if (active) {
          const invite = readInvitation(window.location.hash);
          window.location.replace(
            invite
              ? invitationHref(invite)
              : result.data.wedding
                ? '/dashboard'
                : '/wedding-setup',
          );
        }
      })
      .catch((failure) => {
        if (!active) return;
        if (failure.code !== 'SESSION_EXPIRED')
          setError('root', { message: failure.message });
        setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [setError]);
  async function submit(values) {
    setUnverified('');
    const invite = readInvitation(window.location.hash);
    const readContext = () =>
      `${window.location.pathname}/${readInvitation(window.location.hash)}`;
    await runLoginRequest({
      request: loginRequest,
      context: readContext(),
      readContext,
      send: (signal) =>
        apiRequest('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
          timeoutMs: 20000,
          signal,
        }),
      onSuccess: (result) => {
        resetField('password');
        window.location.replace(
          invite
            ? invitationHref(invite)
            : result.data.wedding
              ? '/dashboard'
              : '/wedding-setup',
        );
      },
      onFailure: (failure) => {
        if (failure.code === 'ACCOUNT_NOT_FOUND') {
          resetField('password');
          window.location.replace(
            invitationAuthHref('/register?from=login', invite),
          );
          return;
        }
        setError('root', { message: failure.message });
        if (failure.code === 'EMAIL_NOT_VERIFIED') setUnverified(values.email);
      },
    });
  }
  return (
    <>
      <h1 id="auth-title">Welcome back.</h1>
      <p className="mb-7 mt-3 text-sm leading-relaxed text-[var(--auth-muted)]">
        {invitation
          ? 'Sign in using the invited email to review and accept your wedding invitation.'
          : 'Sign in to continue planning every moment.'}
      </p>
      {accountExists && (
        <p
          role="status"
          className="mb-5 rounded bg-[var(--auth-soft)] p-4 text-sm leading-relaxed text-[var(--auth-primary)]"
        >
          An account already exists for this email. Sign in with your existing
          password, or choose Forgot password if you need to reset it.
        </p>
      )}
      {checking && (
        <p role="status" className="mb-5 text-sm text-[var(--auth-muted)]">
          Checking your session…
        </p>
      )}
      <form
        onSubmit={(event) => handleSubmit(submit)(event)}
        noValidate
        className="space-y-5"
      >
        <fieldset disabled={checking || isSubmitting} className="space-y-5">
          <Field
            id="login-email"
            label="Email address"
            type="email"
            autoComplete="username"
            maxLength={254}
            required
            {...register('email', {
              onChange: () => {
                setUnverified('');
                clearErrors('root');
              },
            })}
            error={errors.email?.message}
          />
          <Field
            id="login-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
            {...register('password', {
              onChange: () => {
                setUnverified('');
                clearErrors('root');
              },
            })}
            error={errors.password?.message}
          />
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-[var(--auth-primary)]"
            >
              Forgot password?
            </Link>
          </div>
          <FormError message={errors.root?.message} />
          <SubmitButton busy={isSubmitting} busyLabel="Signing in…">
            Sign in
          </SubmitButton>
        </fieldset>
      </form>
      {unverified && (
        <div className="mt-6 border-t border-[var(--auth-border)] pt-6">
          <ResendVerification
            invitation={invitation}
            key={unverified}
            initialEmail={unverified}
            compact
          />
        </div>
      )}
      <p className="mt-7 text-center text-sm text-[var(--auth-muted)]">
        New to Make My Marriage?{' '}
        <a
          href={invitationAuthHref('/register', invitation)}
          className="font-semibold text-[var(--auth-primary)] underline underline-offset-4"
        >
          Create an account
        </a>
      </p>
    </>
  );
}
