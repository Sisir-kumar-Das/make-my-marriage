import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, createHash } from 'node:crypto';
import sharp from 'sharp';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../apps/api/src/config.js';
import { createCoverStorage } from '../apps/api/src/media/storage.js';
import {
  storageConfigured,
  storageScope,
  MAX_COVER_BYTES,
} from '../apps/api/src/media/validation.js';

test(
  'live R2: 15 MB signed upload, browser CORS, private reads, immutable promotion and cleanup',
  { skip: !storageConfigured(config) && 'Set private R2 settings.' },
  async (t) => {
    const id = randomBytes(12).toString('hex');
    const base = `${storageScope(config)}/covers/${id}/`;
    const asset = {
      _id: id,
      bucket: config.r2Bucket,
      objectKey: base + 'original',
      uploadKey: base + 'upload',
      displayKey: base + 'display.webp',
      mimeType: 'image/jpeg',
      sizeBytes: MAX_COVER_BYTES,
    };
    const storage = createCoverStorage(config);
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2AccessKeyId,
        secretAccessKey: config.r2SecretAccessKey,
      },
      maxAttempts: 1,
      requestHandler: { connectionTimeout: 4000, requestTimeout: 15000 },
    });
    const jpeg = await sharp({
      create: { width: 1600, height: 1000, channels: 3, background: '#a8788e' },
    })
      .jpeg()
      .toBuffer();
    const original = Buffer.concat([
      jpeg,
      Buffer.alloc(MAX_COVER_BYTES - jpeg.length),
    ]);
    let url;
    try {
      await t.test(
        'presigned PUT supports localhost and the isolated preview origin, without permitting arbitrary origins',
        async () => {
          url = await storage.uploadUrl(asset);
          for (const origin of [
            'http://localhost:3000',
            'http://127.0.0.1:3001',
          ]) {
            const preflight = await fetch(url, {
              method: 'OPTIONS',
              headers: {
                Origin: origin,
                'Access-Control-Request-Method': 'PUT',
                'Access-Control-Request-Headers': 'content-type',
              },
              signal: AbortSignal.timeout(15000),
            });
            assert.equal(
              preflight.headers.get('access-control-allow-origin') === origin,
              true,
              'Configured browser origin must be permitted.',
            );
            assert.equal(
              preflight.headers
                .get('access-control-allow-methods')
                ?.includes('PUT'),
              true,
            );
          }
          const denied = await fetch(url, {
            method: 'OPTIONS',
            headers: {
              Origin: 'https://untrusted.example',
              'Access-Control-Request-Method': 'PUT',
            },
            signal: AbortSignal.timeout(15000),
          });
          assert.notEqual(
            denied.headers.get('access-control-allow-origin'),
            'https://untrusted.example',
          );
        },
      );
      await t.test(
        'the production adapter accepts and decodes a full 15,000,000-byte disposable image',
        async () => {
          const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': asset.mimeType },
            body: original,
            signal: AbortSignal.timeout(60000),
          });
          assert.equal(
            response.ok,
            true,
            'R2 signed upload must accept the exact file length and content type.',
          );
          const details = await storage.finish(asset);
          assert.equal(
            details.checksum,
            createHash('sha256').update(original).digest('hex'),
          );
          assert.equal(details.width, 1600);
          assert.equal(details.height, 1000);
        },
      );
      await t.test(
        'display reads are short-lived/private and anonymous access fails',
        async () => {
          const signed = await storage.readUrl(asset);
          const response = await fetch(signed, {
            signal: AbortSignal.timeout(15000),
          });
          assert.equal(response.ok, true);
          assert.equal(response.headers.get('content-type'), 'image/webp');
          assert.match(response.headers.get('cache-control'), /private/);
          await response.arrayBuffer();
          const unsigned = new URL(signed);
          unsigned.search = '';
          const denied = await fetch(unsigned, {
            signal: AbortSignal.timeout(15000),
          });
          assert.equal([400, 401, 403, 404].includes(denied.status), true);
          assert.equal(
            denied.headers.get('content-type')?.startsWith('image/'),
            false,
          );
        },
      );
      await t.test(
        'reusing the staging PUT cannot replace the published original',
        async () => {
          const second = await sharp({
            create: {
              width: 1600,
              height: 1000,
              channels: 3,
              background: '#405d8c',
            },
          })
            .jpeg()
            .toBuffer();
          const replacement = Buffer.concat([
            second,
            Buffer.alloc(MAX_COVER_BYTES - second.length),
          ]);
          const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': asset.mimeType },
            body: replacement,
            signal: AbortSignal.timeout(60000),
          });
          assert.equal(response.ok, true);
          await assert.rejects(storage.finish(asset), {
            code: 'INVALID_COVER',
          });
          const head = await client.send(
            new HeadObjectCommand({
              Bucket: asset.bucket,
              Key: asset.objectKey,
            }),
          );
          assert.equal(
            head.Metadata.sha256,
            createHash('sha256').update(original).digest('hex'),
          );
        },
      );
    } finally {
      try {
        await storage.remove(asset);
        for (const Key of [
          asset.uploadKey,
          asset.objectKey,
          asset.displayKey,
        ]) {
          let missing = false;
          try {
            await client.send(
              new HeadObjectCommand({ Bucket: asset.bucket, Key }),
            );
          } catch (error) {
            missing = error.$metadata?.httpStatusCode === 404;
          }
          assert.equal(missing, true, 'Disposable R2 object must be removed.');
        }
        console.log('All three generated R2 test objects removed.');
      } finally {
        client.destroy();
        storage.close();
      }
    }
  },
);
