import { ApiError } from '../lib/api-error.js';
import { mediaModel } from './models.js';
import { assetInScope } from './validation.js';

export async function attachCover(
  connection,
  transaction,
  { mediaId, userId, weddingId, setup, settings, instant },
) {
  if (!mediaId) return;
  const Media = mediaModel(connection);
  const asset = await Media.findOne({
    _id: mediaId,
    ownerUserId: userId,
    weddingId: setup ? null : weddingId,
    purpose: 'WEDDING_COVER',
    status: 'READY',
    attached: false,
    purgeAfter: { $gt: instant },
  })
    .session(transaction)
    .lean();
  if (!asset || !assetInScope(asset, settings))
    throw new ApiError(
      400,
      'COVER_NOT_READY',
      'This photo is no longer ready. Select it again and retry.',
    );
  const claim = await Media.updateOne(
    {
      _id: asset._id,
      status: 'READY',
      attached: false,
      purgeAfter: { $gt: instant },
    },
    {
      $set: { weddingId, attached: true },
      $unset: { purgeAfter: 1 },
    },
    { session: transaction },
  );
  if (claim.modifiedCount !== 1)
    throw new ApiError(
      409,
      'COVER_NOT_READY',
      'This photo changed. Select it again and retry.',
    );
}

export async function detachCover(connection, transaction, mediaId, instant) {
  if (!mediaId) return;
  await mediaModel(connection).updateOne(
    { _id: mediaId, status: 'READY', attached: true },
    {
      $set: {
        attached: false,
        status: 'DELETE_PENDING',
        deletedAt: instant,
        purgeAfter: new Date(instant.getTime() + 600_000),
      },
    },
    { session: transaction },
  );
}
