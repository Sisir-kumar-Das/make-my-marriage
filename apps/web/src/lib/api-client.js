const baseUrl =
  typeof window === 'undefined'
    ? (process.env.API_BASE_URL || 'http://127.0.0.1:4000/api/v1').replace(
        /\/$/,
        '',
      )
    : '/api/v1';

function apiError(message, code, requestId) {
  return Object.assign(new Error(message), { code, requestId });
}

async function request(path, options = {}) {
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

let csrfToken;
let csrfRequest;
let refreshRequest;
const publicPaths = new Set([
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/register',
  '/auth/verify-email',
  '/auth/resend-verification',
  '/auth/login',
  '/auth/csrf',
]);
const publicMutations = new Set([
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/register',
  '/auth/verify-email',
  '/auth/resend-verification',
]);

async function getCsrf() {
  if (csrfToken) return csrfToken;
  csrfRequest ??= request('/auth/csrf')
    .then((result) => {
      csrfToken = result.data.csrfToken;
      return csrfToken;
    })
    .finally(() => {
      csrfRequest = undefined;
    });
  return csrfRequest;
}

async function browserRequest(path, options) {
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(
    (options.method || 'GET').toUpperCase(),
  );
  const protect = unsafe && !publicMutations.has(path);
  async function send() {
    return request(path, {
      ...options,
      headers: {
        ...options.headers,
        ...(protect ? { 'X-CSRF-Token': await getCsrf() } : {}),
      },
    });
  }
  try {
    return await send();
  } catch (error) {
    if (!protect || error.code !== 'CSRF_INVALID') throw error;
    csrfToken = undefined;
    return send();
  }
}

async function renewSession() {
  refreshRequest ??= (async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await browserRequest('/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
      } catch (error) {
        if (error.code !== 'REFRESH_IN_PROGRESS') {
          if (error.code === 'SESSION_EXPIRED') csrfToken = undefined;
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 150 * (attempt + 1)),
        );
        try {
          return await request('/auth/session');
        } catch (failure) {
          if (failure.code !== 'SESSION_EXPIRED') throw failure;
        }
      }
    }
    throw apiError(
      'Your session is being renewed. Please retry.',
      'REFRESH_IN_PROGRESS',
    );
  })().finally(() => {
    refreshRequest = undefined;
  });
  return refreshRequest;
}

export async function apiRequest(path, options = {}) {
  const { authRetry = true, ...requestOptions } = options;
  if (typeof window === 'undefined') return request(path, requestOptions);
  try {
    let result;
    try {
      result = await browserRequest(path, requestOptions);
    } catch (error) {
      if (
        !authRetry ||
        publicPaths.has(path) ||
        ['/auth/refresh', '/auth/logout'].includes(path) ||
        error.code !== 'SESSION_EXPIRED'
      )
        throw error;
      await renewSession();
      result = await browserRequest(path, requestOptions);
    }
    if (result.data?.csrfToken) csrfToken = result.data.csrfToken;
    if (['/auth/logout', '/auth/reset-password'].includes(path))
      csrfToken = undefined;
    return result;
  } catch (error) {
    if (!publicPaths.has(path) && error.code === 'SESSION_EXPIRED')
      window.dispatchEvent(new Event('mmm:session-expired'));
    throw error;
  }
}
