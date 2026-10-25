import mongoose from 'mongoose';

const { Schema } = mongoose;
const ceremonyActivitySchema = new Schema({
  name: { type: String, required: true, maxlength: 160 },
  startAt: { type: Date, required: true },
  endAt: { type: Date, default: null },
  description: { type: String, maxlength: 1000, default: '' },
});
const eventSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, maxlength: 160 },
    type: {
      type: String,
      required: true,
      enum: [
        'ENGAGEMENT',
        'HALDI',
        'MEHENDI',
        'SANGEET',
        'BARAJATRI',
        'WEDDING',
        'RECEPTION',
        'CUSTOM',
      ],
    },
    description: { type: String, maxlength: 2000, default: '' },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    activities: {
      type: [ceremonyActivitySchema],
      default: [],
      validate: (rows) => rows.length <= 50,
    },
    venue: {
      type: new Schema(
        {
          source: { type: String, enum: ['MANUAL', 'GOOGLE'] },
          name: String,
          formattedAddress: String,
          city: String,
          state: String,
        },
        { _id: false },
      ),
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: ['PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
      default: 'PLANNED',
    },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    updatedBy: { type: Schema.Types.ObjectId, required: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, default: null },
  },
  { collection: 'events', timestamps: true, optimisticConcurrency: true },
);
eventSchema.index({ weddingId: 1, deletedAt: 1, startAt: 1, _id: 1 });
eventSchema.index({
  weddingId: 1,
  deletedAt: 1,
  status: 1,
  startAt: 1,
  _id: 1,
});
eventSchema.index({ weddingId: 1, deletedAt: -1, _id: -1 });
const requestSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    keyHash: { type: String, required: true },
    requestHash: { type: String, required: true },
    eventId: { type: Schema.Types.ObjectId, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'eventWriteRequests', timestamps: true },
);
requestSchema.index({ weddingId: 1, userId: 1, keyHash: 1 }, { unique: true });
requestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const activitySchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    actorId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    action: { type: String, required: true, immutable: true },
    entityType: { type: String, required: true, immutable: true },
    entityId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    parentEventId: { type: Schema.Types.ObjectId, immutable: true },
    displaySnapshot: {
      label: { type: String, maxlength: 160, immutable: true },
    },
    createdAt: { type: Date, required: true, immutable: true },
  },
  { collection: 'activities', versionKey: false },
);
activitySchema.index({ weddingId: 1, createdAt: -1 });
export function eventModels(connection) {
  return {
    Event: connection.models.Event || connection.model('Event', eventSchema),
    EventWriteRequest:
      connection.models.EventWriteRequest ||
      connection.model('EventWriteRequest', requestSchema),
    Activity:
      connection.models.Activity ||
      connection.model('Activity', activitySchema),
  };
}
