import { Router } from 'express';
import { createAuthCookies } from '../auth/cookies.js';
import { ApiError } from '../lib/api-error.js';

export function createMemberRouter({ service, members, settings }) {
  const router = Router({ mergeParams: true });
  const cookies = createAuthCookies(settings);
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
  return router;
}
