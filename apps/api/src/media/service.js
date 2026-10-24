import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { authModels } from '../auth/models.js';
import { weddingModels } from '../weddings/models.js';
import { ApiError } from '../lib/api-error.js';
import { mediaModel } from './models.js';
import { createCoverStorage } from './storage.js';
import {
  uploadSchema,
  mediaIdSchema,
  storageConfigured,
  storageScope,
  assetInScope,
} from './validation.js';

const absent = () =>
  new ApiError(404, 'MEDIA_NOT_FOUND', 'This photo is not available.');
const busy = () =>
  new ApiError(
    409,
    'MEDIA_PROCESSING',
    'Your photo is still being checked. Please retry shortly.',
  );

export function createMediaService({
  database,
  settings,
  storage = createCoverStorage(settings),
  now = () => new Date(),
}) {
  async function authorize(connection, userId, weddingId) {
    const { User } = authModels(connection);
    if (
      !(await User.exists({
        _id: userId,
        status: 'ACTIVE',
        emailVerifiedAt: { $ne: null },
      }))
    )
      throw new ApiError(401, 'SESSION_EXPIRED', 'Please sign in to continue.');
    const { Wedding, WeddingMember } = weddingModels(connection);
    if (weddingId) {
      if (!mediaIdSchema.safeParse(weddingId).success) throw absent();
      const member = await WeddingMember.findOne({
        userId,
        weddingId,
        status: 'ACTIVE',
      }).lean();
      if (
        !member ||
        !(await Wedding.exists({ _id: weddingId, deletedAt: null }))
      )
        throw absent();
      if (member.role !== 'ADMIN')
        throw new ApiError(
          403,
          'ADMIN_REQUIRED',
          'Only an Admin can change the wedding cover.',
        );
    } else if (await WeddingMember.exists({ userId, status: 'ACTIVE' }))
      throw new ApiError(
        409,
        'WEDDING_ALREADY_EXISTS',
        'Open your wedding workspace to change its cover.',
      );
  }
  function configured() {
    if (!storageConfigured(settings))
      throw new ApiError(
        503,
        'MEDIA_UNAVAILABLE',
        'Photo uploads are temporarily unavailable. You can use the signature cover.',
      );
  }
  async function upload(userId, weddingId, raw) {
    const parsed = uploadSchema.safeParse(raw);
    if (!parsed.success)
      throw new ApiError(
        400,
        'INVALID_COVER',
        'Choose a JPG or PNG up to 15 MB.',
      );
    configured();
    const connection = await database.connect();
    await authorize(connection, userId, weddingId);
    const Media = mediaModel(connection);
    const instant = now();
    if (
      (await Media.countDocuments({
        ownerUserId: userId,
        attached: false,
        status: { $in: ['PENDING_UPLOAD', 'READY'] },
        purgeAfter: { $gt: instant },
      })) >= 10
    )
      throw new ApiError(
        429,
        'MEDIA_LIMIT',
        'Several uploads are awaiting completion. Please try again later or use the signature cover.',
      );
    const id = new mongoose.Types.ObjectId();
    const base = `${storageScope(settings)}/covers/${id}/`;
    const asset = await Media.create({
      _id: id,
      ownerUserId: userId,
      weddingId: weddingId || null,
      ...parsed.data,
      bucket: settings.r2Bucket,
      objectKey: base + 'original',
      uploadKey: base + 'upload',
      displayKey: base + 'display.webp',
      purgeAfter: new Date(instant.getTime() + 86_400_000),
    });
    const url = await storage.uploadUrl(asset);
    return {
      mediaId: String(id),
      uploadUrl: url,
      expiresAt: new Date(instant.getTime() + 300_000).toISOString(),
    };
  }
  async function complete(userId, weddingId, mediaId) {
    if (!mediaIdSchema.safeParse(mediaId).success) throw absent();
    configured();
    const connection = await database.connect();
    await authorize(connection, userId, weddingId);
    const Media = mediaModel(connection);
    const query = {
      _id: mediaId,
      ownerUserId: userId,
      weddingId: weddingId || null,
    };
    const asset = await Media.findOne(query).lean();
    if (!asset || !assetInScope(asset, settings) || asset.attached)
      throw absent();
    if (asset.status === 'READY' && asset.purgeAfter > now())
      return { mediaId, state: 'READY' };
    if (asset.status !== 'PENDING_UPLOAD' || asset.purgeAfter <= now())
      throw new ApiError(
        410,
        'UPLOAD_EXPIRED',
        'This upload expired. Select the photo again.',
      );
    const token = randomUUID();
    const claimed = await Media.findOneAndUpdate(
      {
        ...query,
        status: 'PENDING_UPLOAD',
        $or: [{ processingUntil: null }, { processingUntil: { $lte: now() } }],
      },
      {
        $set: {
          processingToken: token,
          processingUntil: new Date(now().getTime() + 60_000),
        },
      },
      { returnDocument: 'after' },
    ).lean();
    if (!claimed) throw busy();
    try {
      const details = await storage.finish(claimed);
      await authorize(connection, userId, weddingId);
      const result = await Media.updateOne(
        {
          ...query,
          status: 'PENDING_UPLOAD',
          processingToken: token,
          purgeAfter: { $gt: now() },
        },
        {
          $set: {
            ...details,
            status: 'READY',
            uploadedAt: now(),
            stagingPurgeAfter: new Date(now().getTime() + 600_000),
          },
          $unset: { processingToken: 1, processingUntil: 1 },
        },
      );
      if (result.modifiedCount !== 1) throw busy();
      return { mediaId, state: 'READY' };
    } catch (error) {
      if (error.code === 'INVALID_COVER')
        await Media.updateOne(
          { ...query, status: 'PENDING_UPLOAD', processingToken: token },
          {
            $set: {
              status: 'DELETE_PENDING',
              purgeAfter: new Date(now().getTime() + 600_000),
              deletedAt: now(),
            },
          },
        );
      throw error;
    } finally {
      await Media.updateOne(
        { ...query, processingToken: token },
        { $unset: { processingToken: 1, processingUntil: 1 } },
      );
    }
  }
  async function read(userId, weddingId, mediaId) {
    if (
      ![mediaId, weddingId].every((id) => mediaIdSchema.safeParse(id).success)
    )
      throw absent();
    configured();
    const connection = await database.connect();
    const { Wedding, WeddingMember } = weddingModels(connection);
    const member = await WeddingMember.exists({
      userId,
      weddingId,
      status: 'ACTIVE',
    });
    const wedding =
      member &&
      (await Wedding.findOne({
        _id: weddingId,
        coverMediaId: mediaId,
        deletedAt: null,
      }).lean());
    if (!wedding) throw absent();
    const asset = await mediaModel(connection)
      .findOne({ _id: mediaId, weddingId, status: 'READY', attached: true })
      .lean();
    if (!asset || !assetInScope(asset, settings)) throw absent();
    return {
      mediaId,
      url: await storage.readUrl(asset),
      expiresAt: new Date(now().getTime() + 300_000).toISOString(),
      width: asset.width,
      height: asset.height,
    };
  }
  let cleaning = false;
  async function cleanup() {
    if (cleaning || !storageConfigured(settings)) return;
    cleaning = true;
    try {
      const connection = await database.connect();
      const Media = mediaModel(connection);
      const { Wedding } = weddingModels(connection);
      const scope = {
        bucket: settings.r2Bucket,
        objectKey: { $regex: `^${storageScope(settings)}/covers/` },
      };
      const staging = await Media.find({
        ...scope,
        status: 'READY',
        stagingPurgeAfter: { $lte: now() },
      })
        .limit(10)
        .lean();
      for (const asset of staging) {
        await storage.remove(asset, true);
        await Media.updateOne(
          { _id: asset._id, status: 'READY' },
          { $unset: { stagingPurgeAfter: 1 } },
        );
      }
      for (let index = 0; index < 10; index++) {
        let claimed;
        await connection.transaction(async (transaction) => {
          claimed = await Media.findOneAndUpdate(
            {
              ...scope,
              purgeAfter: { $lte: now() },
              attached: false,
              status: { $in: ['PENDING_UPLOAD', 'READY', 'DELETE_PENDING'] },
              $or: [
                { processingUntil: null },
                { processingUntil: { $lte: now() } },
              ],
            },
            {
              $set: {
                status: 'DELETE_PENDING',
                processingToken: randomUUID(),
                processingUntil: new Date(now().getTime() + 60_000),
              },
            },
            { session: transaction, returnDocument: 'after' },
          ).lean();
          if (
            claimed &&
            (await Wedding.exists({ coverMediaId: claimed._id }).session(
              transaction,
            ))
          ) {
            await Media.updateOne(
              { _id: claimed._id },
              {
                $set: { status: 'READY', attached: true },
                $unset: {
                  purgeAfter: 1,
                  processingUntil: 1,
                  processingToken: 1,
                },
              },
              { session: transaction },
            );
            claimed = null;
          }
        });
        if (!claimed) break;
        await storage.remove(claimed);
        await Media.updateOne(
          {
            _id: claimed._id,
            status: 'DELETE_PENDING',
            processingToken: claimed.processingToken,
          },
          {
            $set: { status: 'DELETED', deletedAt: now() },
            $unset: {
              processingUntil: 1,
              processingToken: 1,
              purgeAfter: 1,
              stagingPurgeAfter: 1,
            },
          },
        );
      }
    } finally {
      cleaning = false;
    }
  }
  const safe =
    (operation) =>
    async (...args) => {
      try {
        return await operation(...args);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        console.error('Media operation failed.');
        throw new ApiError(
          503,
          'MEDIA_UNAVAILABLE',
          'We could not upload or load your photo. Please retry.',
        );
      }
    };
  return {
    upload: safe(upload),
    complete: safe(complete),
    read: safe(read),
    cleanup: safe(cleanup),
    close: () => storage.close?.(),
  };
}
