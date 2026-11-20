import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createApp } from '../apps/api/src/app.js';
import { config } from '../apps/api/src/config.js';
import { ApiError } from '../apps/api/src/lib/api-error.js';
import {
  createCoverStorage,
  prepareCover,
} from '../apps/api/src/media/storage.js';
import {
  uploadSchema,
  avatarUploadSchema,
  MAX_AVATAR_BYTES,
  PROFILE_AVATAR,
  saveCoverSchema,
  MAX_COVER_BYTES,
  assetInScope,
} from '../apps/api/src/media/validation.js';
import {
  defaultFrame,
  draggedFrame,
  frameStyle,
  coverFileError,
} from '../apps/web/src/features/weddings/cover-data.js';
import { uploadFile } from '../apps/web/src/lib/api-client.js';
import {
  weddingInput,
  setupSchemaForSubmission,
} from '../apps/web/src/features/weddings/form-data.js';
import { performCoverUpload } from '../apps/web/src/features/weddings/cover-upload.js';
import { createMediaService } from '../apps/api/src/media/service.js';

test('missing R2 configuration fails safely before database work', async () => {
  let connects = 0;
  const media = createMediaService({
    settings: { ...settings, r2SecretAccessKey: '' },
    database: {
      connect() {
        connects++;
        throw new Error('Must not connect');
      },
    },
  });
  await assert.rejects(
    media.upload(id, null, { mimeType: 'image/jpeg', sizeBytes: 123 }),
    { code: 'MEDIA_UNAVAILABLE' },
  );
  assert.equal(connects, 0);
});

test('heavy image processing is bounded and capacity is released after failure', async () => {
  const gate = Promise.withResolvers();
  let starts = 0;
  const client = {
    async send() {
      starts++;
      await gate.promise;
      throw new Error('private-provider-error');
    },
  };
  const storage = createCoverStorage(settings, { client });
  const first = storage.finish({ ...asset, sizeBytes: 123 });
  const second = storage.finish({ ...asset, sizeBytes: 123 });
  await assert.rejects(storage.finish({ ...asset, sizeBytes: 123 }), {
    code: 'MEDIA_PROCESSING',
  });
  assert.equal(starts, 2);
  gate.resolve();
  await assert.rejects(first, { code: 'MEDIA_UNAVAILABLE' });
  await assert.rejects(second, { code: 'MEDIA_UNAVAILABLE' });
  await assert.rejects(storage.finish({ ...asset, sizeBytes: 123 }), {
    code: 'MEDIA_UNAVAILABLE',
  });
  assert.equal(starts, 3);
});

test('lost completion replies retry confirmation without repeating the upload, and clear stale progress', async () => {
  const receipt = { current: null };
  let signs = 0,
    sends = 0,
    confirmations = 0;
  let progress;
  const input = {
    receipt,
    file: { type: 'image/jpeg', size: 12 },
    base: '/media/wedding-cover',
    signal: new AbortController().signal,
    onProgress: (value) => {
      progress = value;
    },
    request: async (path) => {
      if (path.endsWith('/upload-url')) {
        signs++;
        return {
          data: {
            mediaId: id,
            uploadUrl: 'fixture',
            expiresAt: '2099-01-01T00:00:00Z',
          },
        };
      }
      confirmations++;
      if (confirmations === 1)
        throw Object.assign(new Error('Response lost'), { code: 'TIMEOUT' });
      return { data: { mediaId: id, state: 'READY' } };
    },
    send: async () => {
      sends++;
    },
  };
  await assert.rejects(performCoverUpload(input), { code: 'TIMEOUT' });
  assert.equal(progress, null);
  assert.equal(receipt.current.uploaded, true);
  assert.equal(receipt.current.ready, undefined);
  assert.equal(await performCoverUpload(input), id);
  assert.equal(await performCoverUpload(input), id);
  assert.equal(signs, 1);
  assert.equal(sends, 1);
  assert.equal(confirmations, 2);
  assert.deepEqual(progress, { phase: 'Photo ready', percent: 100 });
});

