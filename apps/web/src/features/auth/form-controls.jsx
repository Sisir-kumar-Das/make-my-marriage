'use client';

import { useState } from 'react';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';

export function Field({ label, id, error, type = 'text', ...props }) {
  const [visible, setVisible] = useState(false);
  const password = type === 'password';
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          {...props}
          id={id}
          type={password && visible ? 'text' : type}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : props['aria-describedby']}
          className={password ? '!pr-12' : ''}
        />
        {password && (
          <button
            type="button"
            aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
            className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-r-lg text-[#5C5457]"
          >
            {visible ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          id={`${id}-error`}
          className="mt-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({ busy, children, busyLabel }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#6E334E] px-6 py-3 text-sm font-semibold text-white hover:bg-[#542439]"
    >
      {busy && (
        <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />
      )}
      {busy ? busyLabel : children}
    </button>
  );
}

export function FormError({ message }) {
  return message ? (
    <p
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-relaxed text-red-800"
    >
      {message}
    </p>
  ) : null;
}
