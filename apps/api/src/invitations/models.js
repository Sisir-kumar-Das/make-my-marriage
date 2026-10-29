import mongoose from 'mongoose';
const { Schema } = mongoose;
const invitationSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true },
    email: { type: String, required: true, maxlength: 254 },
    emailNormalized: { type: String, required: true },
    role: {
      type: String,
      enum: ['ADMIN', 'FAMILY_MEMBER', 'VIEWER'],
      required: true,
    },
    relationship: { type: String, required: true, maxlength: 80 },
    tokenHash: { type: String, required: true, select: false },
    nonce: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'],
      default: 'PENDING',
    },
    expiresAt: { type: Date, required: true },
    invitedBy: { type: Schema.Types.ObjectId, required: true },
    acceptedAt: { type: Date, default: null },
    acceptedBy: { type: Schema.Types.ObjectId, default: null },
    lastSentAt: { type: Date, required: true },
    sendCount: { type: Number, default: 1 },
    delivery: {
      type: String,
      enum: ['PENDING', 'SUBMITTED', 'FAILED'],
      default: 'PENDING',
    },
  },
  {
    collection: 'memberInvitations',
    timestamps: true,
    optimisticConcurrency: true,
  },
);
invitationSchema.index({ tokenHash: 1 }, { unique: true });
invitationSchema.index(
  { weddingId: 1, emailNormalized: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } },
);
invitationSchema.index({ weddingId: 1, createdAt: -1, _id: -1 });
const receiptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    keyHash: { type: String, required: true },
    requestHash: { type: String, required: true },
    weddingId: { type: Schema.Types.ObjectId, required: true },
    invitationId: { type: Schema.Types.ObjectId, required: true },
    operation: { type: String, required: true },
    result: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'invitationWriteRequests' },
);
receiptSchema.index({ userId: 1, keyHash: 1 }, { unique: true });
receiptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export function invitationModels(connection) {
  return {
    MemberInvitation:
      connection.models.MemberInvitation ||
      connection.model('MemberInvitation', invitationSchema),
    InvitationWriteRequest:
      connection.models.InvitationWriteRequest ||
      connection.model('InvitationWriteRequest', receiptSchema),
  };
}
