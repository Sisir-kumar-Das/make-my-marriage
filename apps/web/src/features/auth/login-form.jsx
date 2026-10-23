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
      setError('root', { message: failure.message });
      if (failure.code === 'EMAIL_NOT_VERIFIED') setUnverified(values.email);
    }
  }
  return (
    <>
      <h1 id="auth-title">Welcome back.</h1>
      <p className="mb-7 mt-3 text-sm leading-relaxed text-[#5C5457]">
        Sign in to continue planning every moment.
      </p>
      {accountExists && (
        <p
          role="status"
          className="mb-5 rounded-xl bg-[#F5EEE7] p-4 text-sm leading-relaxed text-[#6E334E]"
        >
          An account already exists for this email. Sign in with your existing
          password, or choose Forgot password if you need to reset it.
        </p>
      )}
      {checking && (
        <p role="status" className="mb-5 text-sm text-[#5C5457]">
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
            {...register('email')}
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
              className="text-sm font-medium text-[#6E334E]"
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
        <div className="mt-6 border-t border-[#E7DED7] pt-6">
          <ResendVerification initialEmail={unverified} />
        </div>
      )}
      <p className="mt-7 text-center text-sm text-[#5C5457]">
        New to Make My Marriage?{' '}
        <Link
          href="/register"
          className="font-semibold text-[#6E334E] underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
