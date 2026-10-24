'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { Field, FormError, SubmitButton } from './form-controls';
import { ResendVerification } from './resend-verification';

const schema = z.object({
  email: z.string().trim().max(254).email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.').max(128),
});
export function LoginForm({ accountExists = false }) {
  const router = useRouter();
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
    let active = true;
    apiRequest('/auth/session')
      .then((result) => {
        if (active) {
          router.replace(result.data.wedding ? '/dashboard' : '/wedding-setup');
          router.refresh();
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
  }, [router, setError]);
  async function submit(values) {
    setUnverified('');
    try {
      const result = await apiRequest('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
        timeoutMs: 20000,
      });
      resetField('password');
      router.replace(result.data.wedding ? '/dashboard' : '/wedding-setup');
      router.refresh();
    } catch (failure) {
      if (failure.code === 'ACCOUNT_NOT_FOUND') {
        resetField('password');
        router.replace('/register?from=login');
        return;
      }
      setError('root', { message: failure.message });
      if (failure.code === 'EMAIL_NOT_VERIFIED') setUnverified(values.email);
    }
  }
  return (
    <>
      <h1 id="auth-title">Welcome back.</h1>
      <p className="mb-7 mt-3 text-sm leading-relaxed text-[var(--auth-muted)]">
        Sign in to continue planning every moment.
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
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5">
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
            {...register('password')}
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
            key={unverified}
            initialEmail={unverified}
            compact
          />
        </div>
      )}
      <p className="mt-7 text-center text-sm text-[var(--auth-muted)]">
        New to Make My Marriage?{' '}
        <Link
          href="/register"
          className="font-semibold text-[var(--auth-primary)] underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
