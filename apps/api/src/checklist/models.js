import mongoose from 'mongoose';
const { Schema } = mongoose;
const generationSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    templateId: { type: String, required: true, immutable: true },
    templateVersion: { type: String, required: true, immutable: true },
    templateName: { type: String, required: true, immutable: true },
    weddingDate: { type: String, required: true, immutable: true },
    added: { type: Number, required: true, min: 0, immutable: true },
    kept: { type: Number, required: true, min: 0, immutable: true },
    deleted: { type: Number, required: true, min: 0, immutable: true },
    addedTaskIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      immutable: true,
    },
    createdBy: { type: Schema.Types.ObjectId, required: true, immutable: true },
    createdAt: { type: Date, required: true, immutable: true },
  },
  { collection: 'checklistGenerations', versionKey: false },
);
generationSchema.index({ weddingId: 1, createdAt: -1, _id: -1 });
const requestSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    keyHash: { type: String, required: true },
    requestHash: { type: String, required: true },
    generationId: { type: Schema.Types.ObjectId, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'checklistWriteRequests', timestamps: true },
);
requestSchema.index({ weddingId: 1, userId: 1, keyHash: 1 }, { unique: true });
requestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export function checklistModels(connection) {
  return {
    ChecklistGeneration:
      connection.models.ChecklistGeneration ||
      connection.model('ChecklistGeneration', generationSchema),
    ChecklistWriteRequest:
      connection.models.ChecklistWriteRequest ||
      connection.model('ChecklistWriteRequest', requestSchema),
  };
}
