import mongoose from 'mongoose';

const { Schema } = mongoose;
const weddingSchema = new Schema(
  {
    eventRevision: { type: Number, default: 0 },
    taskRevision: { type: Number, default: 0 },
    memberRevision: { type: Number, default: 0 },
    name: { type: String, required: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true },
    brideName: { type: String, required: true, maxlength: 100 },
    groomName: { type: String, required: true, maxlength: 100 },
    mainDate: { type: String, required: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    tradition: { type: String, required: true },
    location: {
      city: String,
      state: String,
      countryCode: { type: String, default: 'IN' },
    },
    estimatedBudget: {
      type: new Schema(
        {
          amountMinor: { type: Schema.Types.BigInt, required: true },
          currency: { type: String, default: 'INR' },
        },
        { _id: false },
      ),
      default: undefined,
    },
    mode: {
      type: String,
      enum: ['PLANNING', 'GALLERY_MODE'],
      default: 'PLANNING',
    },
    createdBy: { type: Schema.Types.ObjectId, required: true, index: true },
    coverMediaId: { type: Schema.Types.ObjectId, default: null },
    coverFrame: {
      type: new Schema({ x: Number, y: Number, zoom: Number }, { _id: false }),
      default: undefined,
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true, collection: 'weddings' },
);

const memberSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    role: {
      type: String,
      enum: ['ADMIN', 'FAMILY_MEMBER', 'VIEWER'],
      required: true,
    },
    financeAccess: { type: Boolean, default: false },
    // Legacy rows stay readable. Future invitation acceptance requires this for non-creators.
    relationship: { type: String, trim: true, maxlength: 80, default: null },
    status: { type: String, enum: ['ACTIVE', 'REMOVED'], default: 'ACTIVE' },
    joinedAt: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    collection: 'weddingMembers',
  },
);
memberSchema.index({ weddingId: 1, userId: 1 }, { unique: true });
memberSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } },
);
memberSchema.index({ weddingId: 1, role: 1, status: 1 });

const requestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    keyHash: { type: String, required: true },
    requestHash: { type: String, required: true },
    weddingId: { type: Schema.Types.ObjectId, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'weddingCreationRequests' },
);
requestSchema.index({ userId: 1, keyHash: 1 }, { unique: true });
requestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export function weddingModels(connection) {
  return {
    Wedding:
      connection.models.Wedding || connection.model('Wedding', weddingSchema),
    WeddingMember:
      connection.models.WeddingMember ||
      connection.model('WeddingMember', memberSchema),
    WeddingCreationRequest:
      connection.models.WeddingCreationRequest ||
      connection.model('WeddingCreationRequest', requestSchema),
  };
}
