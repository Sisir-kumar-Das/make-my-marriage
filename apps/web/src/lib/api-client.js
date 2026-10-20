const baseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1'
).replace(/\/$/, '');

function apiError(message, code, requestId) {
  return Object.assign(new Error(message), { code, requestId });
}

export async function apiRequest(path, options = {}) {
  const { timeoutMs = 5000, ...requestOptions } = options;
  const controller = new AbortController();
  let timedOut = false;
  let requestId;
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timeout = setTimeout(
    () => {
      if (controller.signal.aborted) return;
      timedOut = true;
      controller.abort();
    },
    Math.max(1000, Math.min(timeoutMs, 30000)),
  );

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...requestOptions,
      headers: { Accept: 'application/json', ...options.headers },
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    requestId = response.headers.get('x-request-id');
    const payload = await response.json().catch((error) => {
      if (controller.signal.aborted || error.name === 'AbortError') throw error;
      throw apiError(
        'The API returned an invalid response.',
        'INVALID_RESPONSE',
        requestId,
      );
    });
    if (!response.ok || payload?.success !== true) {
      throw Object.assign(
        apiError(
          payload?.error?.message || 'The API request failed.',
          payload?.error?.code || 'API_ERROR',
          payload?.requestId || requestId,
        ),
        {
          details: payload?.error?.details,
          retryAfterSeconds:
            Number(response.headers.get('Retry-After')) || undefined,
        },
      );
    }
    return { ...payload, requestId };
  } catch (error) {
    if (controller.signal.aborted || error.name === 'AbortError') {
      const failure = apiError(
        timedOut
          ? 'The API request timed out. Please retry.'
          : 'The API request was cancelled.',
        timedOut ? 'TIMEOUT' : 'ABORTED',
        requestId,
      );
      if (!timedOut) failure.name = 'AbortError';
      throw failure;
    }
    if (typeof error.code === 'string') throw error;
    throw apiError(
      'Could not reach the API. Start it and try again.',
      'NETWORK_ERROR',
      requestId,
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
