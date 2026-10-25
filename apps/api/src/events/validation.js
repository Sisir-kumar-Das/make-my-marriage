import { z } from 'zod';

const text = (max) => z.string().trim().max(max);
const instant = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
export const activityLimit = 50;
const activityFields = z
  .object({
    name: text(160).min(1, 'Enter an activity name.'),
    startAt: instant,
    endAt: instant.nullable(),
    description: text(1000),
  })
  .strict();
const activityInterval = (value) =>
  !value.endAt || Date.parse(value.endAt) > Date.parse(value.startAt);
const intervalIssue = {
  path: ['endAt'],
  message: 'Activity end must be after its start.',
};
export const createActivitySchema = activityFields
  .extend({
    endAt: instant.nullable().default(null),
    description: text(1000).default(''),
  })
  .refine(activityInterval, intervalIssue);
export const patchActivitySchema = activityFields
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide activity details to update.',
  );
export const removeActivitySchema = z.object({}).strict();
const activityRows = z
  .array(
    activityFields
      .extend({
        id: z
          .string()
          .regex(/^[a-f\d]{24}$/)
          .optional(),
        endAt: instant.nullable().default(null),
        description: text(1000).default(''),
      })
      .refine(activityInterval, intervalIssue),
  )
  .max(activityLimit)
  .refine((rows) => {
    const ids = rows.flatMap((row) => (row.id ? [row.id] : []));
    return new Set(ids).size === ids.length;
  }, 'An activity cannot appear twice.');
const venueFields = {
  name: text(200).default(''),
  formattedAddress: text(500).default(''),
  city: text(100).default(''),
  state: text(100).default(''),
};
const venue = z
  .union([
    z
      .object({ source: z.literal('MANUAL').default('MANUAL'), ...venueFields })
      .strict(),
    z
      .object({
        source: z.literal('GOOGLE'),
        googlePlaceId: z
          .string()
          .min(1)
          .max(512)
          .regex(/^[A-Za-z0-9_-]+$/),
        ...venueFields,
      })
      .strict(),
  ])
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
    activities: activityRows.optional(),
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
    q: text(160)
      .refine(
        (value) =>
          [...value].every(
            (character) =>
              character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
          ),
        'Search must not contain control characters.',
      )
      .optional(),
    status: fields.shape.status.optional(),
    from: z.iso
      .date()
      .regex(/^[1-9]\d{3}-/)
      .optional(),
    to: z.iso
      .date()
      .regex(/^[1-9]\d{3}-/)
      .optional(),
    locate: z
      .string()
      .regex(/^[a-f\d]{24}$/)
      .optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'To date must be on or after From date.',
  });
export const eventKeySchema = z.string().uuid();
export const eventVersion = (value) =>
  typeof value === 'string' && /^"\d{1,12}"$/.test(value)
    ? Number(value.slice(1, -1))
    : null;

export const eventLifecycleSchema = z.object({}).strict();
export const eventRecoveryListSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
