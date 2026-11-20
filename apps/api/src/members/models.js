import mongoose from 'mongoose';
const { Schema } = mongoose;
const receipt = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    memberId: { type: Schema.Types.ObjectId, required: true },
    keyHash: { type: String, required: true },
    requestHash: { type: String, required: true },
    result: {
      type: new Schema(
        {
          role: {
            type: String,
            enum: ['ADMIN', 'FAMILY_MEMBER', 'VIEWER'],
            required: true,
          },
          relationship: { type: String, maxlength: 80, default: null },
          transferredRepeats: { type: Number, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'memberWriteRequests' },
);
receipt.index({ weddingId: 1, userId: 1, keyHash: 1 }, { unique: true });
receipt.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const removalReceipt = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    memberId: { type: Schema.Types.ObjectId, required: true },
    keyHash: { type: String, required: true },
    requestHash: { type: String, required: true },
    result: {
      type: new Schema(
        {
          status: { type: String, enum: ['REMOVED'], required: true },
          changedTasks: { type: Number, required: true },
          assignmentRules: { type: Number, required: true },
          managedRules: { type: Number, required: true },
          policy: {
            type: String,
            enum: ['REASSIGN', 'UNASSIGN'],
            default: null,
          },
          removedAt: { type: String, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'memberRemovalRequests' },
);
removalReceipt.index({ weddingId: 1, userId: 1, keyHash: 1 }, { unique: true });
removalReceipt.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export function memberModels(connection) {
  return {
    MemberRemovalRequest:
      connection.models.MemberRemovalRequest ||
      connection.model('MemberRemovalRequest', removalReceipt),
    MemberWriteRequest:
      connection.models.MemberWriteRequest ||
      connection.model('MemberWriteRequest', receipt),
  };
}
