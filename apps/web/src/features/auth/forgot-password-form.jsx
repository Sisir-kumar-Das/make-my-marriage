'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MailCheck, KeyRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { Field, FormError, SubmitButton } from './form-controls';

const schema = z.object({
  email: z.string().trim().max(254).email('Enter a valid email address.'),
});
export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [ttl, setTtl] = useState(30);
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });
  useEffect(() => {
    if (!seconds) return;
    const timer = setTimeout(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [seconds]);
  async function submit(values) {
    try {
      const result = await apiRequest('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
        timeoutMs: 15000,
      });
      setSeconds(result.data.retryAfterSeconds);
      setTtl(result.data.resetTtlMinutes);
      setSent(true);
    } catch (failure) {
      setError('root', { message: failure.message });
    }
  }
  return (
    <>
      {sent ? (
        <>
          <MailCheck
            className="mb-5 text-[#6E334E]"
            size={36}
            aria-hidden="true"
          />
          <h1 id="auth-title">Check your inbox.</h1>
          <p
            role="status"
            className="mt-4 text-sm leading-relaxed text-[#5C5457]"
          >
            If an eligible account exists for{' '}
            <span className="break-words font-semibold">
              {getValues('email')}
            </span>
            , we will email password reset instructions. Check your inbox and
            spam folder.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[#5C5457]">
            Each link expires after {ttl} minutes and can be used once.
            Requesting a newer link replaces the previous one.
          </p>
          <div className="mt-5">
            <FormError message={errors.root?.message} />
          </div>
          <button
            type="button"
            onClick={handleSubmit(submit)}
            disabled={seconds > 0 || isSubmitting}
            className="mt-6 flex min-h-12 w-full items-center justify-center rounded-full bg-[#6E334E] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isSubmitting
              ? 'Requesting link…'
              : seconds
                ? `Request another link in ${seconds}s`
                : 'Request another link'}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setSent(false)}
            className="mt-4 text-sm font-medium text-[#6E334E] underline underline-offset-4"
          >
            Use a different email
          </button>
        </>
      ) : (
        <>
          <KeyRound
            className="mb-5 text-[#6E334E]"
            size={36}
            aria-hidden="true"
          />
          <h1 id="auth-title">Reset your password.</h1>
          <p className="mb-7 mt-3 text-sm leading-relaxed text-[#5C5457]">
            Enter your account email and we’ll send you a secure reset link.
          </p>
          <form
            onSubmit={handleSubmit(submit)}
            noValidate
            className="space-y-5"
          >
            <fieldset disabled={isSubmitting}>
              <Field
                id="forgot-email"
                label="Email address"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                {...register('email')}
                error={errors.email?.message}
              />
            </fieldset>
            <FormError message={errors.root?.message} />
            <SubmitButton busy={isSubmitting} busyLabel="Requesting link…">
              Send reset link
            </SubmitButton>
          </form>
        </>
      )}
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
