import { z } from 'zod';

export const emailSchema = z.string().trim().max(254).email().toLowerCase();

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: emailSchema,
    password: z
      .string()
      .min(8)
      .max(128)
      .regex(/[A-Z]/, 'Include an uppercase letter.')
      .regex(/[a-z]/, 'Include a lowercase letter.')
      .regex(/[0-9]/, 'Include a number.'),
  })
  .strict();

export const resendSchema = z.object({ email: emailSchema }).strict();
export const verifySchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
