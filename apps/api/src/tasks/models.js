import mongoose from 'mongoose';
const { Schema } = mongoose;
const taskSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, maxlength: 160 },
    description: { type: String, maxlength: 2000, default: '' },
    status: {
      type: String,
      enum: ['TODO', 'IN_PROGRESS', 'COMPLETED'],
      default: 'TODO',
      required: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      default: 'MEDIUM',
      required: true,
    },
    eventId: { type: Schema.Types.ObjectId, default: null },
    dueAt: { type: Date, default: null },
    dueDateOnly: { type: Boolean, default: false },
    assigneeIds: { type: [Schema.Types.ObjectId], default: [] },
    source: {
      type: new Schema(
        {
          type: {
            type: String,
            enum: ['MANUAL', 'RECURRENCE', 'CHECKLIST'],
            required: true,
          },
          templateId: {
            type: String,
            maxlength: 80,
            required() {
              return this.type === 'CHECKLIST';
            },
          },
          templateVersion: {
            type: String,
            maxlength: 20,
            required() {
              return this.type === 'CHECKLIST';
            },
          },
          itemKey: {
            type: String,
            maxlength: 100,
            required() {
              return this.type === 'CHECKLIST';
            },
          },
        },
        { _id: false },
      ),
      required: true,
    },
    seriesId: { type: Schema.Types.ObjectId, default: null },
    occurrenceDate: { type: String, default: null },
    occurrenceEdited: { type: Boolean, default: false },
    recurrenceExcluded: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    completedBy: { type: Schema.Types.ObjectId, default: null },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    updatedBy: { type: Schema.Types.ObjectId, required: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, default: null },
  },
  { collection: 'tasks', timestamps: true, optimisticConcurrency: true },
);
taskSchema.index({ weddingId: 1, deletedAt: 1, createdAt: -1, _id: -1 });
taskSchema.index(
  { weddingId: 1, 'source.templateId': 1, 'source.itemKey': 1 },
  { unique: true, partialFilterExpression: { 'source.type': 'CHECKLIST' } },
);
taskSchema.index({ weddingId: 1, deletedAt: 1, status: 1, dueAt: 1 });
taskSchema.index({ weddingId: 1, createdBy: 1, deletedAt: -1, _id: -1 });
taskSchema.index({ weddingId: 1, deletedAt: -1, _id: -1 });
taskSchema.index({ weddingId: 1, eventId: 1, deletedAt: 1 });
taskSchema.index({
  weddingId: 1,
  assigneeIds: 1,
  deletedAt: 1,
  status: 1,
  dueAt: 1,
});
taskSchema.index({
  weddingId: 1,
  deletedAt: 1,
  priority: 1,
  status: 1,
  dueAt: 1,
});
taskSchema.index(
  { seriesId: 1, occurrenceDate: 1 },
  {
    unique: true,
    partialFilterExpression: { seriesId: { $type: 'objectId' } },
  },
);
const receiptSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    keyHash: { type: String, required: true },
    requestHash: { type: String, required: true },
    taskId: { type: Schema.Types.ObjectId, required: true },
    seriesId: { type: Schema.Types.ObjectId, default: null },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'taskWriteRequests', timestamps: true },
);
receiptSchema.index({ weddingId: 1, userId: 1, keyHash: 1 }, { unique: true });
receiptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const seriesSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true },
    frequency: {
      type: String,
      enum: ['DAILY', 'WEEKLY', 'MONTHLY'],
      required: true,
    },
    interval: { type: Number, required: true, min: 1, max: 365 },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    time: { type: String, default: null },
    template: {
      type: new Schema(
        {
          title: { type: String, required: true, maxlength: 160 },
          description: { type: String, default: '', maxlength: 2000 },
          priority: {
            type: String,
            enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
            required: true,
          },
          assigneeIds: { type: [Schema.Types.ObjectId], default: [] },
          eventId: { type: Schema.Types.ObjectId, default: null },
        },
        { _id: false },
      ),
      required: true,
    },
    generationVersion: { type: Number, default: 1 },
    nextGenerationDate: { type: String, default: null },
    active: { type: Boolean, default: true },
    generationIssue: { type: String, default: null },
    retryAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    updatedBy: { type: Schema.Types.ObjectId, required: true },
  },
  { collection: 'taskSeries', timestamps: true, optimisticConcurrency: true },
);
seriesSchema.index({ active: 1, nextGenerationDate: 1, retryAt: 1 });
seriesSchema.index({ weddingId: 1, active: 1 });
seriesSchema.index({ weddingId: 1, updatedBy: 1, active: 1, endDate: 1 });
seriesSchema.index({
  weddingId: 1,
  active: 1,
  'template.assigneeIds': 1,
  endDate: 1,
});
export function taskModels(connection) {
  return {
    TaskSeries:
      connection.models.TaskSeries ||
      connection.model('TaskSeries', seriesSchema),
    Task: connection.models.Task || connection.model('Task', taskSchema),
    TaskWriteRequest:
      connection.models.TaskWriteRequest ||
      connection.model('TaskWriteRequest', receiptSchema),
  };
}
