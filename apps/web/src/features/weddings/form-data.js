import { z } from 'zod';

export const traditions = [
  ['ODIA', 'Odia'],
  ['NORTH_INDIAN', 'North Indian / Vedic'],
  ['BENGALI', 'Bengali'],
  ['SOUTH_INDIAN', 'South Indian'],
  ['PUNJABI', 'Punjabi'],
  ['GUJARATI', 'Gujarati'],
  ['OTHER', 'Other / inter-cultural'],
];
const text = (max) =>
  z
    .string()
    .trim()
    .min(2, 'Enter at least 2 characters.')
    .max(max)
    .refine(
      (value) =>
        [...value].every(
          (letter) =>
            letter.charCodeAt(0) >= 32 && letter.charCodeAt(0) !== 127,
        ),
      'Use a single line of text.',
    );
const validDate = (value) => {
  const date = new Date(value + 'T12:00:00Z');
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    !value.startsWith('0000')
  );
};
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
export function budgetMinor(value) {
  const input = value.trim();
  if (!input) return undefined;
  if (!/^\d+(\.\d{1,2})?$/.test(input)) return null;
  const [whole, fraction = ''] = input.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}
const setupFields = z.object({
  name: text(160),
  brideName: text(100),
  groomName: text(100),
  mainDate: z.string().refine(validDate, 'Choose a real wedding date.'),
  city: text(100),
  state: text(100),
  tradition: z.enum(traditions.map(([key]) => key)),
  budget: z
    .string()
    .max(20)
    .refine(
      (value) => budgetMinor(value) !== null,
      'Enter an amount with up to two decimal places.',
    ),
  coverMediaId: z
    .string()
    .regex(/^(?:[a-f\d]{24})?$/)
    .optional(),
  coverFrame: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      zoom: z.number().min(1).max(3),
    })
    .optional(),
});
export function setupSchemaForSubmission(previous, now = () => new Date()) {
  return setupFields.superRefine((data, context) => {
    if (!validDate(data.mainDate) || data.mainDate >= weddingToday(now()))
      return;
    // Only a previously attempted, identical normalized API payload may pass
    // after midnight. Express decides whether it was saved or is a new wedding.
    if (previous?.key && previous.body === JSON.stringify(toWeddingInput(data)))
      return;
    context.addIssue({
      code: 'custom',
      path: ['mainDate'],
      message: 'Choose today or a future date (India time).',
    });
  });
}
export const setupSchema = setupSchemaForSubmission();
export function suggestedWeddingName(brideName, groomName) {
  const bride = brideName.trim().split(/\s+/)[0];
  const groom = groomName.trim().split(/\s+/)[0];
  return bride && groom ? groom + ' weds ' + bride : '';
}
export function weddingInput(values, previous, now) {
  return toWeddingInput(setupSchemaForSubmission(previous, now).parse(values));
}
function toWeddingInput(data) {
  const amountMinor = budgetMinor(data.budget);
  return {
    name: data.name,
    brideName: data.brideName,
    groomName: data.groomName,
    mainDate: data.mainDate,
    tradition: data.tradition,
    timezone: 'Asia/Kolkata',
    location: { city: data.city, state: data.state, countryCode: 'IN' },
    ...(data.coverMediaId
      ? {
          coverMediaId: data.coverMediaId,
          coverFrame: data.coverFrame || { x: 0.5, y: 0.5, zoom: 1 },
        }
      : {}),
    ...(amountMinor === undefined
      ? {}
      : { estimatedBudget: { amountMinor, currency: 'INR' } }),
  };
}
export const weddingDate = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value + 'T12:00:00Z'));
const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export function budgetLabel(amountMinor) {
  const paise = BigInt(amountMinor);
  const fraction = (paise % 100n).toString().padStart(2, '0');
  // Format whole rupees as BigInt; converting them to a decimal Number loses paise.
  return inr
    .formatToParts(paise / 100n)
    .map((part) => (part.type === 'fraction' ? fraction : part.value))
    .join('');
}
