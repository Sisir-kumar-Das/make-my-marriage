import { z } from 'zod';

const text = (max) => z.string().trim().max(max);
const instant = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const venue = z
  .object({
    source: z.literal('MANUAL').default('MANUAL'),
    name: text(200).default(''),
    formattedAddress: text(500).default(''),
    city: text(100).default(''),
    state: text(100).default(''),
  })
  .strict()
  .nullable()
  .transform((value) =>
    value &&
    Object.entries(value).some(([key, item]) => key !== 'source' && item)
      ? value
      : null,
  );
const fields = z
  .object({
    name: text(160).min(1, 'Enter an event name.'),
    type: z.enum([
      'ENGAGEMENT',
      'HALDI',
      'MEHENDI',
      'SANGEET',
      'BARAJATRI',
      'WEDDING',
      'RECEPTION',
      'CUSTOM',
    ]),
    description: text(2000),
    startAt: instant,
    endAt: instant,
    venue,
    status: z.enum(['PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED']),
  })
  .strict();
export const createEventSchema = fields
  .extend({
    description: text(2000).default(''),
    status: fields.shape.status.default('PLANNED'),
    venue: venue.default(null),
  })
  .refine((value) => Date.parse(value.endAt) > Date.parse(value.startAt), {
    path: ['endAt'],
    message:
      'End must be after the start. Choose the next date for an overnight ceremony.',
  });
export const patchEventSchema = fields
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide the event details to update.',
  });
export const eventListSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const eventKeySchema = z.string().uuid();
export const eventVersion = (value) =>
  typeof value === 'string' && /^"\d{1,12}"$/.test(value)
    ? Number(value.slice(1, -1))
    : null;
