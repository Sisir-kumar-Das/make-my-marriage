import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../lib/api-error.js';
import { createAuthCookies } from '../auth/cookies.js';

export function createEventRouter({ service, events, settings }) {
  const router = Router({ mergeParams: true });
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
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.identity.user.id,
    handler(req, res, next) {
      const seconds = Math.max(
        1,
        Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000),
      );
      res.setHeader('Retry-After', seconds);
      next(
        new ApiError(429, 'RATE_LIMITED', 'Please wait before trying again.', {
          retryAfterSeconds: seconds,
        }),
      );
    },
  });
  router.get('/', async (req, res) => {
    const result = await events.list(
      req.identity.user.id,
      req.params.weddingId,
      req.query,
    );
    res.json({
      success: true,
      data: { events: result.events },
      meta: result.meta,
    });
  });
  router.get('/:eventId', async (req, res) => {
    const result = await events.read(
      req.identity.user.id,
      req.params.weddingId,
      req.params.eventId,
    );
    res.setHeader('ETag', `"${result.event.version}"`);
    res.json({ success: true, data: result });
  });
  router.post('/', cookies.protect, limit, async (req, res) => {
    const result = await events.create(
      req.identity.user.id,
      req.params.weddingId,
      req.body,
      req.get('idempotency-key'),
    );
    res.setHeader('ETag', `"${result.event.version}"`);
    res.status(201).json({ success: true, data: result });
  });
  router.patch('/:eventId', cookies.protect, limit, async (req, res) => {
    const result = await events.update(
      req.identity.user.id,
      req.params.weddingId,
      req.params.eventId,
      req.body,
      req.get('idempotency-key'),
      req.get('if-match'),
    );
    res.setHeader('ETag', `"${result.event.version}"`);
    res.json({ success: true, data: result });
  });
  return router;
}
