import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthCookies } from '../auth/cookies.js';
import { ApiError } from '../lib/api-error.js';
function boundary(req, res, next, settings) {
  res.setHeader('Cache-Control', 'no-store');
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if ((unsafe || req.get('origin')) && req.get('origin') !== settings.webOrigin)
    return next(
      new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This request is not allowed.'),
    );
  if (unsafe && !req.is('application/json'))
    return next(
      new ApiError(415, 'JSON_REQUIRED', 'Send this request as JSON.'),
    );
  next();
}
function limiter(keyGenerator) {
  return rateLimit({
    windowMs: 15 * 60000,
    limit: 60,
    ...(keyGenerator ? { keyGenerator } : {}),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(_req, _res, next) {
      next(
        new ApiError(
          429,
          'RATE_LIMITED',
          'Too many invitation attempts. Please wait before trying again.',
        ),
      );
    },
  });
}
export function createInvitationRouter({ service, invitations, settings }) {
  const router = Router({ mergeParams: true }),
    cookies = createAuthCookies(settings);
  router.use((req, res, next) => boundary(req, res, next, settings));
  router.use(async (req, _res, next) => {
    req.identity = await service.session(cookies.input(req));
    next();
  });
  const limit = limiter((req) => req.identity.user.id);
  router.get('/', async (req, res) =>
    res.json({
      success: true,
      data: await invitations.list(
        req.identity.user.id,
        req.params.weddingId,
        req.query,
      ),
    }),
  );
  router.get('/:invitationId/link', limit, async (req, res) =>
    res.json({
      success: true,
      data: await invitations.copyLink(
        req.identity.user.id,
        req.params.weddingId,
        req.params.invitationId,
      ),
    }),
  );
  router.post('/', cookies.protect, limit, async (req, res) =>
    res.status(201).json({
      success: true,
      data: await invitations.create(
        req.identity.user.id,
        req.params.weddingId,
        req.body,
        req.get('idempotency-key'),
      ),
    }),
  );
  for (const [method, path, operation] of [
    ['post', '/:invitationId/resend', 'resend'],
    ['delete', '/:invitationId', 'revoke'],
  ])
    router[method](path, cookies.protect, limit, async (req, res) =>
      res.json({
        success: true,
        data: await invitations[operation](
          req.identity.user.id,
          req.params.weddingId,
          req.params.invitationId,
          req.body,
          req.get('idempotency-key'),
        ),
      }),
    );
  return router;
}
export function createInvitationAcceptanceRouter({
  service,
  invitations,
  settings,
}) {
  const router = Router(),
    cookies = createAuthCookies(settings),
    limit = limiter();
  router.use((req, res, next) => boundary(req, res, next, settings));
  router.post('/preview', limit, async (req, res) =>
    res.json({ success: true, data: await invitations.preview(req.body) }),
  );
  router.post('/accept', limit, cookies.protect, async (req, res) => {
    const identity = await service.session(cookies.input(req));
    res.json({
      success: true,
      data: await invitations.accept(
        identity.user.id,
        req.body,
        req.get('idempotency-key'),
      ),
    });
  });
  return router;
}
