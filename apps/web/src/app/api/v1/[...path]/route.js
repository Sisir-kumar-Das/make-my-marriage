// Transport only: Express owns authentication, validation, authorization and data.
const apiBase = (
  process.env.API_BASE_URL || 'http://127.0.0.1:4000/api/v1'
).replace(/\/$/, '');
const failure = (status, code, message) =>
  Response.json(
    { success: false, error: { code, message } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );

async function relay(request, { params }) {
  const { path } = await params;
  if (
    path.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        /[/\\]/.test(part) ||
        [...part].some((character) => character.charCodeAt(0) < 32),
    )
  )
    return failure(400, 'INVALID_PATH', 'Invalid API path.');
  const url = new URL(`${apiBase}/${path.map(encodeURIComponent).join('/')}`);
  url.search = new URL(request.url).search;
  const headers = new Headers();
  for (const name of [
    'accept',
    'content-type',
    'cookie',
    'origin',
    'x-csrf-token',
    'user-agent',
    'idempotency-key',
    'if-match',
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let body;
  if (!['GET', 'HEAD'].includes(request.method) && request.body) {
    const reader = request.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 100 * 1024) {
        await reader.cancel();
        return failure(
          413,
          'PAYLOAD_TOO_LARGE',
          'The request body is too large.',
        );
      }
      chunks.push(chunk.value);
    }
    body = Buffer.concat(chunks);
  }
  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(
        path.includes('media') && path.at(-1) === 'complete' ? 30000 : 20000,
      ),
    });
    const outgoing = new Headers();
    for (const name of [
      'content-type',
      'x-request-id',
      'retry-after',
      'ratelimit',
      'ratelimit-policy',
      'etag',
    ]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    outgoing.set('Cache-Control', 'no-store');
    for (const value of response.headers.getSetCookie())
      outgoing.append('Set-Cookie', value);
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return failure(
      503,
      'API_UNAVAILABLE',
      'Could not reach the API. Start it and try again.',
    );
  }
}
export {
  relay as GET,
  relay as POST,
  relay as PUT,
  relay as PATCH,
  relay as DELETE,
  relay as OPTIONS,
  relay as HEAD,
};
