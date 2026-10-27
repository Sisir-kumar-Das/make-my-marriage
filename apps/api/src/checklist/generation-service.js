import { ApiError } from '../lib/api-error.js';
import { weddingModels } from '../weddings/models.js';
import { eventModels } from '../events/models.js';
import { taskModels } from '../tasks/models.js';
import { taskKeySchema } from '../tasks/validation.js';
import { checklistModels } from './models.js';
import {
  checklistSelectionSchema,
  checklistGenerateSchema,
  checklistHash,
  checklistTemplate,
  checklistPlan,
} from './generation.js';

function inputFor(schema, raw) {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Check the selected template and generation preview.',
    );
  return result.data;
}
function validWedding(id) {
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/.test(id))
    throw new ApiError(
      404,
      'WEDDING_NOT_FOUND',
      'This wedding is not available.',
    );
}
function generationDto(row) {
  return {
    id: String(row._id),
    templateId: row.templateId,
    templateVersion: row.templateVersion,
    templateName: row.templateName,
    weddingDate: row.weddingDate,
    added: row.added,
    kept: row.kept,
    deleted: row.deleted,
    createdAt: row.createdAt.toISOString(),
  };
}
export function createChecklistGeneration({ database, now, authorize }) {
  async function plan(connection, transaction, wedding, template, instant) {
    const existing = await taskModels(connection)
      .Task.find({
        weddingId: wedding._id,
        'source.type': 'CHECKLIST',
        'source.templateId': template.id,
        'source.itemKey': { $in: template.items.map((row) => row.key) },
      })
      .session(transaction)
      .lean();
    return checklistPlan(template, wedding, existing, instant);
  }
  async function previewChecklist(userId, weddingId, raw) {
    validWedding(weddingId);
    const input = inputFor(checklistSelectionSchema, raw);
    const connection = await database.connect();
    let result;
    await connection.transaction(
      async (transaction) => {
        const wedding = await authorize(
          connection,
          transaction,
          userId,
          weddingId,
        );
        const member = await weddingModels(connection)
          .WeddingMember.findOne({ weddingId, userId, status: 'ACTIVE' })
          .session(transaction)
          .lean();
        if (!['ADMIN', 'FAMILY_MEMBER'].includes(member?.role))
          throw new ApiError(
            403,
            'FORBIDDEN',
            'Only an Admin or Family Member can prepare task generation.',
          );
        result = await plan(
          connection,
          transaction,
          wedding,
          checklistTemplate(input),
          now(),
        );
      },
      { readConcern: { level: 'snapshot' } },
    );
    return result;
  }
  async function generateChecklist(userId, weddingId, raw, key) {
    validWedding(weddingId);
    const input = inputFor(checklistGenerateSchema, raw);
    if (!taskKeySchema.safeParse(key).success)
      throw new ApiError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Retry generation with its original request key.',
      );
    const connection = await database.connect();
    const { ChecklistGeneration, ChecklistWriteRequest } =
      checklistModels(connection);
    const requestHash = checklistHash({
      action: 'GENERATE_CHECKLIST',
      ...input,
    });
    let result;
    await connection.transaction(
      async (transaction) => {
        const wedding = await authorize(
          connection,
          transaction,
          userId,
          weddingId,
          true,
        );
        const instant = now();
        const identity = { weddingId, userId, keyHash: checklistHash(key) };
        const receipt = await ChecklistWriteRequest.findOne({
          ...identity,
          expiresAt: { $gt: instant },
        })
          .session(transaction)
          .lean();
        if (receipt) {
          if (receipt.requestHash !== requestHash)
            throw new ApiError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'This generation key was used with different details. Review a fresh preview.',
            );
          const previous = await ChecklistGeneration.findOne({
            _id: receipt.generationId,
            weddingId,
          })
            .session(transaction)
            .lean();
          if (!previous)
            throw new ApiError(
              409,
              'GENERATION_UNAVAILABLE',
              'The earlier generation cannot be confirmed. Review the task list before continuing.',
            );
          result = { generation: generationDto(previous), replayed: true };
          return;
        }
        const template = checklistTemplate(input);
        const preview = await plan(
          connection,
          transaction,
          wedding,
          template,
          instant,
        );
        if (preview.previewHash !== input.previewHash)
          throw new ApiError(
            409,
            'CHECKLIST_PREVIEW_CHANGED',
            'Your wedding plan or date changed. Review the latest preview before generating tasks.',
          );
        const { Task } = taskModels(connection);
        const additions = preview.items.filter(
          (row) => row.disposition === 'ADD',
        );
        const created = additions.length
          ? await Task.create(
              additions.map((item) => ({
                weddingId,
                title: item.title,
                description: item.description,
                status: 'TODO',
                priority: item.priority,
                dueAt: item.dueAt,
                dueDateOnly: !!item.dueAt,
                eventId: null,
                assigneeIds: [],
                source: {
                  type: 'CHECKLIST',
                  templateId: template.id,
                  templateVersion: template.version,
                  itemKey: item.itemKey,
                },
                createdBy: userId,
                updatedBy: userId,
                createdAt: instant,
                updatedAt: instant,
              })),
              { session: transaction, ordered: true },
            )
          : [];
        const [generation] = await ChecklistGeneration.create(
          [
            {
              weddingId,
              templateId: template.id,
              templateVersion: template.version,
              templateName: template.name,
              weddingDate: wedding.mainDate,
              added: created.length,
              kept: preview.counts.kept,
              deleted: preview.counts.deleted,
              addedTaskIds: created.map((task) => task._id),
              createdBy: userId,
              createdAt: instant,
            },
          ],
          { session: transaction, ordered: true },
        );
        await eventModels(connection).Activity.create(
          [
            ...created.map((task) => ({
              weddingId,
              actorId: userId,
              action: 'TASK_CREATED',
              entityType: 'TASK',
              entityId: task._id,
              displaySnapshot: { label: task.title },
              createdAt: instant,
            })),
            {
              weddingId,
              actorId: userId,
              action: 'CHECKLIST_GENERATED',
              entityType: 'CHECKLIST_GENERATION',
              entityId: generation._id,
              displaySnapshot: { label: template.name },
              createdAt: instant,
            },
          ],
          { session: transaction, ordered: true },
        );
        await ChecklistWriteRequest.updateOne(
          identity,
          {
            $set: {
              requestHash,
              generationId: generation._id,
              expiresAt: new Date(instant.getTime() + 86400000),
            },
          },
          { upsert: true, session: transaction },
        );
        result = { generation: generationDto(generation), replayed: false };
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
    return result;
  }
  return { previewChecklist, generateChecklist };
}
