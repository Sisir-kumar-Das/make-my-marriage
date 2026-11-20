import { createHash } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { ApiError } from '../lib/api-error.js';
import {
  MAX_COVER_BYTES,
  MAX_AVATAR_BYTES,
  PROFILE_AVATAR,
  storageConfigured,
  assetInScope,
} from './validation.js';

const invalid = (avatar = false) =>
  new ApiError(
    400,
    avatar ? 'INVALID_AVATAR' : 'INVALID_COVER',
    avatar
      ? 'Choose a valid JPG, PNG or WebP up to 10 MB and 40 megapixels.'
      : 'Choose a valid JPG or PNG up to 15 MB and 40 megapixels.',
  );

export async function prepareCover(bytes, expectedMime, avatar = false) {
  const maxBytes = avatar ? MAX_AVATAR_BYTES : MAX_COVER_BYTES;
  if (!bytes.length || bytes.length > maxBytes) throw invalid(avatar);
  try {
    const image = sharp(bytes, {
      limitInputPixels: 40_000_000,
      failOn: 'warning',
      animated: false,
    });
    const metadata = await image.metadata();
    const mime = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      ...(avatar && { webp: 'image/webp' }),
    }[metadata.format];
    if (
      mime !== expectedMime ||
      (metadata.pages || 1) !== 1 ||
      !metadata.width ||
      !metadata.height
    )
      throw invalid(avatar);
    const { data, info } = await image
      .timeout({ seconds: 10 })
      .rotate()
      .resize({
        width: avatar ? 960 : 2400,
        height: avatar ? 960 : 2400,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 92 })
      .toBuffer({ resolveWithObject: true });
    return {
      display: data,
      width: info.width,
      height: info.height,
      checksum: createHash('sha256').update(bytes).digest('hex'),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalid(avatar);
  }
}

export function createCoverStorage(
  settings,
  { client, sign = getSignedUrl } = {},
) {
  let s3 = client;
  let processing = 0;
  function ready() {
    if (!storageConfigured(settings))
      throw new ApiError(
        503,
        'MEDIA_UNAVAILABLE',
        'Photo uploads are temporarily unavailable. You can use the signature cover.',
      );
    s3 ??= new S3Client({
      region: 'auto',
      endpoint: `https://${settings.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: settings.r2AccessKeyId,
        secretAccessKey: settings.r2SecretAccessKey,
      },
      maxAttempts: 1,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      requestHandler: { connectionTimeout: 4000, requestTimeout: 12000 },
    });
    return s3;
  }
  function check(asset) {
    if (!assetInScope(asset, settings))
      throw new ApiError(
        404,
        'MEDIA_NOT_FOUND',
        'This photo is not available.',
      );
  }
  async function safe(operation) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        503,
        'MEDIA_UNAVAILABLE',
        'We could not upload or load your photo. Please retry.',
      );
    }
  }
  async function writeImmutable(
    key,
    bytes,
    mimeType,
    checksum,
    signal,
    avatar,
  ) {
    const input = { Bucket: settings.r2Bucket, Key: key };
    try {
      await ready().send(
        new PutObjectCommand({
          ...input,
          Body: bytes,
          ContentType: mimeType,
          CacheControl: 'private, no-store',
          Metadata: { sha256: checksum },
          IfNoneMatch: '*',
        }),
        { abortSignal: signal },
      );
    } catch (error) {
      if (error.$metadata?.httpStatusCode !== 412) throw error;
      const previous = await ready().send(new HeadObjectCommand(input), {
        abortSignal: signal,
      });
      if (previous.Metadata?.sha256 !== checksum) throw invalid(avatar);
    }
  }
  return {
    async uploadUrl(asset) {
      return safe(async () => {
        check(asset);
        return sign(
          ready(),
          new PutObjectCommand({
            Bucket: settings.r2Bucket,
            Key: asset.uploadKey,
            ContentType: asset.mimeType,
            ContentLength: asset.sizeBytes,
          }),
          {
            expiresIn: 300,
            signableHeaders: new Set(['content-type', 'content-length']),
          },
        );
      });
    },
    async finish(asset) {
      const avatar = asset.purpose === PROFILE_AVATAR;
      const maxBytes = avatar ? MAX_AVATAR_BYTES : MAX_COVER_BYTES;
      if (processing >= 2)
        throw new ApiError(
          429,
          'MEDIA_PROCESSING',
          'Other photos are being checked. Please retry shortly.',
        );
      processing++;
      try {
        return await safe(async () => {
          check(asset);
          const signal = AbortSignal.timeout(25000);
          const request = { Bucket: asset.bucket, Key: asset.uploadKey };
          const head = await ready().send(new HeadObjectCommand(request), {
            abortSignal: signal,
          });
          if (
            head.ContentLength !== asset.sizeBytes ||
            head.ContentLength > maxBytes ||
            head.ContentType !== asset.mimeType
          )
            throw invalid(avatar);
          const response = await ready().send(
            new GetObjectCommand({ ...request, IfMatch: head.ETag }),
            { abortSignal: signal },
          );
          const chunks = [];
          let size = 0;
          try {
            for await (const chunk of response.Body) {
              size += chunk.length;
              if (size > asset.sizeBytes || size > maxBytes)
                throw invalid(avatar);
              chunks.push(chunk);
            }
          } finally {
            response.Body.destroy?.();
          }
          if (size !== asset.sizeBytes) throw invalid(avatar);
          const original = Buffer.concat(chunks);
          const prepared = await prepareCover(original, asset.mimeType, avatar);
          await writeImmutable(
            asset.objectKey,
            original,
            asset.mimeType,
            prepared.checksum,
            signal,
            avatar,
          );
          await writeImmutable(
            asset.displayKey,
            prepared.display,
            'image/webp',
            prepared.checksum,
            signal,
            avatar,
          );
          return {
            width: prepared.width,
            height: prepared.height,
            checksum: prepared.checksum,
          };
        });
      } finally {
        processing--;
      }
    },
    async readUrl(asset) {
      return safe(async () => {
        check(asset);
        return sign(
          ready(),
          new GetObjectCommand({
            Bucket: asset.bucket,
            Key: asset.displayKey,
            ResponseCacheControl: 'private, no-store',
          }),
          { expiresIn: 300 },
        );
      });
    },
    async remove(asset, stagingOnly = false) {
      return safe(async () => {
        check(asset);
        for (const Key of stagingOnly
          ? [asset.uploadKey]
          : [asset.uploadKey, asset.objectKey, asset.displayKey])
          await ready().send(
            new DeleteObjectCommand({ Bucket: asset.bucket, Key }),
          );
      });
    },
    close() {
      s3?.destroy();
    },
  };
}