test('expired failed PUTs get a new grant while permanently invalid confirmations discard their receipt', async () => {
  const receipt = {
    current: {
      mediaId: id,
      uploadUrl: 'old',
      expiresAt: '2000-01-01T00:00:00Z',
    },
  };
  let signed = false,
    sent;
  await assert.rejects(
    performCoverUpload({
      receipt,
      file: { type: 'image/jpeg', size: 12 },
      base: '/media/wedding-cover',
      request: async (path) => {
        if (path.endsWith('/upload-url')) {
          signed = true;
          return {
            data: {
              mediaId: id,
              uploadUrl: 'new',
              expiresAt: '2099-01-01T00:00:00Z',
            },
          };
        }
        throw Object.assign(new Error('Invalid photo'), {
          code: 'INVALID_COVER',
        });
      },
      send: async (url) => {
        sent = url;
      },
    }),
    { code: 'INVALID_COVER' },
  );
  assert.equal(signed, true);
  assert.equal(sent, 'new');
  assert.equal(receipt.current, null);
});

const settings = {
  ...config,
  nodeEnv: 'test',
  r2AccountId: 'a'.repeat(32),
  r2AccessKeyId: 'fixture',
  r2SecretAccessKey: 'fixture',
  r2Bucket: 'fixture-bucket',
};
const id = '123456789012345678901234';
const asset = {
  _id: id,
  bucket: settings.r2Bucket,
  objectKey: `dev/covers/${id}/original`,
  uploadKey: `dev/covers/${id}/upload`,
  displayKey: `dev/covers/${id}/display.webp`,
  mimeType: 'image/jpeg',
};
const jpeg = await sharp({
  create: { width: 160, height: 120, channels: 3, background: '#b58294' },
})
  .jpeg()
  .toBuffer();

test('avatar limits and decoding are isolated from wedding covers', async () => {
  const image = await sharp(jpeg).webp().toBuffer();
  assert.equal(
    avatarUploadSchema.safeParse({
      mimeType: 'image/webp',
      sizeBytes: MAX_AVATAR_BYTES,
    }).success,
    true,
  );
  assert.equal(
    avatarUploadSchema.safeParse({
      mimeType: 'image/webp',
      sizeBytes: MAX_AVATAR_BYTES + 1,
    }).success,
    false,
  );
  assert.equal(
    uploadSchema.safeParse({ mimeType: 'image/webp', sizeBytes: image.length })
      .success,
    false,
  );
  assert.equal((await prepareCover(image, 'image/webp', true)).width, 160);
  await assert.rejects(prepareCover(image, 'image/webp'), {
    code: 'INVALID_COVER',
  });
  await assert.rejects(prepareCover(jpeg, 'image/webp', true), {
    code: 'INVALID_AVATAR',
  });
  const base = `dev/avatars/${id}/`;
  assert.equal(
    assetInScope({ ...asset, purpose: PROFILE_AVATAR }, settings),
    false,
  );
  assert.equal(
    assetInScope(
      {
        ...asset,
        purpose: PROFILE_AVATAR,
        objectKey: base + 'original',
        uploadKey: base + 'upload',
        displayKey: base + 'display.webp',
      },
      settings,
    ),
    true,
  );
});

