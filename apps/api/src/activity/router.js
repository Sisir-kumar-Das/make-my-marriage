import { Router } from 'express';
import { createAuthCookies } from '../auth/cookies.js';
import { ApiError } from '../lib/api-error.js';

export function createActivityRouter({ service, listActivity, settings }) {
  const router = Router({ mergeParams: true });
  const cookies = createAuthCookies(settings);
  router.get('/', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.get('origin') && req.get('origin') !== settings.webOrigin)
      throw new ApiError(
        403,
        'ORIGIN_NOT_ALLOWED',
        'This request is not allowed.',
      );
    const { user } = await service.session(cookies.input(req));
    const data = await listActivity(user.id, req.params.weddingId, req.query);
    res.json({ success: true, data });
  });
  return router;
}
