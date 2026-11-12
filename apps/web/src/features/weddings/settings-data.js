import { z } from 'zod';
import { budgetMinor, traditions } from './form-data.js';
import { visibleText } from '../../../../../lib/visible-text.js';
import { budgetLabel } from './form-data.js';

const text = (max) =>
  z
    .string()
    .trim()
    .min(2, 'Enter at least 2 characters.')
    .max(max, `Use ${max} characters or fewer.`)
    .refine(
      visibleText,
      'Use visible characters and remove hidden formatting.',
    );
export const settingsFields = z.object({
  name: text(160),
  brideName: text(100),
  groomName: text(100),
  city: text(100),
  state: text(100),
  tradition: z.enum(traditions.map(([key]) => key)),
  budget: z
    .string()
    .max(40)
    .refine(
      (value) => settingsBudgetMinor(value) !== null,
      'Enter a valid INR amount with up to two decimal places.',
    ),
});
export function settingsBudgetMinor(value) {
  let input = value.trim();
  if (!input) return undefined;
  if (input.length > 40) return null;
  input = input
    .replace(/^(?:₹\s*|INR\s+)/i, '')
    .replace(/\s*INR$/i, '')
    .trim();
  if (!input) return null;
  const parts = input.split('.');
  if (parts.length > 2) return null;
  const [whole, fraction] = parts;
  // Group separators belong only to the integer portion, never the paise.
  if (fraction !== undefined && !/^\d{0,2}$/.test(fraction)) return null;
  if (
    whole.includes(',') &&
    !/^(?:\d{1,2}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})+)$/.test(whole)
  )
    return null;
  input =
    whole.replaceAll(',', '') + (fraction === undefined ? '' : '.' + fraction);
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(input)) return null;
  const normalized = input.startsWith('.')
    ? '0' + input
    : fraction === ''
      ? input.slice(0, -1)
      : input;
  return budgetMinor(normalized);
}
export function settingsBudgetLabel(amountMinor) {
  return budgetLabel(amountMinor).replace(/\.00$/, '') + ' INR';
}
export function settingsFieldErrors(fields = {}) {
  const aliases = {
    name: ['name'],
    brideName: ['brideName'],
    groomName: ['groomName'],
    tradition: ['tradition'],
    city: ['city'],
    state: ['state'],
    budget: ['budget'],
    'location.city': ['city'],
    'location.state': ['state'],
    location: ['city', 'state'],
    'estimatedBudget.amountMinor': ['budget'],
    'estimatedBudget.currency': ['budget'],
    estimatedBudget: ['budget'],
  };
  const result = {};
  for (const [path, message] of Object.entries(fields)) {
    const keys = aliases[path];
    if (!Array.isArray(keys) || typeof message !== 'string' || !message)
      continue;
    for (const key of keys) result[key] ??= message;
  }
  return result;
}
export function settingsDraft(wedding) {
  const amount = wedding.estimatedBudget
    ? BigInt(wedding.estimatedBudget.amountMinor)
    : undefined;
  return {
    name: wedding.name,
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    city: wedding.location.city,
    state: wedding.location.state,
    tradition: wedding.tradition,
    budget: amount === undefined ? '' : settingsBudgetLabel(Number(amount)),
  };
}
export function settingsChanges(saved, draft) {
  const changes = {};
  for (const field of ['name', 'brideName', 'groomName', 'tradition'])
    if (draft[field].trim() !== saved[field])
      changes[field] = draft[field].trim();
  if (
    draft.city.trim() !== saved.location.city ||
    draft.state.trim() !== saved.location.state
  )
    changes.location = { city: draft.city.trim(), state: draft.state.trim() };
  const amount = settingsBudgetMinor(draft.budget);
  if (amount !== (saved.estimatedBudget?.amountMinor ?? undefined))
    changes.estimatedBudget =
      amount === undefined ? null : { amountMinor: amount, currency: 'INR' };
  return changes;
}