test('avatar saves claim only the owner’s staged avatar and version removals and retries', async () => {
  const owner = 'b'.repeat(24);
  const outsider = 'c'.repeat(24);
  const replacement = 'e'.repeat(24);
  const weddingId = 'd'.repeat(24);
  const staged = (mediaId) => ({
    _id: mediaId,
    ownerUserId: owner,
    weddingId: null,
    purpose: PROFILE_AVATAR,
    status: 'READY',
    attached: false,
    purgeAfter: new Date(Date.now() + 60000),
    bucket: settings.r2Bucket,
    objectKey: `dev/avatars/${mediaId}/original`,
    uploadKey: `dev/avatars/${mediaId}/upload`,
    displayKey: `dev/avatars/${mediaId}/display.webp`,
  });
  const assets = new Map([
    [id, staged(id)],
    [replacement, staged(replacement)],
  ]);
  const account = { _id: owner };
  let writes = 0;
  const query = (value) => ({
    lean: async () => value,
    select() {
      return this;
    },
    session() {
      return this;
    },
  });
  const matches = (row, filter) =>
    row &&
    Object.entries(filter).every(([key, value]) =>
      key === 'purgeAfter' ? row[key] > value.$gt : row[key] === value,
    );
  const models = {
    User: {
      findOne: (filter) =>
        query(filter._id === owner ? { ...account } : { _id: outsider }),
      exists: async (filter) =>
        filter._id === owner && filter.avatarMediaId === account.avatarMediaId,
      updateOne: async (filter, changes) => {
        assert.equal(filter._id, owner);
        assert.equal(filter.status, 'ACTIVE');
        Object.assign(account, changes.$set);
        for (const key of Object.keys(changes.$unset ?? {}))
          delete account[key];
        account.avatarVersion =
          (account.avatarVersion ?? 0) + changes.$inc.avatarVersion;
        writes++;
      },
    },
    AuthToken: {},
    Session: {},
    Wedding: { exists: async () => true },
    WeddingMember: {
      findOne: ({ userId }) =>
        query(userId === 'a'.repeat(24) ? { weddingId } : null),
      exists: async (filter) =>
        filter.userId === owner &&
        filter.weddingId === weddingId &&
        filter.status === 'ACTIVE',
    },
    WeddingCreationRequest: {},
    WeddingSettingsRequest: {},
    MediaAsset: {
      findOne: (filter) => {
        const row = assets.get(filter._id);
        return query(matches(row, filter) ? row : null);
      },
      updateOne: async (filter, update) => {
        const row = assets.get(filter._id);
        if (!matches(row, filter)) return { modifiedCount: 0 };
        Object.assign(row, update.$set);
        for (const key of Object.keys(update.$unset ?? {})) delete row[key];
        return { modifiedCount: 1 };
      },
    },
  };
  const media = createMediaService({
    settings,
    database: {
      connect: async () => ({ models, transaction: (fn) => fn({}) }),
    },
    storage: { readUrl: async (photo) => 'signed/' + photo._id },
  });
  const frame = { x: 0.2, y: 0.7, zoom: 1.6 };
  await assert.rejects(
    media.setAvatar(outsider, {
      accountId: owner,
      mediaId: id,
      frame,
      version: 0,
    }),
    { code: 'AVATAR_CHANGED' },
  );
  await assert.rejects(
    media.setAvatar(outsider, {
      accountId: outsider,
      mediaId: id,
      frame,
      version: 0,
    }),
    { code: 'MEDIA_NOT_FOUND' },
  );
  await assert.rejects(media.readAvatar(owner, id), {
    code: 'MEDIA_NOT_FOUND',
  });
  const patch = { accountId: owner, mediaId: id, frame, version: 0 };
  assert.deepEqual(await media.setAvatar(owner, patch), {
    id: owner,
    avatar: { mediaId: id, frame },
    avatarVersion: 1,
  });
  assert.deepEqual(await media.setAvatar(owner, patch), {
    id: owner,
    avatar: { mediaId: id, frame },
    avatarVersion: 1,
  });
  assert.equal(writes, 1);
  assert.equal((await media.readAvatar(owner, id)).url, 'signed/' + id);
  assert.equal(
    (await media.readAvatar('a'.repeat(24), id)).url,
    'signed/' + id,
  );
  await assert.rejects(media.readAvatar(outsider, id), {
    code: 'MEDIA_NOT_FOUND',
  });

  await assert.rejects(
    media.setAvatar(owner, { ...patch, mediaId: replacement }),
    { code: 'AVATAR_CHANGED' },
  );
  await media.setAvatar(owner, { ...patch, mediaId: replacement, version: 1 });
  assert.equal(assets.get(id).status, 'DELETE_PENDING');
  await assert.rejects(media.readAvatar(owner, id), {
    code: 'MEDIA_NOT_FOUND',
  });
  const removed = await media.setAvatar(owner, {
    ...patch,
    mediaId: null,
    version: 2,
  });
  assert.equal(removed.avatar, null);
  assert.equal(assets.get(replacement).status, 'DELETE_PENDING');
  await assert.rejects(media.readAvatar('a'.repeat(24), replacement), {
    code: 'MEDIA_NOT_FOUND',
  });
});

