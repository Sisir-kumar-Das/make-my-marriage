import { z } from 'zod';

export function weddingToday(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const text = (max) =>
  z
    .string()
    .trim()
    .min(2)
    .max(max)
    .refine(
      (value) =>
        [...value].every(
          (letter) =>
            letter.charCodeAt(0) >= 32 && letter.charCodeAt(0) !== 127,
        ),
      'Use a single line of text.',
    );
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid wedding date.')
  .refine((value) => {
    const date = new Date(value + 'T12:00:00Z');
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      !value.startsWith('0000')
    );
  }, 'Choose a real calendar date.');

export const createWeddingSchema = z
  .object({
    name: text(160),
    brideName: text(100),
    groomName: text(100),
    mainDate: calendarDate,
    timezone: z.literal('Asia/Kolkata').default('Asia/Kolkata'),
    tradition: z.enum([
      'ODIA',
      'NORTH_INDIAN',
      'BENGALI',
      'SOUTH_INDIAN',
      'PUNJABI',
      'GUJARATI',
      'OTHER',
    ]),
    location: z
      .object({
        city: text(100),
        state: text(100),
        countryCode: z.literal('IN').default('IN'),
      })
      .strict(),
    estimatedBudget: z
      .object({
        amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
        currency: z.literal('INR'),
      })
      .strict()
      .optional(),
  })
  .strict();

export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,128}$/, 'Provide a valid Idempotency-Key.');
