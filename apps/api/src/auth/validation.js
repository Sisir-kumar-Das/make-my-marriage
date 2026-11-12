import { visibleText } from '../../../../lib/visible-text.js';
import { z } from 'zod';

export const loginSchema = z
  .object({
    email: z.string().trim().max(254).email().toLowerCase(),
    password: z.string().min(1).max(128),
  })
  .strict();

export const emailSchema = z.string().trim().max(254).email().toLowerCase();

export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Z]/, 'Include an uppercase letter.')
  .regex(/[a-z]/, 'Include a lowercase letter.')
  .regex(/[0-9]/, 'Include a number.');

export const displayNameSchema = z
  .string('Enter a display name.')
  .trim()
  .min(2, 'Enter a display name with at least 2 characters.')
  .max(100, 'Use 100 characters or fewer for your display name.')
  .pipe(
    z
      .string()
      .refine(
        visibleText,
        'Use visible characters in your display name and remove any hidden formatting.',
      ),
  );

export const registerSchema = z
  .object({
    name: displayNameSchema,
    email: emailSchema,
    password: passwordSchema,
    invitation: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
  })
  .strict();

export const resendSchema = z
  .object({
    email: emailSchema,
    invitation: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
  })
  .strict();
export const verifySchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();

export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();
export const resetPasswordSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    password: passwordSchema,
  })
  .strict();