test('cover contracts accept exactly 15 MB, bound framing, and reject unsupported/injected metadata', () => {
  assert.equal(
    uploadSchema.safeParse({
      mimeType: 'image/jpeg',
      sizeBytes: MAX_COVER_BYTES,
    }).success,
    true,
  );
  for (const patch of [
    { sizeBytes: MAX_COVER_BYTES + 1 },
    { sizeBytes: 0 },
    { sizeBytes: 1.5 },
    { mimeType: 'image/svg+xml' },
    { mimeType: 'image/webp' },
    { objectKey: 'prod/other' },
    { weddingId: id },
  ])
    assert.equal(
      uploadSchema.safeParse({ mimeType: 'image/png', sizeBytes: 12, ...patch })
        .success,
      false,
    );
  assert.equal(
    saveCoverSchema.safeParse({ mediaId: id, frame: defaultFrame, version: 0 })
      .success,
    true,
  );
  for (const frame of [
    { ...defaultFrame, x: -0.1 },
    { ...defaultFrame, y: 1.1 },
    { ...defaultFrame, zoom: 4 },
    { ...defaultFrame, x: NaN },
    { ...defaultFrame, url: 'https://untrusted' },
  ])
    assert.equal(
      saveCoverSchema.safeParse({ mediaId: id, frame, version: 1 }).success,
      false,
    );
  assert.equal(
    coverFileError({ type: 'image/png', size: MAX_COVER_BYTES }),
    '',
  );
  assert.ok(coverFileError({ type: 'image/jpeg', size: MAX_COVER_BYTES + 1 }));
  assert.ok(coverFileError({ type: 'image/svg+xml', size: 12 }));
});

test('actual decoding rejects disguised, truncated, mismatched and excessive-pixel images and strips display metadata', async () => {
  const original = await sharp(jpeg)
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const result = await prepareCover(original, 'image/jpeg');
  assert.equal(
    result.checksum,
    createHash('sha256').update(original).digest('hex'),
  );
  assert.equal(result.width, 120);
  assert.equal(result.height, 160);
  const metadata = await sharp(result.display).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
  for (const [bytes, mime] of [
    [
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      'image/png',
    ],
    [jpeg, 'image/png'],
    [jpeg.subarray(0, 32), 'image/jpeg'],
    [Buffer.alloc(MAX_COVER_BYTES + 1), 'image/jpeg'],
  ])
    await assert.rejects(prepareCover(bytes, mime), { code: 'INVALID_COVER' });
  const huge = Buffer.from(jpeg);
  const marker = huge.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(marker > 0);
  huge.writeUInt16BE(6500, marker + 5);
  huge.writeUInt16BE(6500, marker + 7);
  await assert.rejects(prepareCover(huge, 'image/jpeg'), {
    code: 'INVALID_COVER',
  });
});

function memoryClient() {
  const objects = new Map();
  const calls = [];
  return {
    objects,
    calls,
    async send(command) {
      const input = command.input,
        name = command.constructor.name;
      calls.push({ name, input });
      const previous = objects.get(input.Key);
      if (name === 'HeadObjectCommand') {
        if (!previous) throw new Error('private-storage-detail');
        return {
          ContentLength: previous.bytes.length,
          ContentType: previous.type,
          Metadata: previous.metadata,
          ETag: 'fixture-etag',
        };
      }
      if (name === 'GetObjectCommand')
        return { Body: Readable.from([previous.bytes]), ETag: 'fixture-etag' };
      if (name === 'PutObjectCommand') {
        if (previous && input.IfNoneMatch === '*')
          throw { $metadata: { httpStatusCode: 412 } };
        objects.set(input.Key, {
          bytes: Buffer.from(input.Body),
          type: input.ContentType,
          metadata: input.Metadata,
        });
        return {};
      }
      if (name === 'DeleteObjectCommand') {
        objects.delete(input.Key);
        return {};
      }
      throw new Error('Unexpected storage operation');
    },
    destroy() {},
  };
}

