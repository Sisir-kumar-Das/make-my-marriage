import argon2 from 'argon2';
import mongoose from 'mongoose';
import { SignJWT, jwtVerify } from 'jose';
import { timingSafeEqual } from 'node:crypto';
import { ApiError } from '../lib/api-error.js';
import { authModels } from './models.js';
import { hashToken, generateToken } from './tokens.js';

export function requireSessionConfiguration(settings) {
  if (!settings.jwtSecret || settings.jwtSecret.length < 43) {
    throw new ApiError(
      503,
      'AUTH_UNAVAILABLE',
      'Sign-in is temporarily unavailable. Please try again later.',
    );
  }
}

const expired = () =>
  new ApiError(401, 'SESSION_EXPIRED', 'Please sign in to continue.');
const invalidCredentials = () =>
  new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};
const sameHash = (left, right) =>
  typeof left === 'string' &&
  typeof right === 'string' &&
  left.length === right.length &&
  timingSafeEqual(Buffer.from(left), Buffer.from(right));
const refreshId = (token) =>
  typeof token === 'string' && /^[a-f\d]{24}\.[A-Za-z0-9_-]{43}$/.test(token)
    ? token.split('.')[0]
    : null;

export function createSessionService({
  database,
  settings,
  now,
  getWeddingContext = async () => ({ wedding: null, membership: null }),
}) {
  let dummyHash;
  const signingKey = () => {
    requireSessionConfiguration(settings);
    return new TextEncoder().encode(settings.jwtSecret);
  };
  const active = () => ({ revokedAt: null, expiresAt: { $gt: now() } });
  const data = async (user, session) => ({
    user: {
      id: String(user._id),
      email: user.email,
      displayName: user.profile.displayName,
      emailVerified: true,
    },
    session: { expiresAt: session.expiresAt.toISOString() },
    ...(await getWeddingContext(String(user._id))),
  });
  async function issue(user, session, refreshToken) {
    const instant = now();
    const accessExpiresAt = new Date(
      Math.min(
        session.expiresAt.getTime(),
        instant.getTime() + settings.accessTtlMinutes * 60000,
      ),
    );
    const accessToken = await new SignJWT({ sid: String(session._id) })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(String(user._id))
      .setIssuer('make-my-marriage-api')
      .setAudience('make-my-marriage-web')
      .setIssuedAt(Math.floor(instant.getTime() / 1000))
      .setExpirationTime(Math.floor(accessExpiresAt.getTime() / 1000))
      .sign(signingKey());
    return {
      data: await data(user, session),
      accessToken,
      refreshToken,
      accessExpiresAt,
      expiresAt: session.expiresAt,
    };
  }
  async function eligibleUser(User, userId) {
    return User.findOne({
      _id: userId,
      status: 'ACTIVE',
      emailVerifiedAt: { $ne: null },
    }).lean();
  }
  async function login({ email, password, userAgent = '' }) {
    requireSessionConfiguration(settings);
    const connection = await database.connect();
    const { User, Session } = authModels(connection);
    const user = await User.findOne({ emailNormalized: email })
      .select('+passwordHash')
      .lean();
    dummyHash ??= argon2.hash(generateToken(), passwordOptions);
    const matches = await argon2.verify(
      user?.passwordHash || (await dummyHash),
      password,
    );
    if (!user) {
      throw new ApiError(
        404,
        'ACCOUNT_NOT_FOUND',
        'You don’t have an account yet. Please create one to continue.',
      );
    }
    if (!matches || user.status !== 'ACTIVE') throw invalidCredentials();
    if (!user.emailVerifiedAt) {
      throw new ApiError(
        403,
        'EMAIL_NOT_VERIFIED',
        'Verify your email address before signing in.',
      );
    }
    const instant = now();
    const id = new mongoose.Types.ObjectId();
    const token = `${id}.${generateToken()}`;
    let created;
    await connection.transaction(
      async (transaction) => {
        const result = await User.updateOne(
          {
            _id: user._id,
            passwordHash: user.passwordHash,
            status: 'ACTIVE',
            emailVerifiedAt: { $ne: null },
          },
          { $set: { lastLoginAt: instant } },
          { session: transaction },
        );
        if (result.matchedCount !== 1) throw invalidCredentials();
        [created] = await Session.create(
          [
            {
              _id: id,
              userId: user._id,
              refreshTokenHash: hashToken(token),
              tokenFamilyId: generateToken(),
              expiresAt: new Date(
                instant.getTime() + settings.sessionTtlDays * 86400000,
              ),
              device: { userAgent: userAgent.slice(0, 300) },
              lastUsedAt: instant,
              createdAt: instant,
            },
          ],
          { session: transaction },
        );
      },
      { maxCommitTimeMS: 5000 },
    );
    return issue(user, created, token);
  }
  async function authenticate(accessToken) {
    if (!accessToken || accessToken.length > 2048) throw expired();
    const key = signingKey();
    let payload;
    try {
      ({ payload } = await jwtVerify(accessToken, key, {
        algorithms: ['HS256'],
        issuer: 'make-my-marriage-api',
        audience: 'make-my-marriage-web',
        currentDate: now(),
      }));
    } catch {
      throw expired();
    }
    if (
      !/^[a-f\d]{24}$/.test(payload.sub || '') ||
      !/^[a-f\d]{24}$/.test(payload.sid || '')
    )
      throw expired();
    const connection = await database.connect();
    const { User, Session } = authModels(connection);
    const session = await Session.findOne({
      _id: payload.sid,
      userId: payload.sub,
      ...active(),
    }).lean();
    if (!session) throw expired();
    const user = await eligibleUser(User, session.userId);
    if (!user) throw expired();
    return { user, session };
  }
  async function session({ accessToken }) {
    const result = await authenticate(accessToken);
    return data(result.user, result.session);
  }
  async function refresh({ refreshToken }) {
    requireSessionConfiguration(settings);
    const id = refreshId(refreshToken);
    if (!id) throw expired();
    const connection = await database.connect();
    const { User, Session } = authModels(connection);
    const digest = hashToken(refreshToken);
    const nextToken = `${id}.${generateToken()}`;
    const instant = now();
    const candidate = await Session.findOne({
      _id: id,
      refreshTokenHash: digest,
      ...active(),
    }).lean();
    let issued;
    if (candidate) {
      // Finish fallible reads/signing before consuming the browser's current token.
      const user = await eligibleUser(User, candidate.userId);
      if (!user) {
        await Session.updateOne(
          { _id: id, revokedAt: null },
          { $set: { revokedAt: instant, revokeReason: 'SECURITY' } },
        );
        throw expired();
      }
      issued = await issue(user, candidate, nextToken);
    }
    // The final compare-and-swap still checks expiry/revocation, so a concurrent
    // rotation or logout cannot make the prepared credentials usable.
    const rotated =
      candidate &&
      (await Session.findOneAndUpdate(
        {
          _id: id,
          refreshTokenHash: digest,
          'usedRefreshTokens.8191': { $exists: false },
          ...active(),
        },
        {
          $set: { refreshTokenHash: hashToken(nextToken), lastUsedAt: instant },
          $push: { usedRefreshTokens: { hash: digest, usedAt: instant } },
        },
        { returnDocument: 'after' },
      ).lean());
    if (!rotated) {
      const previous = await Session.findOne({ _id: id, ...active() })
        .select('+usedRefreshTokens +refreshTokenHash')
        .lean();
      if (previous && sameHash(previous.refreshTokenHash, digest)) {
        // Bound retained replay hashes even if a client refreshes far more often than needed.
        await Session.updateOne(
          { _id: id },
          { $set: { revokedAt: instant, revokeReason: 'SECURITY' } },
        );
        throw expired();
      }
      const used = previous?.usedRefreshTokens.find((item) =>
        sameHash(item.hash, digest),
      );
      if (used) {
        // Concurrent tabs can present the same token while the winner's cookies are in flight.
        // Never reissue a consumed token; clients retry the session check after this conflict.
        if (instant.getTime() - used.usedAt.getTime() <= 5000) {
          throw new ApiError(
            409,
            'REFRESH_IN_PROGRESS',
            'Your session is being renewed. Please retry.',
          );
        }
        await Session.updateMany(
          { tokenFamilyId: previous.tokenFamilyId, revokedAt: null },
          {
            $set: { revokedAt: instant, revokeReason: 'ROTATION_REUSE' },
          },
        );
      }
      // An arbitrary wrong secret cannot revoke a session just by naming its id.
      throw expired();
    }
    return issued;
  }
  async function logout({ accessToken, refreshToken }) {
    let current;
    try {
      current = (await authenticate(accessToken)).session;
    } catch (error) {
      if (error.status !== 401) throw error;
    }
    const id = refreshId(refreshToken);
    if (!current && id) {
      const { Session } = authModels(await database.connect());
      // A valid consumed hash proves this device's token family even when a
      // refresh committed before logout received the winner's cookies.
      await Session.updateOne(
        {
          _id: id,
          $or: [
            { refreshTokenHash: hashToken(refreshToken) },
            { 'usedRefreshTokens.hash': hashToken(refreshToken) },
          ],
          ...active(),
        },
        { $set: { revokedAt: now(), revokeReason: 'LOGOUT' } },
      );
    }
    if (current) {
      const { Session } = authModels(await database.connect());
      await Session.updateOne(
        { _id: current._id, revokedAt: null },
        { $set: { revokedAt: now(), revokeReason: 'LOGOUT' } },
      );
    }
  }
  return { login, session, refresh, logout };
}
