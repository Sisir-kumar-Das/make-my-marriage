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

function positiveInteger(name, fallback, maximum) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}

export const config = {
  port,
  nodeEnv,
  webOrigin,
  mongodbUri: process.env.MONGODB_URI?.trim() || '',
  mongodbDbName: process.env.MONGODB_DB_NAME?.trim() || 'make_my_marriage_dev',
  resendApiKey: process.env.RESEND_API_KEY?.trim() || '',
  emailFrom: process.env.EMAIL_FROM?.trim() || '',
  verificationTtlHours: positiveInteger('AUTH_VERIFICATION_TTL_HOURS', 24, 168),
  verificationCooldownSeconds: positiveInteger(
    'AUTH_VERIFICATION_COOLDOWN_SECONDS',
    45,
    3600,
  ),
  authRateLimitMax: positiveInteger('AUTH_RATE_LIMIT_MAX', 10, 1000),
  jwtSecret: process.env.AUTH_JWT_SECRET?.trim() || '',
  accessTtlMinutes: positiveInteger('AUTH_ACCESS_TTL_MINUTES', 15, 30),
  sessionTtlDays: positiveInteger('AUTH_SESSION_TTL_DAYS', 30, 90),
  cookieSecure: nodeEnv === 'production',
  cookieSameSite: process.env.AUTH_COOKIE_SAME_SITE || 'lax',
};

if (
  !['lax', 'strict', 'none'].includes(config.cookieSameSite) ||
  (config.cookieSameSite === 'none' && !config.cookieSecure)
) {
  throw new Error(
    'AUTH_COOKIE_SAME_SITE must be lax/strict, or none with production HTTPS.',
  );
}
