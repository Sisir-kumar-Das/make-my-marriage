import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthCookies } from '../auth/cookies.js';
import { ApiError } from '../lib/api-error.js';

export function createWeddingRouter({ service, weddings, settings }) {
  const router = Router();
  const cookies = createAuthCookies(settings);
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (
      (unsafe || req.get('origin')) &&
      req.get('origin') !== settings.webOrigin
    )
      return next(
        new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This request is not allowed.'),
      );
    if (unsafe && !req.is('application/json'))
      return next(
        new ApiError(415, 'JSON_REQUIRED', 'Send this request as JSON.'),
      );
    next();
  });
  router.use(async (req, _res, next) => {
    req.identity = await service.session(cookies.input(req));
    next();
  });
  const createLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    keyGenerator: (req) => req.identity.user.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(
        new ApiError(429, 'RATE_LIMITED', 'Please wait before trying again.'),
      ),
  });
  router.post('/', cookies.protect, createLimit, async (req, res) => {
    const result = await weddings.create(
      req.identity.user.id,
      req.body,
      req.get('idempotency-key'),
    );
    res.setHeader('ETag', '"' + result.wedding.version + '"');
    res.status(201).json({ success: true, data: result });
  });
  router.get('/:weddingId', async (req, res) => {
    const result = await weddings.read(
      req.identity.user.id,
      req.params.weddingId,
    );
    res.setHeader('ETag', '"' + result.wedding.version + '"');
    res.json({
      success: true,
      data: result,
    });
  });
  return router;
}
