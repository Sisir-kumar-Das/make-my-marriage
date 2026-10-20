import { Router } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { ApiError } from '../lib/api-error.js';
import { registerSchema, resendSchema, verifySchema } from './validation.js';

export function createAuthRouter({ service, settings }) {
  const router = Router();
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.get('origin') !== settings.webOrigin) {
      return next(
        new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This request is not allowed.'),
      );
    }
    if (!req.is('application/json')) {
      return next(
        new ApiError(415, 'JSON_REQUIRED', 'Send this request as JSON.'),
      );
    }
    next();
  });

  const options = {
    windowMs: 15 * 60 * 1000,
    limit: settings.authRateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(req, res, next) {
      const seconds = Math.max(
        1,
        Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000),
      );
      res.setHeader('Retry-After', seconds);
      next(
        new ApiError(
          429,
          'RATE_LIMITED',
          'Too many attempts. Please wait before trying again.',
          { retryAfterSeconds: seconds },
        ),
      );
    },
  };
  router.use(rateLimit(options));
  const emailLimit = rateLimit({
    ...options,
    keyGenerator(req) {
      if (typeof req.body?.email !== 'string') return ipKeyGenerator(req.ip);
      return createHash('sha256')
        .update(req.body.email.trim().toLowerCase())
        .digest('hex');
    },
  });

  const validate = (schema) => (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(
        new ApiError(
          400,
          'VALIDATION_ERROR',
          'Please check the form and try again.',
          {
            fields: Object.fromEntries(
              result.error.issues.map((issue) => [
                issue.path[0] || 'form',
                issue.message,
              ]),
            ),
          },
        ),
      );
    }
    req.authInput = result.data;
    next();
  };

  const accepted = (res) =>
    res.status(202).json({
      success: true,
      data: {
        message:
          'If this address needs verification, check your inbox for a link or request another email.',
        retryAfterSeconds: settings.verificationCooldownSeconds,
        verificationTtlHours: settings.verificationTtlHours,
      },
    });

  router.post(
    '/register',
    emailLimit,
    validate(registerSchema),
    async (req, res) => {
      await service.register(req.authInput);
      accepted(res);
    },
  );
  router.post(
    '/resend-verification',
    emailLimit,
    validate(resendSchema),
    async (req, res) => {
      await service.resend(req.authInput);
      accepted(res);
    },
  );
  router.post('/verify-email', validate(verifySchema), async (req, res) => {
    await service.verify(req.authInput);
    res.json({ success: true, data: { emailVerified: true } });
  });
  return router;
}
