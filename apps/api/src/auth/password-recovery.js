import argon2 from 'argon2';
import { ApiError } from '../lib/api-error.js';
import { authModels } from './models.js';
import { generateToken, hashToken } from './tokens.js';

const invalidLink = () =>
  new ApiError(
    400,
    'INVALID_RESET_LINK',
    'This link is invalid, expired or already used. Request a new reset link.',
  );

export function createPasswordRecovery({
  database,
  settings,
  now,
  sendReset,
  sendPasswordChanged,
}) {
  // Local Express dispatch: public acknowledgements never wait for account lookup
  // or email delivery. Shutdown drains the bounded work set before closing MongoDB.
  const pending = new Set();
  function dispatch(work) {
    const job = Promise.resolve()
      .then(work)
      .catch(() => {
        console.error('Password recovery background operation failed.');
      })
      .finally(() => pending.delete(job));
    pending.add(job);
  }
  async function deliverReset(email) {
    const connection = await database.connect();
    const { User, AuthToken } = authModels(connection);
    const user = await User.findOne({
      emailNormalized: email,
      status: 'ACTIVE',
    }).lean();
    if (!user) return;
    const token = generateToken();
    const createdAt = now();
    const document = {
      userId: user._id,
      type: 'PASSWORD_RESET',
      tokenHash: hashToken(token),
      usedAt: null,
      createdAt,
      expiresAt: new Date(
        createdAt.getTime() + settings.resetTtlMinutes * 60000,
      ),
    };
    let claimed = await AuthToken.findOneAndUpdate(
      {
        userId: user._id,
        type: 'PASSWORD_RESET',
        createdAt: {
          $lte: new Date(
            createdAt.getTime() - settings.resetCooldownSeconds * 1000,
          ),
        },
      },
      { $set: document },
      { returnDocument: 'after' },
    );
    if (!claimed) {
      try {
        claimed = await AuthToken.create(document);
      } catch (error) {
        if (error.code === 11000) return;
        throw error;
      }
    }
    if (!claimed) return;
    try {
      await sendReset({
        email: user.email,
        token,
        tokenHash: document.tokenHash,
      });
    } catch {
      await AuthToken.deleteOne({
        type: 'PASSWORD_RESET',
        tokenHash: document.tokenHash,
      }).catch(() => {});
      console.error('Password reset email delivery failed.');
    }
  }
  async function forgot({ email }) {
    if (
      !settings.mongodbUri ||
      !settings.resendApiKey ||
      !settings.emailFrom ||
      typeof sendReset !== 'function'
    ) {
      throw new ApiError(
        503,
        'AUTH_UNAVAILABLE',
        'Password recovery is temporarily unavailable. Please try again later.',
      );
    }
    if (pending.size >= 32)
      throw new ApiError(
        503,
        'AUTH_UNAVAILABLE',
        'Password recovery is busy. Please try again later.',
      );
    dispatch(() => deliverReset(email));
  }
  async function reset({ token, password }) {
    const connection = await database.connect();
    const { User, AuthToken, Session } = authModels(connection);
    // A preliminary check avoids Argon2 work for obviously unusable links. Only
    // the transaction below consumes a token or changes account/session state.
    const candidate = await AuthToken.findOne({
      tokenHash: hashToken(token),
      type: 'PASSWORD_RESET',
      usedAt: null,
      expiresAt: { $gt: now() },
    }).lean();
    if (!candidate) throw invalidLink();
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    let email;
    await connection.transaction(
      async (transaction) => {
        const instant = now();
        const consumed = await AuthToken.findOneAndUpdate(
          {
            tokenHash: hashToken(token),
            type: 'PASSWORD_RESET',
            usedAt: null,
            expiresAt: { $gt: instant },
          },
          { $set: { usedAt: instant } },
          { session: transaction, returnDocument: 'after' },
        );
        if (!consumed) throw invalidLink();
        // This user write also serializes with login's conditional user write:
        // old credentials cannot create a session after the reset commits.
        const user = await User.findOneAndUpdate(
          { _id: consumed.userId, status: 'ACTIVE' },
          { $set: { passwordHash } },
          { session: transaction, returnDocument: 'after' },
        ).lean();
        if (!user) throw invalidLink();
        await Session.updateMany(
          { userId: user._id, revokedAt: null },
          { $set: { revokedAt: instant, revokeReason: 'PASSWORD_CHANGE' } },
          { session: transaction },
        );
        email = user.email;
      },
      { maxCommitTimeMS: 5000 },
    );
    // Notification failure cannot turn a committed password change into an error.
    if (sendPasswordChanged)
      dispatch(() =>
        sendPasswordChanged({ email, tokenHash: hashToken(token) }),
      );
  }
  async function drain() {
    while (pending.size) await Promise.allSettled([...pending]);
  }
  return { forgot, reset, drain };
}
