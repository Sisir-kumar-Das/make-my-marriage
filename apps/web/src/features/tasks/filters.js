import { z } from 'zod';
import { readTaskNavigation, taskNavigationKeys } from './navigation.js';
const date = z.union([z.literal(''), z.iso.date().regex(/^[1-9]\d{3}-/)]);
const id = z.string().regex(/^[a-f\d]{24}$/);
export const emptyTaskFilters = {
  view: 'all',
  q: '',
  status: '',
  priority: '',
  assigneeId: '',
  eventId: '',
  from: '',
  to: '',
  overdue: '',
  recurring: '',
  page: 1,
};
export const taskFilterSchema = z
  .object({
    view: z.enum(['all', 'my']),
    q: z
      .string()
      .trim()
      .max(160, 'Search can be up to 160 characters.')
      .refine(
        (value) =>
          [...value].every(
            (character) =>
              character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
          ),
        'Search must not contain control characters.',
      ),
    status: z.enum(['', 'TODO', 'IN_PROGRESS', 'COMPLETED']),
    priority: z.enum(['', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    assigneeId: z.union([z.literal(''), z.literal('unassigned'), id]),
    eventId: z.union([z.literal(''), z.literal('none'), id]),
    from: date,
    to: date,
    overdue: z.enum(['', 'true', 'false']),
    recurring: z.enum(['', 'true', 'false']),
    page: z.coerce.number().int().min(1).max(100000),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'To date must be on or after From date.',
  });
const keys = Object.keys(emptyTaskFilters);
export function readTaskFilters(params) {
  const raw = Object.fromEntries(
    keys.map((key) => [key, params.get(key) ?? emptyTaskFilters[key]]),
  );
  const parsed = taskFilterSchema.safeParse(raw);
  const invalidKeys = [...params.keys()].some(
    (key) =>
      (!keys.includes(key) && !taskNavigationKeys.includes(key)) ||
      params.getAll(key).length > 1,
  );
  const navigation = readTaskNavigation(params);
  return {
    filters: parsed.success ? parsed.data : raw,
    error: invalidKeys
      ? 'Each task filter must be recognized and appear only once. Reset filters to repair this link.'
      : navigation.error
        ? navigation.error
        : parsed.success
          ? ''
          : parsed.error.issues[0].message,
    // Consuming a one-shot UI intent must not replace an in-flight list request.
    key: JSON.stringify(keys.map((key) => params.getAll(key))),
    navigation,
  };
}
export function taskFilterParams(filters, api = false) {
  const params = new URLSearchParams();
  for (const key of keys)
    if (
      filters[key] &&
      !(key === 'page' && Number(filters[key]) === 1) &&
      !(key === 'view' && (api || filters.view === 'all'))
    )
      params.set(key, String(filters[key]));
  return params;
}
export function taskFilterUrl(filters, fromEvent = null) {
  const params = taskFilterParams(filters);
  if (fromEvent) params.set('fromEvent', fromEvent);
  return '/tasks' + (params.size ? '?' + params : '');
}
export function hasTaskFilters(filters) {
  return keys.some((key) => !['view', 'page'].includes(key) && !!filters[key]);
}
