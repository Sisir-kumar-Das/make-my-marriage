import { randomUUID } from 'node:crypto';
import { weddingModels } from './models.js';
import { mediaModel } from '../media/models.js';
import { authModels } from '../auth/models.js';

// Explicit V1 tenant collections only. Never include global users/sessions/tokens.
export const WEDDING_CHILDREN = [
  'tasks',
  'taskSeries',
  'taskWriteRequests',
  'events',
  'eventWriteRequests',
  'checklistGenerations',
  'checklistWriteRequests',
  'memberInvitations',
  'invitationWriteRequests',
  'memberWriteRequests',
  'memberRemovalRequests',
  'weddingCreationRequests',
  'weddingSettingsRequests',
  'weddingLifecycleRequests',
  'activities',
];
export function createWeddingPurger({
  database,
  storage,
  now = () => new Date(),
}) {
  let running;
  async function batch() {
    const connection = await database.connect();
    const { Wedding, WeddingMember } = weddingModels(connection);
    const Media = mediaModel(connection);
    const { User } = authModels(connection);
    const instant = now(),
      token = randomUUID();
    const wedding = await Wedding.findOneAndUpdate(
      {
        deletedAt: { $ne: null },
        purgeAfter: { $lte: instant },
        $and: [
          {
            $or: [
              { purgeLeaseUntil: null },
              { purgeLeaseUntil: { $lte: instant } },
            ],
          },
          {
            $or: [{ purgeRetryAt: null }, { purgeRetryAt: { $lte: instant } }],
          },
        ],
      },
      {
        $set: {
          purgeState: 'PURGING',
          purgeToken: token,
          purgeLeaseUntil: new Date(+instant + 60000),
        },
      },
      {
        sort: { purgeRetryAt: 1, purgeAfter: 1, _id: 1 },
        returnDocument: 'after',
      },
    ).lean();
    if (!wedding) return { processed: 0 };
    const lease = {
      _id: wedding._id,
      purgeToken: token,
      deletedAt: { $ne: null },
      purgeAfter: { $lte: now() },
    };
    async function renew(transaction) {
      const result = await Wedding.updateOne(
        lease,
        { $set: { purgeLeaseUntil: new Date(+now() + 60000) } },
        { session: transaction },
      );
      if (result.matchedCount !== 1) throw new Error('Purge lease changed.');
    }
    let failed = false;
    try {
      // Finish all media before children. Wait for any in-flight uploader to finish.
      const assets = await Media.find({ weddingId: wedding._id })
        .limit(10)
        .lean();
      for (const asset of assets) {
        if (
          asset.purpose !== 'WEDDING_COVER' ||
          asset.processingUntil > now() ||
          (await User.exists({ avatarMediaId: asset._id })) ||
          (await Wedding.exists({
            _id: { $ne: wedding._id },
            coverMediaId: asset._id,
          }))
        )
          throw new Error('Media is not ready for wedding purge.');
        await renew();
        await storage.remove(asset); // Environment/bucket/key checks belong to the existing adapter.
        await connection.transaction(async (transaction) => {
          await renew(transaction);
          await Media.deleteOne(
            {
              _id: asset._id,
              weddingId: wedding._id,
              purpose: 'WEDDING_COVER',
            },
            { session: transaction },
          );
        });
      }
      if (assets.length) return { processed: 1, complete: false };
      // One bounded child batch per invocation; retrying cannot recreate data.
      for (const name of WEDDING_CHILDREN) {
        const collection = connection.collection(name);
        const rows = await collection
          .find({ weddingId: wedding._id }, { projection: { _id: 1 } })
          .limit(100)
          .toArray();
        if (!rows.length) continue;
        await connection.transaction(async (transaction) => {
          await renew(transaction);
          await collection.deleteMany(
            {
              weddingId: wedding._id,
              _id: { $in: rows.map((row) => row._id) },
            },
            { session: transaction },
          );
        });
        return { processed: 1, complete: false };
      }
      await connection.transaction(async (transaction) => {
        await renew(transaction);
        if (await Media.exists({ weddingId: wedding._id }).session(transaction))
          throw new Error('Media remains.');
        for (const name of WEDDING_CHILDREN)
          if (
            await connection
              .collection(name)
              .findOne(
                { weddingId: wedding._id },
                { session: transaction, projection: { _id: 1 } },
              )
          )
            throw new Error('Child data remains.');
        await WeddingMember.deleteMany(
          { weddingId: wedding._id },
          { session: transaction },
        );
        const removed = await Wedding.deleteOne(lease, {
          session: transaction,
        });
        if (removed.deletedCount !== 1) throw new Error('Purge lease changed.');
      });
      return { processed: 1, complete: true };
    } catch {
      failed = true;
      await Wedding.updateOne(lease, {
        $set: { purgeRetryAt: new Date(+now() + 300000) },
      });
      throw new Error('Wedding purge paused; a bounded retry is required.');
    } finally {
      await Wedding.updateOne(lease, {
        $set: {
          purgeLeaseUntil: null,
          ...(!failed && { purgeRetryAt: now() }),
        },
        $unset: { purgeToken: 1 },
      });
    }
  }
  return {
    pump() {
      running ||= batch().finally(() => {
        running = null;
      });
      return running;
    },
    close: () => running || Promise.resolve(),
  };
}
