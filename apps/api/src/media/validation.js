import { z } from 'zod';

export const MAX_COVER_BYTES = 15_000_000;
export const mediaIdSchema = z.string().regex(/^[a-f\d]{24}$/);
export const coverFrameSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    zoom: z.number().finite().min(1).max(3),
  })
  .strict();
export const defaultCoverFrame = { x: 0.5, y: 0.5, zoom: 1 };
export const uploadSchema = z
  .object({
    mimeType: z.enum(['image/jpeg', 'image/png']),
    sizeBytes: z.number().int().min(1).max(MAX_COVER_BYTES),
  })
  .strict();
export const saveCoverSchema = z
  .object({
    mediaId: mediaIdSchema.nullable(),
    frame: coverFrameSchema.default(defaultCoverFrame),
    version: z.number().int().min(0),
  })
  .strict();

export function storageConfigured(settings) {
  return (
    /^[a-f\d]{32}$/i.test(settings.r2AccountId || '') &&
    /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(settings.r2Bucket || '') &&
    Boolean(settings.r2AccessKeyId && settings.r2SecretAccessKey)
  );
}

export function storageScope(settings) {
  return settings.nodeEnv === 'production' ? 'prod' : 'dev';
}

export function assetInScope(asset, settings) {
  const base = `${storageScope(settings)}/covers/${asset._id}/`;
  return (
    asset.bucket === settings.r2Bucket &&
    asset.objectKey === base + 'original' &&
    asset.displayKey === base + 'display.webp' &&
    asset.uploadKey === base + 'upload'
  );
}
