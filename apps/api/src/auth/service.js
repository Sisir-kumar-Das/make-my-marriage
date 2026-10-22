import argon2 from 'argon2';
import { ApiError } from '../lib/api-error.js';
import { authModels } from './models.js';
import { createAuthDatabase } from './database.js';
import {
  createVerificationSender,
  createResetSender,
  createPasswordChangedSender,
} from './email.js';
import { createPasswordRecovery } from './password-recovery.js';
import { createSessionService } from './session-service.js';
import { hashToken, generateToken } from './tokens.js';

export { hashToken, generateToken } from './tokens.js';

export function createAuthService({
  database,
  sendVerification,
  sendReset,
  sendPasswordChanged,
  settings,
  now = () => new Date(),
  getWeddingContext,
}) {
  const recovery = createPasswordRecovery({
    database,
    settings,
    now,
    sendReset,
    sendPasswordChanged,
  });
  const cooldownMs = settings.verificationCooldownSeconds * 1000;
  const sessions = createSessionService({
    database,
    settings,
    now,
    getWeddingContext,
  });
  const invalidLink = () =>
    new ApiError(
      400,
      'INVALID_VERIFICATION_LINK',
      'This link is invalid, expired or already used. Request another verification email.',
    );

  function requireEmailConfiguration() {
    if (!settings.resendApiKey || !settings.emailFrom) {
      throw new ApiError(
        503,
        'AUTH_UNAVAILABLE',
        'Registration is temporarily unavailable. Please try again later.',
      );
    }
  }

  function tokenData(userId) {
    const token = generateToken();
    const createdAt = now();
    return {
      token,
      document: {
        userId,
        type: 'EMAIL_VERIFY',
        tokenHash: hashToken(token),
        createdAt,
        usedAt: null,
        expiresAt: new Date(
          createdAt.getTime() + settings.verificationTtlHours * 3600000,
        ),
      },
    };
  }

  async function deliver(connection, email, issued) {
    try {
      await sendVerification({
        email,
        token: issued.token,
        tokenHash: issued.document.tokenHash,
      });
    } catch {
      // Releasing this claim permits an immediate retry after delivery failure.
      // Never remove a newer token if a concurrent request already replaced it.
      const { AuthToken } = authModels(connection);
      await AuthToken.deleteOne({ tokenHash: issued.document.tokenHash }).catch(
        () => {},
      );
      // Public acknowledgements must not reveal whether an account was eligible.
      console.error('Verification email delivery failed.');
    }
  }

  async function register({ name, email, password }) {
    requireEmailConfiguration();
    const connection = await database.connect();
    const { User, AuthToken } = authModels(connection);
    // Duplicates never replace another account's name or password.
    if (await User.exists({ emailNormalized: email })) return;
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    let issued;
    try {
      await connection.transaction(
        async (session) => {
          const [user] = await User.create(
            [
              {
                email,
                emailNormalized: email,
                passwordHash,
                profile: { displayName: name },
                status: 'ACTIVE',
              },
            ],
            { session },
          );
          issued = tokenData(user._id);
          await AuthToken.create([issued.document], { session });
        },
        { maxCommitTimeMS: 5000 },
      );
    } catch (error) {
      if (error.code === 11000) return;
      throw error;
    }
    await deliver(connection, email, issued);
  }

  async function resend({ email }) {
    requireEmailConfiguration();
    const connection = await database.connect();
    const { User, AuthToken } = authModels(connection);
    const user = await User.findOne({
      emailNormalized: email,
      emailVerifiedAt: null,
      status: 'ACTIVE',
    }).lean();
    // The HTTP response is identical for missing, verified and disabled accounts.
    if (!user) return;
    const issued = tokenData(user._id);
    let claimed = await AuthToken.findOneAndUpdate(
      {
        userId: user._id,
        type: 'EMAIL_VERIFY',
        createdAt: { $lte: new Date(now().getTime() - cooldownMs) },
      },
      { $set: issued.document },
      { returnDocument: 'after' },
    );
    if (!claimed) {
      try {
        claimed = await AuthToken.create(issued.document);
      } catch (error) {
        // The unique user/purpose index also arbitrates simultaneous first sends.
        if (error.code === 11000) return;
        throw error;
      }
    }
    if (claimed) await deliver(connection, user.email, issued);
  }

  async function verify({ token }) {
    const connection = await database.connect();
    const { User, AuthToken } = authModels(connection);
    await connection.transaction(
      async (session) => {
        const instant = now();
        const consumed = await AuthToken.findOneAndUpdate(
          {
            tokenHash: hashToken(token),
            type: 'EMAIL_VERIFY',
            usedAt: null,
            expiresAt: { $gt: instant },
          },
          { $set: { usedAt: instant } },
          { session, returnDocument: 'after' },
        );
        if (!consumed) throw invalidLink();
        const result = await User.updateOne(
          {
            _id: consumed.userId,
            emailVerifiedAt: null,
            status: 'ACTIVE',
          },
          { $set: { emailVerifiedAt: instant } },
          { session },
        );
        if (result.modifiedCount !== 1) throw invalidLink();
      },
      { maxCommitTimeMS: 5000 },
    );
  }

  const safe = (operation) => async (input) => {
    try {
      return await operation(input);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.error('Authentication operation failed.');
      throw new ApiError(
        503,
        'AUTH_UNAVAILABLE',
        'We could not complete that request. Please try again later.',
      );
    }
  };

  return {
    register: safe(register),
    resend: safe(resend),
    verify: safe(verify),
    login: safe(sessions.login),
    refresh: safe(sessions.refresh),
    session: safe(sessions.session),
    logout: safe(sessions.logout),
    forgotPassword: safe(recovery.forgot),
    resetPassword: safe(recovery.reset),
    drainRecovery: recovery.drain,
    close: async () => {
      await recovery.drain();
      await database.close();
    },
  };
}

export function createProductionAuthService(
  settings,
  { database = createAuthDatabase(settings), getWeddingContext } = {},
) {
  return createAuthService({
    settings,
    database,
    getWeddingContext,
    sendVerification: createVerificationSender(settings),
    sendReset: createResetSender(settings),
    sendPasswordChanged: createPasswordChangedSender(settings),
  });
}
