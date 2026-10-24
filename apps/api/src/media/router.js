import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthCookies } from '../auth/cookies.js';
import { ApiError } from '../lib/api-error.js';

export function createMediaRouter({ service, weddings, media, settings }) {
  const router = Router();
  const cookies = createAuthCookies(settings);
  // Apply these checks only to this feature's explicit routes.
  const guard = [
    (req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if (
        (unsafe || req.get('origin')) &&
        req.get('origin') !== settings.webOrigin
      )
        return next(
          new ApiError(
            403,
            'ORIGIN_NOT_ALLOWED',
            'This request is not allowed.',
          ),
        );
      if (unsafe && !req.is('application/json'))
        return next(
          new ApiError(415, 'JSON_REQUIRED', 'Send this request as JSON.'),
        );
      next();
    },
    async (req, _res, next) => {
      req.identity = await service.session(cookies.input(req));
      next();
    },
  ];
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    keyGenerator: (req) => req.identity.user.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(
        new ApiError(
          429,
          'RATE_LIMITED',
          'Please wait before trying more uploads.',
        ),
      ),
  });
  const write = [...guard, cookies.protect, limit];
  const result = (res, data) => res.json({ success: true, data });
  router.post('/media/wedding-cover/upload-url', ...write, async (req, res) =>
    result(res, await media.upload(req.identity.user.id, null, req.body)),
  );
  router.post(
    '/media/wedding-cover/:mediaId/complete',
    ...write,
    async (req, res) =>
      result(
        res,
        await media.complete(req.identity.user.id, null, req.params.mediaId),
      ),
  );
  router.post(
    '/weddings/:weddingId/media/upload-url',
    ...write,
    async (req, res) =>
      result(
        res,
        await media.upload(
          req.identity.user.id,
          req.params.weddingId,
          req.body,
        ),
      ),
  );
  router.post(
    '/weddings/:weddingId/media/:mediaId/complete',
    ...write,
    async (req, res) =>
      result(
        res,
        await media.complete(
          req.identity.user.id,
          req.params.weddingId,
          req.params.mediaId,
        ),
      ),
  );
  router.get(
    '/weddings/:weddingId/media/:mediaId',
    ...guard,
    async (req, res) =>
      result(
        res,
        await media.read(
          req.identity.user.id,
          req.params.weddingId,
          req.params.mediaId,
        ),
      ),
  );
  async function save(req, res) {
    const data = await weddings.setCover(
      req.identity.user.id,
      req.params.weddingId,
      req.method === 'DELETE' ? { ...req.body, mediaId: null } : req.body,
    );
    res.setHeader('ETag', '"' + data.wedding.version + '"');
    result(res, data);
  }
  router.put('/weddings/:weddingId/cover-image', ...write, save);
  router.delete('/weddings/:weddingId/cover-image', ...write, save);
  return router;
}
