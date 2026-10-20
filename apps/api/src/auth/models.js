import mongoose from 'mongoose';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    email: { type: String, required: true, maxlength: 254 },
    emailNormalized: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    emailVerifiedAt: { type: Date, default: null },
    profile: {
      displayName: { type: String, required: true, maxlength: 100 },
    },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' },
  },
  { timestamps: true, collection: 'users' },
);

const authTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    type: {
      type: String,
      enum: ['EMAIL_VERIFY', 'PASSWORD_RESET'],
      required: true,
    },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'authTokens' },
);

authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// One replaceable token per user/purpose makes concurrent resends safe.
authTokenSchema.index({ userId: 1, type: 1 }, { unique: true });

export function authModels(connection) {
  return {
    User: connection.models.User || connection.model('User', userSchema),
    AuthToken:
      connection.models.AuthToken ||
      connection.model('AuthToken', authTokenSchema),
  };
}
