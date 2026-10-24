import { apiRequest, uploadFile } from '../../lib/api-client.js';

// Keep the receipt in memory so a lost confirmation response does not resend bytes.
export async function performCoverUpload({
  receipt,
  file,
  base,
  signal,
  onProgress,
  request = apiRequest,
  send = uploadFile,
  now = Date.now,
}) {
  if (receipt.current?.ready) return receipt.current.mediaId;
  const progress = (value) => {
    if (!signal?.aborted) onProgress?.(value);
  };
  try {
    if (
      !receipt.current ||
      (!receipt.current.uploaded &&
        Date.parse(receipt.current.expiresAt) <= now())
    ) {
      progress({ phase: 'Preparing secure upload', percent: 0 });
      const response = await request(base + '/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
        signal,
        timeoutMs: 20000,
      });
      receipt.current = response.data;
    }
    if (!receipt.current.uploaded) {
      progress({ phase: 'Uploading photo', percent: 0 });
      await send(receipt.current.uploadUrl, file, {
        signal,
        onProgress: (percent) =>
          progress({ phase: 'Uploading photo', percent }),
      });
      receipt.current.uploaded = true;
    }
    progress({ phase: 'Checking your photo', percent: 100 });
    await request(`${base}/${receipt.current.mediaId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal,
      timeoutMs: 30000,
    });
    receipt.current.ready = true;
    progress({ phase: 'Photo ready', percent: 100 });
    return receipt.current.mediaId;
  } catch (failure) {
    if (
      ['INVALID_COVER', 'UPLOAD_EXPIRED', 'MEDIA_NOT_FOUND'].includes(
        failure.code,
      )
    )
      receipt.current = null;
    progress(null);
    throw failure;
  }
}
