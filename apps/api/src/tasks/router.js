import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../lib/api-error.js';
import { createAuthCookies } from '../auth/cookies.js';

export function createTaskRouter({ service, tasks, settings }) {
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
    const result = await tasks.list(
      req.identity.user.id,
      req.params.weddingId,
      req.query,
    );
    res.json({
      success: true,
      data: { tasks: result.tasks },
      meta: result.meta,
    });
  });
  router.get('/my', async (req, res) => {
    const result = await tasks.my(
      req.identity.user.id,
      req.params.weddingId,
      req.query,
    );
    res.json({
      success: true,
      data: { tasks: result.tasks },
      meta: result.meta,
    });
  });
  router.get('/assignees', async (req, res) => {
    const result = await tasks.assignees(
      req.identity.user.id,
      req.params.weddingId,
      req.query,
    );
    res.json({
      success: true,
      data: { members: result.members },
      meta: result.meta,
    });
  });
  router.get('/deleted', async (req, res) => {
    const result = await tasks.listDeleted(
      req.identity.user.id,
      req.params.weddingId,
      req.query,
    );
    res.json({
      success: true,
      data: { tasks: result.tasks },
      meta: result.meta,
    });
  });
  router.get('/:taskId/recovery', async (req, res) => {
    const result = await tasks.readDeleted(
      req.identity.user.id,
      req.params.weddingId,
      req.params.taskId,
    );
    res.setHeader('ETag', `"${result.task.version}"`);
    res.json({ success: true, data: result });
  });
  for (const [method, suffix, action] of [
    ['delete', '', 'remove'],
    ['post', '/restore', 'restore'],
  ]) {
    router[method](
      '/:taskId' + suffix,
      cookies.protect,
      limit,
      async (req, res) => {
        const result = await tasks[action](
          req.identity.user.id,
          req.params.weddingId,
          req.params.taskId,
          req.body,
          req.get('idempotency-key'),
          req.get('if-match'),
        );
        res.setHeader('ETag', `"${result.task.version}"`);
        res.json({ success: true, data: result });
      },
    );
  }
  router.get('/:taskId/series', async (req, res) => {
    const result = await tasks.readSeries(
      req.identity.user.id,
      req.params.weddingId,
      req.params.taskId,
    );
    res.setHeader('ETag', `"${result.series.version}"`);
    res.json({ success: true, data: result });
  });
  router.patch('/:taskId/series', cookies.protect, limit, async (req, res) => {
    const result = await tasks.updateSeries(
      req.identity.user.id,
      req.params.weddingId,
      req.params.taskId,
      req.body,
      req.get('idempotency-key'),
      req.get('if-match'),
    );
    res.setHeader('ETag', `"${result.series.version}"`);
    res.json({ success: true, data: result });
  });
  router.get('/:taskId', async (req, res) => {
    const result = await tasks.read(
      req.identity.user.id,
      req.params.weddingId,
      req.params.taskId,
    );
    res.setHeader('ETag', `"${result.task.version}"`);
    res.json({ success: true, data: result });
  });
  router.post('/', cookies.protect, limit, async (req, res) => {
    const result = await tasks.create(
      req.identity.user.id,
      req.params.weddingId,
      req.body,
      req.get('idempotency-key'),
    );
    res.setHeader('ETag', `"${result.task.version}"`);
    res.status(201).json({ success: true, data: result });
  });
  router.patch('/:taskId', cookies.protect, limit, async (req, res) => {
    const result = await tasks.update(
      req.identity.user.id,
      req.params.weddingId,
      req.params.taskId,
      req.body,
      req.get('idempotency-key'),
      req.get('if-match'),
    );
    res.setHeader('ETag', `"${result.task.version}"`);
    res.json({ success: true, data: result });
  });
  return router;
}
