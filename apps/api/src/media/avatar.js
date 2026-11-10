import { authModels } from '../auth/models.js';
import { weddingModels } from '../weddings/models.js';
import { ApiError } from '../lib/api-error.js';
import { mediaModel } from './models.js';
import { detachCover } from './references.js';
import {
  PROFILE_AVATAR,
  assetInScope,
  defaultCoverFrame,
  mediaIdSchema,
  saveAvatarSchema,
} from './validation.js';

const activeAccount = { status: 'ACTIVE', emailVerifiedAt: { $ne: null } };
const missing = () =>
  new ApiError(404, 'MEDIA_NOT_FOUND', 'This photo is not available.');

export function avatarSummary(user) {
  return user.avatarMediaId
    ? {
        mediaId: String(user.avatarMediaId),
        frame: user.avatarFrame ?? defaultCoverFrame,
      }
    : null;
}

export function avatarOperations({
  database,
  settings,
  storage,
  now,
  configured,
}) {
  async function set(userId, raw) {
    const parsed = saveAvatarSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiError(
        400,
        'INVALID_AVATAR',
        'Check your profile photo and try again.',
      );
    const { accountId, mediaId, frame, version } = parsed.data;
    const changed = () =>
      new ApiError(
        409,
        'AVATAR_CHANGED',
        'Your profile photo changed elsewhere. Reload before editing it.',
      );
    if (accountId !== userId) throw changed();
    if (mediaId) configured(true);

    const connection = await database.connect();
    const { User } = authModels(connection);
    const Media = mediaModel(connection);
    return connection.transaction(
      async (session) => {
        const user = await User.findOne({ _id: userId, ...activeAccount })
          .select('avatarMediaId avatarFrame avatarVersion')
          .session(session)
          .lean();
        if (!user)
          throw new ApiError(
            401,
            'SESSION_EXPIRED',
            'Please sign in to continue.',
          );
        const previous = avatarSummary(user);
        const currentVersion = user.avatarVersion ?? 0;
        const same =
          mediaId === (previous?.mediaId ?? null) &&
          (!mediaId ||
            ['x', 'y', 'zoom'].every(
              (key) => previous.frame[key] === frame[key],
            ));
        if (same)
          return {
            id: userId,
            avatar: previous,
            avatarVersion: currentVersion,
          };
        if (currentVersion !== version) throw changed();
        if (mediaId) {
          const filter = {
            _id: mediaId,
            ownerUserId: userId,
            weddingId: null,
            purpose: PROFILE_AVATAR,
            status: 'READY',
            attached: false,
            purgeAfter: { $gt: now() },
          };
          const asset = await Media.findOne(filter).session(session).lean();
          if (!asset || !assetInScope(asset, settings)) throw missing();
          const attached = await Media.updateOne(
            filter,
            {
              $set: { attached: true },
              $unset: { purgeAfter: 1 },
            },
            { session },
          );
          if (attached.modifiedCount !== 1) throw missing();
        }
        await User.updateOne(
          { _id: userId, ...activeAccount },
          {
            $inc: { avatarVersion: 1 },
            ...(mediaId
              ? { $set: { avatarMediaId: mediaId, avatarFrame: frame } }
              : { $unset: { avatarMediaId: 1, avatarFrame: 1 } }),
          },
          { session },
        );
        await detachCover(connection, session, user.avatarMediaId, now(), {
          purpose: PROFILE_AVATAR,
          ownerUserId: userId,
        });
        return {
          id: userId,
          avatar: mediaId ? { mediaId, frame } : null,
          avatarVersion: currentVersion + 1,
        };
      },
      { maxCommitTimeMS: 5000 },
    );
  }

  async function read(userId, mediaId) {
    if (!mediaIdSchema.safeParse(mediaId).success) throw missing();
    const connection = await database.connect();
    const { User } = authModels(connection);
    const { Wedding, WeddingMember } = weddingModels(connection);
    const asset = await mediaModel(connection)
      .findOne({
        _id: mediaId,
        weddingId: null,
        purpose: PROFILE_AVATAR,
        status: 'READY',
        attached: true,
      })
      .lean();
    if (!asset || !assetInScope(asset, settings)) throw missing();
    const ownerId = String(asset.ownerUserId);
    if (
      !(await User.exists({
        _id: ownerId,
        avatarMediaId: mediaId,
        ...activeAccount,
      }))
    )
      throw missing();
    if (ownerId !== userId) {
      const viewer = await WeddingMember.findOne({ userId, status: 'ACTIVE' })
        .select('weddingId')
        .lean();
      if (
        !viewer ||
        !(await WeddingMember.exists({
          userId: ownerId,
          weddingId: viewer.weddingId,
          status: 'ACTIVE',
        })) ||
        !(await Wedding.exists({ _id: viewer.weddingId, deletedAt: null }))
      )
        throw missing();
    }
    configured(true);
    return { mediaId, url: await storage.readUrl(asset) };
  }

  return { set, read };
}
