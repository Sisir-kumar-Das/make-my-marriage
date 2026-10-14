const port = Number(process.env.PORT ?? 4000);
const nodeEnv = process.env.NODE_ENV ?? 'development';
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
if (!['development', 'test', 'production'].includes(nodeEnv)) {
  throw new Error('NODE_ENV must be development, test or production.');
}
const originUrl = new URL(webOrigin);
if (
  !['http:', 'https:'].includes(originUrl.protocol) ||
  originUrl.origin !== webOrigin
) {
  throw new Error(
    'WEB_ORIGIN must be an HTTP(S) origin without a path or trailing slash.',
  );
}

export const config = { port, nodeEnv, webOrigin };
