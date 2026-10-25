import { z } from 'zod';

const date = z.union([z.literal(''), z.iso.date().regex(/^[1-9]\d{3}-/)]);
export const eventFilterSchema = z
  .object({
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
    status: z.enum(['', 'PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED']),
    from: date,
    to: date,
    page: z.coerce.number().int().min(1).max(100000),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'To date must be on or after From date.',
  });
export const emptyEventFilters = {
  q: '',
  status: '',
  from: '',
  to: '',
  page: 1,
};
const keys = Object.keys(emptyEventFilters);

export function readEventFilters(params) {
  const raw = Object.fromEntries(
    keys.map((key) => [key, params.get(key) ?? emptyEventFilters[key]]),
  );
  const parsed = eventFilterSchema.safeParse(raw);
  const duplicate = keys.some((key) => params.getAll(key).length > 1);
  return {
    filters: parsed.success ? parsed.data : raw,
    error: duplicate
      ? 'Each event filter may appear only once. Clear filters to reset the link.'
      : parsed.success
        ? ''
        : 'Check the search, status and date range. Use valid dates with To on or after From.',
    key: JSON.stringify(keys.map((key) => params.getAll(key))),
  };
}
export function eventFilterParams(filters) {
  const params = new URLSearchParams();
  for (const key of keys) {
    if (filters[key] && !(key === 'page' && Number(filters[key]) === 1))
      params.set(key, filters[key]);
  }
  return params;
}
export function eventFilterUrl(href, filters) {
  const url = new URL(href);
  for (const key of keys) url.searchParams.delete(key);
  for (const [key, value] of eventFilterParams(filters))
    url.searchParams.set(key, value);
  return url.pathname + url.search + url.hash;
}
export function hasEventFilters(filters) {
  return ['q', 'status', 'from', 'to'].some((key) => !!filters[key]);
}
// Presentation only: Express revalidates all filtering and computes the located page.
export function filtersForCreatedEvent(filters, event) {
  const next = { ...filters, page: 1 };
  if (next.status && next.status !== event.status) next.status = '';
  if (next.q) {
    const literal = next.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(literal, 'i');
    if (
      ![
        event.name,
        event.venue?.name,
        event.venue?.formattedAddress,
        event.venue?.city,
        event.venue?.state,
      ].some((value) => value && pattern.test(value))
    )
      next.q = '';
  }
  if (
    next.from &&
    Date.parse(event.endAt) <= Date.parse(`${next.from}T00:00:00+05:30`)
  )
    next.from = '';
  if (
    next.to &&
    Date.parse(event.startAt) >=
      Date.parse(`${next.to}T00:00:00+05:30`) + 86400000
  )
    next.to = '';
  return next;
}
