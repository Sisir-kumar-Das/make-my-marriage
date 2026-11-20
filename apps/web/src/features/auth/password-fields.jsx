import { z } from 'zod';
import { Check } from 'lucide-react';

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'Use no more than 128 characters.')
  .regex(/[A-Z]/, 'Include an uppercase letter.')
  .regex(/[a-z]/, 'Include a lowercase letter.')
  .regex(/[0-9]/, 'Include a number.');

export function PasswordRequirements({
  password = '',
  id = 'password-requirements',
}) {
  return (
    <div id={id} className="rounded bg-[var(--auth-soft)] p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide">
        Password requirements
      </p>
      <ul className="grid gap-2 text-xs sm:grid-cols-2">
        {[
          [password.length >= 8, 'At least 8 characters'],
          [/[A-Z]/.test(password), 'One uppercase letter'],
          [/[a-z]/.test(password), 'One lowercase letter'],
          [/[0-9]/.test(password), 'One number'],
        ].map(([met, label]) => (
          <li key={label} className="flex items-center gap-2">
            <Check
              size={14}
              className={
                met ? 'text-emerald-800' : 'text-[var(--auth-muted)]/50'
              }
              aria-hidden="true"
            />
            <span>
              {label}
              {met && <span className="sr-only"> — met</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-[var(--auth-muted)]">
        Special characters are optional.
      </p>
    </div>
  );
}
