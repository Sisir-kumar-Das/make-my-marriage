'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MailCheck } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { Field, FormError, SubmitButton } from './form-controls';
import { ResendVerification } from './resend-verification';
import { passwordSchema, PasswordRequirements } from './password-fields';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter at least 2 characters.').max(100),
    email: z.string().trim().max(254).email('Enter a valid email address.'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export function RegisterForm() {
  const [submitted, setSubmitted] = useState(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });
  const password = useWatch({ control, name: 'password' });

  async function submit(values) {
    try {
      const result = await apiRequest('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          password: values.password,
        }),
        timeoutMs: 20000,
      });
      setSubmitted({
        email: values.email,
        cooldown: result.data.retryAfterSeconds,
        ttlHours: result.data.verificationTtlHours,
      });
      reset({ ...values, password: '', confirmPassword: '' });
    } catch (error) {
      if (error.code === 'EMAIL_UNAVAILABLE') {
        setSubmitted({
          email: values.email,
          cooldown: 0,
          error: error.message,
        });
        reset({ ...values, password: '', confirmPassword: '' });
      } else {
        setError('root', { message: error.message });
        for (const [name, message] of Object.entries(
          error.details?.fields || {},
        )) {
          if (['name', 'email', 'password'].includes(name))
            setError(name, { message });
        }
      }
    }
  }

  if (submitted)
    return (
      <>
        <MailCheck
          className="mb-5 text-[#6E334E]"
          size={36}
          aria-hidden="true"
        />
        <h1 id="auth-title">Check your inbox.</h1>
        <p className="mt-4 text-sm leading-relaxed text-[#5C5457]">
          If this address needs verification, you’ll receive an email with a
          secure link. Open it to confirm your email before continuing.
        </p>
        <p className="mt-3 text-sm text-[#5C5457]">
          Check your spam folder too. Each link can be used once
          {submitted.ttlHours
            ? ` and expires after ${submitted.ttlHours} hours.`
            : '.'}
        </p>
        <ResendVerification
          initialEmail={submitted.email}
          initialCooldown={submitted.cooldown}
          initialError={submitted.error}
          onEdit={() => setSubmitted(null)}
        />
      </>
    );

  return (
    <>
      <h1 id="auth-title">Create your wedding account.</h1>
      <p className="mb-7 mt-3 text-sm leading-relaxed text-[#5C5457]">
        Begin planning every moment with your family.
      </p>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5">
        <fieldset disabled={isSubmitting} className="space-y-5">
          <Field
            id="register-name"
            label="Display name"
            autoComplete="name"
            required
            maxLength={100}
            {...register('name')}
            error={errors.name?.message}
          />
          <Field
            id="register-email"
            label="Email address"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            {...register('email')}
            error={errors.email?.message}
          />
          <Field
            id="register-password"
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            maxLength={128}
            {...register('password')}
            error={errors.password?.message}
            aria-describedby="password-requirements"
          />
          <PasswordRequirements password={password} />
          <Field
            id="register-confirm"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            maxLength={128}
            {...register('confirmPassword')}
            error={errors.confirmPassword?.message}
          />
        </fieldset>
        <FormError message={errors.root?.message} />
        <SubmitButton busy={isSubmitting} busyLabel="Creating account…">
          Create account
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-[#5C5457]">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-semibold text-[#6E334E] underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
