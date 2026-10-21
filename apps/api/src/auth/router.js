import { Router } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { ApiError } from '../lib/api-error.js';
import {
  registerSchema,
  resendSchema,
  verifySchema,
  loginSchema,
} from './validation.js';
import { createAuthCookies } from './cookies.js';

export function createAuthRouter({ service, settings }) {
  const router = Router();
  const cookies = createAuthCookies(settings);
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (
      (unsafe || req.get('origin')) &&
      req.get('origin') !== settings.webOrigin
    ) {
      return next(
        new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This request is not allowed.'),
      );
    }
    if (unsafe && !req.is('application/json')) {
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
  const publicLimit = rateLimit(options);
  const refreshLimit = rateLimit({
    ...options,
    limit: settings.authRateLimitMax * 6,
  });
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
    publicLimit,
    emailLimit,
    validate(registerSchema),
    async (req, res) => {
      await service.register(req.authInput);
      accepted(res);
    },
  );
  router.post(
    '/resend-verification',
    publicLimit,
    emailLimit,
    validate(resendSchema),
    async (req, res) => {
      await service.resend(req.authInput);
      accepted(res);
    },
  );
  router.post(
    '/verify-email',
    publicLimit,
    validate(verifySchema),
    async (req, res) => {
      await service.verify(req.authInput);
      res.json({ success: true, data: { emailVerified: true } });
    },
  );
  router.get('/csrf', (req, res) => {
    res.json({
      success: true,
      data: { csrfToken: cookies.issueCsrf(req, res) },
    });
  });
  router.post(
    '/login',
    publicLimit,
    emailLimit,
    validate(loginSchema),
    cookies.protect,
    async (req, res) => {
      const issued = await service.login({
        ...req.authInput,
        userAgent: req.get('user-agent') || '',
      });
      cookies.write(res, issued);
      res.json({
        success: true,
        data: { ...issued.data, csrfToken: cookies.issueCsrf(req, res, true) },
      });
    },
  );
  router.get('/session', async (req, res) => {
    res.json({
      success: true,
      data: await service.session(cookies.input(req)),
    });
  });
  router.post('/refresh', refreshLimit, cookies.protect, async (req, res) => {
    try {
      const issued = await service.refresh(cookies.input(req));
      cookies.write(res, issued);
      res.json({ success: true, data: issued.data });
    } catch (error) {
      if (error.status === 401) cookies.clear(res);
      throw error;
    }
  });
  router.post('/logout', cookies.protect, async (req, res) => {
    await service.logout(cookies.input(req));
    cookies.clear(res);
    res.json({ success: true, data: { loggedOut: true } });
  });
  return router;
}