test('staging replay cannot replace immutable originals/display; exact retries reuse verified objects', async () => {
  const client = memoryClient();
  const record = { ...asset, sizeBytes: jpeg.length };
  client.objects.set(asset.uploadKey, { bytes: jpeg, type: 'image/jpeg' });
  const storage = createCoverStorage(settings, { client });
  const result = await storage.finish(record);
  assert.equal(result.width, 160);
  assert.deepEqual(client.objects.get(asset.objectKey).bytes, jpeg);
  const display = Buffer.from(client.objects.get(asset.displayKey).bytes);
  await storage.finish(record);
  assert.deepEqual(client.objects.get(asset.displayKey).bytes, display);
  const changed = Buffer.from(jpeg);
  changed[changed.length - 10] ^= 1;
  client.objects.set(asset.uploadKey, { bytes: changed, type: 'image/jpeg' });
  await assert.rejects(storage.finish(record), { code: 'INVALID_COVER' });
  assert.deepEqual(client.objects.get(asset.objectKey).bytes, jpeg);
  assert.deepEqual(client.objects.get(asset.displayKey).bytes, display);
  assert.ok(
    client.calls
      .filter((c) => c.name === 'PutObjectCommand')
      .every((c) => c.input.IfNoneMatch === '*'),
  );
  await storage.remove(record, true);
  assert.equal(client.objects.has(asset.objectKey), true);
  assert.equal(client.objects.has(asset.uploadKey), false);
  await storage.remove(record);
  assert.equal(client.objects.size, 0);
});

test('storage signs only generated environment-scoped keys, binds length/type, and hides provider errors', async () => {
  const client = memoryClient();
  let signed;
  const storage = createCoverStorage(settings, {
    client,
    sign: async (_client, command, options) => {
      signed = { input: command.input, options };
      return 'fixture-url';
    },
  });
  await storage.uploadUrl({ ...asset, sizeBytes: 123 });
  assert.equal(signed.input.Key, asset.uploadKey);
  assert.equal(signed.input.ContentLength, 123);
  assert.equal(signed.input.ContentType, 'image/jpeg');
  assert.equal(signed.options.expiresIn, 300);
  assert.deepEqual([...signed.options.signableHeaders].sort(), [
    'content-length',
    'content-type',
  ]);
  await storage.readUrl(asset);
  assert.equal(signed.input.Key, asset.displayKey);
  assert.equal(signed.input.ResponseCacheControl, 'private, no-store');
  for (const patch of [
    { objectKey: 'prod/covers/other/original' },
    { bucket: 'another-bucket' },
    { uploadKey: 'dev/secrets' },
  ]) {
    assert.equal(assetInScope({ ...asset, ...patch }, settings), false);
    await assert.rejects(storage.remove({ ...asset, ...patch }), {
      code: 'MEDIA_NOT_FOUND',
    });
  }
  const calls = client.calls.length;
  await assert.rejects(
    storage.finish({ ...asset, sizeBytes: jpeg.length }),
    (error) =>
      error.code === 'MEDIA_UNAVAILABLE' &&
      !error.message.includes('private-storage-detail'),
  );
  assert.equal(client.calls.length, calls + 1);
  const production = createCoverStorage(
    { ...settings, nodeEnv: 'production' },
    { client },
  );
  await assert.rejects(production.uploadUrl(asset), {
    code: 'MEDIA_NOT_FOUND',
  });
});

test('framing keeps image edges covered, clamps dragging and uses the same display geometry', () => {
  const portrait = { width: 1200, height: 1800 },
    box = { width: 600, height: 300 };
  const position = draggedFrame(defaultFrame, box, portrait, 1000, -2000);
  assert.equal(position.x, 0.5, 'No horizontal overflow at base zoom');
  assert.equal(position.y, 1);
  const zoomed = draggedFrame(
    { x: 0.5, y: 0.5, zoom: 2 },
    box,
    portrait,
    10000,
    10000,
  );
  assert.equal(zoomed.x, 0);
  assert.equal(zoomed.y, 0);
  assert.deepEqual(frameStyle({ x: 0.25, y: 0.75, zoom: 1.5 }), {
    objectPosition: '25% 75%',
    transformOrigin: '25% 75%',
    transform: 'scale(1.5)',
  });
});

test('midnight creation retries retain identical cover identity/framing but reject a changed photo or position', () => {
  const values = {
    name: 'Our wedding',
    brideName: 'Bride',
    groomName: 'Groom',
    mainDate: '2026-10-23',
    city: 'Puri',
    state: 'Odisha',
    tradition: 'ODIA',
    budget: '',
    coverMediaId: id,
    coverFrame: defaultFrame,
  };
  const before = () => new Date('2026-10-23T15:00:00Z'),
    after = () => new Date('2026-10-24T01:00:00Z');
  const input = weddingInput(values, null, before),
    previous = { key: 'previous-request-key', body: JSON.stringify(input) };
  assert.equal(
    setupSchemaForSubmission(previous, after).safeParse(values).success,
    true,
  );
  assert.deepEqual(weddingInput(values, previous, after), input);
  assert.equal(
    setupSchemaForSubmission(previous, after).safeParse({
      ...values,
      coverFrame: { ...defaultFrame, zoom: 2 },
    }).success,
    false,
  );
  assert.equal(
    setupSchemaForSubmission(previous, after).safeParse({
      ...values,
      coverMediaId: 'a'.repeat(24),
    }).success,
    false,
  );
});

