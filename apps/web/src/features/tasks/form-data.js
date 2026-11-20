import { z } from 'zod';
import { indiaParts } from '../events/form-data.js';
import { repeatFields, validRepeat, repeatInput } from './recurrence-data.js';
export const taskStatuses = [
  ['TODO', 'To Do'],
  ['IN_PROGRESS', 'In Progress'],
  ['COMPLETED', 'Completed'],
];
export const taskPriorities = [
  ['LOW', 'Low'],
  ['MEDIUM', 'Medium'],
  ['HIGH', 'High'],
  ['URGENT', 'Urgent'],
];
const date = z
  .string()
  .regex(/^[1-9]\d{3}-\d{2}-\d{2}$/, 'Choose a valid date.')
  .refine((value) => {
    const instant = new Date(value + 'T12:00:00Z');
    return (
      Number.isFinite(instant.getTime()) &&
      instant.toISOString().slice(0, 10) === value
    );
  }, 'Choose a real calendar date.');
const time = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Choose a valid time.');
export const taskFormSchema = z
  .object({
    ...repeatFields,
    title: z.string().trim().min(1, 'Enter a task title.').max(160),
    description: z.string().trim().max(2000),
    status: z.enum(taskStatuses.map(([key]) => key)),
    priority: z.enum(taskPriorities.map(([key]) => key)),
    assigneeIds: z
      .array(z.string().regex(/^[a-f\d]{24}$/))
      .max(50)
      .default([]),
    eventId: z.union([z.literal(''), z.string().regex(/^[a-f\d]{24}$/)]),
    dueDate: z.union([z.literal(''), date]),
    dueTime: z.union([z.literal(''), time]),
  })
  .refine((value) => !value.dueTime || !!value.dueDate || value.repeatEnabled, {
    path: ['dueDate'],
    message: 'Choose a date for this time, or clear the time.',
  })
  .refine(validRepeat, {
    path: ['repeatEndDate'],
    message: 'Choose repeat start/end dates with end on or after start.',
  });
export function initialTask(task, initialCeremony) {
  const due = task?.dueAt ? indiaParts(task.dueAt) : null;
  return {
    repeatEnabled: false,
    repeatFrequency: 'WEEKLY',
    repeatInterval: 1,
    repeatStartDate: '',
    repeatEndDate: '',
    assigneeIds: [...(task?.assigneeIds || [])].sort(),
    title: task?.title || '',
    description: task?.description || '',
    status: task?.status || 'TODO',
    priority: task?.priority || 'MEDIUM',
    eventId: task?.eventId || (!task && initialCeremony?.id) || '',
    dueDate: due?.date || '',
    dueTime: due && !task.dueDateOnly ? due.time : '',
  };
}
export function taskInput(values) {
  const v = taskFormSchema.parse(values);
  return {
    assigneeIds: [...new Set(v.assigneeIds)].sort(),
    ...(v.repeatEnabled && { recurrence: repeatInput(v) }),
    title: v.title,
    description: v.description,
    status: v.repeatEnabled ? 'TODO' : v.status,
    priority: v.priority,
    eventId: v.eventId || null,
    dueAt:
      !v.repeatEnabled && v.dueDate
        ? new Date(
            `${v.dueDate}T${v.dueTime ? v.dueTime + ':00.000' : '23:59:59.999'}+05:30`,
          ).toISOString()
        : null,
    dueDateOnly: !v.repeatEnabled && !!v.dueDate && !v.dueTime,
  };
}
export function dueLabel(task) {
  if (!task.dueAt) return 'No deadline';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(!task.dueDateOnly && { hour: 'numeric', minute: '2-digit' }),
  }).format(new Date(task.dueAt));
}
export function isOverdue(task, now = Date.now()) {
  return (
    task.status !== 'COMPLETED' &&
    !!task.dueAt &&
    Date.parse(task.dueAt) < Number(now)
  );
}
export function draftTaskWarnings(values, wedding, now = Date.now()) {
  // Deadline guidance should appear even before a title is entered.
  const parsed = taskFormSchema.safeParse({
    ...values,
    title: 'Draft task',
    description: '',
    eventId: '',
  });
  if (!parsed.success || values.repeatEnabled) return [];
  const task = taskInput(parsed.data);
  if (!task.dueAt) return [];
  const warnings = [];
  if (task.status !== 'COMPLETED' && Date.parse(task.dueAt) < Number(now))
    warnings.push({
      code: 'PAST_DUE_DATE',
      message:
        'This deadline has already passed. This task will appear as Overdue until it is completed. Check the date before saving. You can still save this task.',
    });
  if (values.dueDate > wedding.mainDate)
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
