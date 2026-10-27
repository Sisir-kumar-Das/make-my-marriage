import { z } from 'zod';
import { recurrenceSchema } from './recurrence.js';

const text = (max) => z.string().trim().max(max);
const dueAt = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString())
  .nullable();
export const assigneeIdsSchema = z
  .array(z.string().regex(/^[a-f\d]{24}$/))
  .max(100)
  .transform((ids) => [...new Set(ids)].sort())
  .refine((ids) => ids.length <= 50, 'Choose up to 50 assignees.');
const fields = z
  .object({
    title: text(160).min(1, 'Enter a task title.'),
    description: text(2000),
    status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    assigneeIds: assigneeIdsSchema,
    dueAt,
    dueDateOnly: z.boolean(),
    eventId: z
      .string()
      .regex(/^[a-f\d]{24}$/)
      .nullable(),
  })
  .strict();
function validDue(value) {
  if (!value.dueDateOnly) return true;
  return (
    !!value.dueAt &&
    new Date(Date.parse(value.dueAt) + 19800000).toISOString().slice(11) ===
      '23:59:59.999Z'
  );
}
export const taskFieldsSchema = fields.refine(validDue, {
  path: ['dueAt'],
  message:
    'Date-only deadlines must use the end of the selected India-local day.',
});
export const createTaskSchema = fields
  .extend({
    description: fields.shape.description.default(''),
    assigneeIds: assigneeIdsSchema.default([]),
    status: fields.shape.status.default('TODO'),
    priority: fields.shape.priority.default('MEDIUM'),
    dueAt: dueAt.default(null),
    dueDateOnly: z.boolean().default(false),
    eventId: fields.shape.eventId.default(null),
    recurrence: recurrenceSchema.optional(),
  })
  .refine(validDue, {
    path: ['dueAt'],
    message: 'Choose a valid date-only deadline.',
  });
export const patchTaskSchema = fields
  .partial()
  .extend({ recurrence: recurrenceSchema.optional() })
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide task details to update.',
  );
export const taskPageSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
const calendarDate = z.iso.date().regex(/^[1-9]\d{3}-/);
export const taskListSchema = taskPageSchema
  .extend({
    q: z
      .string()
      .trim()
      .max(160)
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
    priority: fields.shape.priority.optional(),
    assigneeId: z
      .union([z.literal('unassigned'), z.string().regex(/^[a-f\d]{24}$/)])
      .optional(),
    eventId: z
      .union([z.literal('none'), z.string().regex(/^[a-f\d]{24}$/)])
      .optional(),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    overdue: z.enum(['true', 'false']).optional(),
    recurring: z.enum(['true', 'false']).optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'To date must be on or after From date.',
  });
export const taskKeySchema = z.string().uuid();
export const taskVersion = (value) =>
  typeof value === 'string' && /^"\d{1,12}"$/.test(value)
    ? Number(value.slice(1, -1))
    : null;

export function taskWarnings(task, wedding, now = new Date()) {
  if (!task.dueAt) return [];
  const due = new Date(task.dueAt);
  const warnings = [];
  if (task.status !== 'COMPLETED' && due.getTime() < now.getTime())
    warnings.push({
      code: 'PAST_DUE_DATE',
      message:
        'This deadline has already passed. This task will appear as Overdue until it is completed. Check the date before saving. You can still save this task.',
    });
  const indiaDate = new Date(due.getTime() + 19800000)
    .toISOString()
    .slice(0, 10);
  if (indiaDate > wedding.mainDate)
    warnings.push({
      code: 'AFTER_WEDDING_DATE',
      ...(task.status === 'COMPLETED' && { severity: 'info' }),
      message:
        task.status === 'COMPLETED'
          ? 'This completed task has a deadline after your wedding date. No action is needed.'
          : 'This deadline falls after your wedding date. Check the date; you can still save it.',
    });
  return warnings;
}
