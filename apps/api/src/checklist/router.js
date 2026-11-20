import { Router } from 'express';
import { createAuthCookies } from '../auth/cookies.js';
import { ApiError } from '../lib/api-error.js';
import { readChecklistCatalog } from './catalog.js';

export function createChecklistRouter({ service, settings }) {
  const router = Router();
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
    await service.session(cookies.input(req));
    if (Object.keys(req.query).length)
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'This catalog does not accept filters.',
      );
    res.json({ success: true, data: readChecklistCatalog() });
  });
  return router;
}