test('direct browser upload sends no app credentials, reports progress and supports failure/abort safely', async () => {
  let xhr;
  const factory = () =>
    (xhr = {
      upload: {},
      open(method, url) {
        this.method = method;
        this.url = url;
      },
      setRequestHeader(name, value) {
        this.header = [name, value];
      },
      send(file) {
        this.file = file;
      },
      abort() {
        this.onabort();
      },
    });
  const file = { type: 'image/jpeg', size: 100 };
  let progress;
  const pending = uploadFile(
    'https://fixture.r2.cloudflarestorage.com/object?signed=test',
    file,
    {
      xhrFactory: factory,
      onProgress: (value) => {
        progress = value;
      },
    },
  );
  assert.equal(xhr.withCredentials, false);
  assert.equal(xhr.method, 'PUT');
  assert.deepEqual(xhr.header, ['Content-Type', 'image/jpeg']);
  assert.equal(xhr.timeout, 180000);
  xhr.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
  assert.equal(progress, 50);
  xhr.status = 200;
  xhr.onload();
  await pending;
  const controller = new AbortController();
  const aborted = uploadFile(
    'https://fixture.r2.cloudflarestorage.com/object',
    file,
    { xhrFactory: factory, signal: controller.signal },
  );
  controller.abort();
  await assert.rejects(aborted, { code: 'ABORTED' });
  const failed = uploadFile(
    'https://fixture.r2.cloudflarestorage.com/object',
    file,
    { xhrFactory: factory },
  );
  xhr.status = 403;
  xhr.onload();
  await assert.rejects(failed, { code: 'UPLOAD_FAILED' });
  await assert.rejects(
    uploadFile('https://untrusted.example/upload', file, {
      xhrFactory: () => {
        throw new Error('must not send');
      },
    }),
    { code: 'INVALID_UPLOAD_URL' },
  );
});

test('media JSON routes enforce exact Origin, JSON, verified session and CSRF before issuing signed URLs', async () => {
  const options = { ...settings, jwtSecret: 'media-fixture-secret-'.repeat(4) };
  let calls = 0;
  const service = {
    async session({ accessToken }) {
      if (accessToken !== 'fixture-access')
        throw new ApiError(401, 'SESSION_EXPIRED', 'Sign in.');
      return { user: { id, emailVerified: true } };
    },
  };
  const media = {
    async upload(userId, weddingId, input) {
      calls++;
      assert.equal(userId, id);
      assert.equal(weddingId, null);
      assert.equal(input.sizeBytes, 123);
      return { mediaId: id, uploadUrl: 'fixture-url' };
    },
  };
  const app = createApp({ service, media, settings: options });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    const csrf = await fetch(base + '/auth/csrf');
    const token = (await csrf.json()).data.csrfToken;
    const cookie =
      csrf.headers
        .getSetCookie()
        .map((v) => v.split(';')[0])
        .join('; ') + '; mmm_access=fixture-access';
    const headers = {
      Origin: options.webOrigin,
      'Content-Type': 'application/json',
      Cookie: cookie,
      'X-CSRF-Token': token,
    };
    const post = (changes) =>
      fetch(base + '/media/wedding-cover/upload-url', {
        method: 'POST',
        headers: { ...headers, ...changes },
        body: JSON.stringify({ mimeType: 'image/jpeg', sizeBytes: 123 }),
      });
    assert.equal(
      (await post({ Origin: 'https://untrusted.example' })).status,
      403,
    );
    assert.equal((await post({ 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post({ Cookie: '' })).status, 401);
    assert.equal((await post({ 'X-CSRF-Token': '' })).status, 403);
    assert.equal(calls, 0);
    const result = await post({});
    assert.equal(result.status, 200);
    assert.match(result.headers.get('cache-control'), /no-store/);
    assert.equal(calls, 1);
    assert.equal(result.headers.getSetCookie().length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
