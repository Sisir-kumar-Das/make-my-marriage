import { Router } from 'express';
import { createAuthCookies } from '../auth/cookies.js';
import { ApiError } from '../lib/api-error.js';
import { rateLimit } from 'express-rate-limit';

export function createMemberRouter({ service, members, settings }) {
  const router = Router({ mergeParams: true });
  const cookies = createAuthCookies(settings);
  function boundary(req, _res, next) {
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
  }
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get('/', async (req, res) => {
    if (req.get('origin') && req.get('origin') !== settings.webOrigin)
      throw new ApiError(
        403,
        'ORIGIN_NOT_ALLOWED',
        'This request is not allowed.',
      );
    const identity = await service.session(cookies.input(req));
    const data = await members.list(
      identity.user.id,
      req.params.weddingId,
      req.query,
    );
    res.json({ success: true, data });
  });
  router.get('/:memberId/management', boundary, async (req, res) => {
    const identity = await service.session(cookies.input(req));
    const data = await members.read(
      identity.user.id,
      req.params.weddingId,
      req.params.memberId,
      req.query,
    );
    res.json({ success: true, data });
  });
  router.get('/:memberId/removal', boundary, async (req, res) => {
    const identity = await service.session(cookies.input(req));
    res.json({
      success: true,
      data: await members.readRemoval(
        identity.user.id,
        req.params.weddingId,
        req.params.memberId,
        req.query,
      ),
    });
  });
  const mutations = rateLimit({
    windowMs: 15 * 60000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(_req, _res, next) {
      next(
        new ApiError(
          429,
          'RATE_LIMITED',
          'Too many member changes. Please wait before trying again.',
        ),
      );
    },
  });
  router.patch(
    '/:memberId',
    boundary,
    cookies.protect,
    mutations,
    async (req, res) => {
      const identity = await service.session(cookies.input(req));
      const data = await members.update(
        identity.user.id,
        req.params.weddingId,
        req.params.memberId,
        req.body,
        req.get('if-match'),
        req.get('idempotency-key'),
      );
      res.json({ success: true, data });
    },
  );
  router.delete(
    '/:memberId',
    boundary,
    cookies.protect,
    mutations,
    async (req, res) => {
      const identity = await service.session(cookies.input(req));
      res.json({
        success: true,
        data: await members.remove(
          identity.user.id,
          req.params.weddingId,
          req.params.memberId,
          req.body,
          req.get('if-match'),
          req.get('idempotency-key'),
        ),
      });
    },
  );
  return router;
}
