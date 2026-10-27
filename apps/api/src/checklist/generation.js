import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../lib/api-error.js';
import { addDays, indiaToday, occurrenceDue } from '../tasks/recurrence.js';
import { readChecklistCatalog } from './catalog.js';

export const checklistSelectionSchema = z
  .object({
    templateId: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
    templateVersion: z.string().regex(/^[1-9]\d{0,8}$/),
  })
  .strict();
export const checklistGenerateSchema = checklistSelectionSchema.extend({
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const checklistHash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function checklistTemplate(input) {
  const template = readChecklistCatalog().templates.find(
    (row) => row.id === input.templateId,
  );
  if (!template)
    throw new ApiError(
      404,
      'TEMPLATE_NOT_FOUND',
      'This template is not available.',
    );
  if (template.version !== input.templateVersion)
    throw new ApiError(
      409,
      'TEMPLATE_VERSION_CHANGED',
      'This template changed. Reload the catalog before generating tasks.',
    );
  return template;
}
export function checklistPlan(template, wedding, existing, instant) {
  const counts = { toAdd: 0, kept: 0, deleted: 0, pastDue: 0 };
  const items = template.items.map((item) => {
    const current = existing.find((row) => row.source.itemKey === item.key);
    const disposition = current
      ? current.deletedAt
        ? 'DELETED'
        : 'KEPT'
      : 'ADD';
    const dueAt =
      disposition === 'ADD'
        ? occurrenceDue(
            addDays(wedding.mainDate, -item.daysBeforeWedding),
            null,
          ).toISOString()
        : disposition === 'KEPT' && current.dueAt
          ? new Date(current.dueAt).toISOString()
          : null;
    counts[
      disposition === 'ADD'
        ? 'toAdd'
        : disposition === 'KEPT'
          ? 'kept'
          : 'deleted'
    ]++;
    if (disposition === 'ADD' && dueAt < instant.toISOString())
      counts.pastDue++;
    return {
      itemKey: item.key,
      title: disposition === 'KEPT' ? current.title : item.title,
      description:
        disposition === 'KEPT' ? current.description || '' : item.description,
      priority: disposition === 'KEPT' ? current.priority : item.priority,
      dueAt,
      disposition,
      ...(disposition === 'KEPT' &&
        current.recurrenceExcluded && { retainedByRepeat: true }),
    };
  });
  return {
    template: {
      id: template.id,
      version: template.version,
      name: template.name,
    },
    weddingDate: wedding.mainDate,
    counts,
    items,
    previewHash: checklistHash({
      template,
      weddingDate: wedding.mainDate,
      revision: wedding.taskRevision || 0,
      today: indiaToday(instant),
      items,
    }),
  };
}
