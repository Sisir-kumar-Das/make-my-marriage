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
  // Separate per-action budgets: creation/deletion traffic must not consume
  // restoration capacity. Exact retries remain bounded by their action limit.
  const writeLimit = (limit = 20) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit,
      keyGenerator: (req) => req.identity.user.id,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) =>
        next(
          new ApiError(429, 'RATE_LIMITED', 'Please wait before trying again.'),
        ),
    });
  router.post('/', cookies.protect, writeLimit(), async (req, res) => {
    const result = await weddings.create(
      req.identity.user.id,
      req.body,
      req.get('idempotency-key'),
    );
    res.setHeader('ETag', '"' + result.wedding.version + '"');
    res.status(201).json({ success: true, data: result });
  });
  router.get('/:weddingId/overview', async (req, res) => {
    const result = await weddings.overview(
      req.identity.user.id,
      req.params.weddingId,
    );
    res.json({ success: true, data: result });
  });
  router.get('/:weddingId/lifecycle', async (req, res) => {
    const result = await weddings.lifecycle(
      req.identity.user.id,
      req.params.weddingId,
    );
    res.json({ success: true, data: result });
  });
  router.post(
    '/:weddingId/lifecycle/result',
    cookies.protect,
    writeLimit(60),
    async (req, res) => {
      const result = await weddings.lifecycleResult(
        req.identity.user.id,
        req.params.weddingId,
        req.body,
        req.get('if-match'),
        req.get('idempotency-key'),
      );
      res.json({ success: true, data: result });
    },
  );
  for (const [method, suffix, operation] of [
    ['delete', '', 'delete'],
    ['post', '/restore', 'restore'],
  ])
    router[method](
      '/:weddingId' + suffix,
      cookies.protect,
      writeLimit(),
      async (req, res) => {
        const result = await weddings[operation](
          req.identity.user.id,
          req.params.weddingId,
          req.body,
          req.get('if-match'),
          req.get('idempotency-key'),
        );
        res.json({ success: true, data: result });
      },
    );
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
  router.patch('/:weddingId', cookies.protect, async (req, res) => {
    const result = await weddings.update(
      req.identity.user.id,
      req.params.weddingId,
      req.body,
      req.get('if-match'),
      req.get('idempotency-key'),
    );
    res.setHeader('ETag', '"' + result.wedding.version + '"');
    res.json({ success: true, data: result });
  });
  return router;
}
