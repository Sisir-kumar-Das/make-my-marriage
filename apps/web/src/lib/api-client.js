const baseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1'
).replace(/\/$/, '');

function apiError(message, code, requestId) {
  return Object.assign(new Error(message), { code, requestId });
}

export async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 5000);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { Accept: 'application/json', ...options.headers },
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    const requestId = response.headers.get('x-request-id');
    const payload = await response.json().catch(() => {
      throw apiError(
        'The API returned an invalid response.',
        'INVALID_RESPONSE',
        requestId,
      );
    });
    if (!response.ok || payload?.success !== true) {
      throw apiError(
        payload?.error?.message || 'The API request failed.',
        payload?.error?.code || 'API_ERROR',
        payload?.requestId || requestId,
      );
    }
    return { ...payload, requestId };
  } catch (error) {
    if (options.signal?.aborted || typeof error.code === 'string') throw error;
    throw apiError(
      timedOut
        ? 'The API request timed out. Please retry.'
        : 'Could not reach the API. Start it and try again.',
      timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
