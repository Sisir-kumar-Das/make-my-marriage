import mongoose from 'mongoose';

const { Schema } = mongoose;
const mediaSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, default: null },
    ownerUserId: { type: Schema.Types.ObjectId, required: true },
    purpose: {
      type: String,
      enum: ['WEDDING_COVER'],
      default: 'WEDDING_COVER',
    },
    provider: { type: String, default: 'R2' },
    bucket: { type: String, required: true },
    objectKey: { type: String, required: true, unique: true },
    uploadKey: { type: String, required: true },
    displayKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    checksum: String,
    width: Number,
    height: Number,
    status: {
      type: String,
      enum: ['PENDING_UPLOAD', 'READY', 'DELETE_PENDING', 'DELETED'],
      default: 'PENDING_UPLOAD',
    },
    attached: { type: Boolean, default: false },
    uploadedAt: Date,
    purgeAfter: Date,
    deletedAt: Date,
    processingToken: String,
    processingUntil: Date,
    stagingPurgeAfter: Date,
  },
  { timestamps: true, collection: 'mediaAssets' },
);
mediaSchema.index({ status: 1, purgeAfter: 1 });
mediaSchema.index({ ownerUserId: 1, status: 1, attached: 1 });
mediaSchema.index({ weddingId: 1, purpose: 1, status: 1, createdAt: -1 });

export function mediaModel(connection) {
  return (
    connection.models.MediaAsset || connection.model('MediaAsset', mediaSchema)
  );
}
