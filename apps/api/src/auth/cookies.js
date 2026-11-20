import { doubleCsrf } from 'csrf-csrf';
import { createHmac } from 'node:crypto';
import { ApiError } from '../lib/api-error.js';
import { generateToken } from './tokens.js';
import { requireSessionConfiguration } from './session-service.js';

export function createAuthCookies(settings) {
  const names = {
    access: settings.cookieSecure ? '__Host-mmm_access' : 'mmm_access',
    refresh: settings.cookieSecure ? '__Secure-mmm_refresh' : 'mmm_refresh',
    csrf: settings.cookieSecure ? '__Host-mmm_csrf' : 'mmm_csrf',
    context: settings.cookieSecure
      ? '__Host-mmm_csrf_context'
      : 'mmm_csrf_context',
  };
  const base = {
    httpOnly: true,
    secure: settings.cookieSecure,
    sameSite: settings.cookieSameSite,
    path: '/',
  };
  const csrf = doubleCsrf({
    getSecret: () =>
      createHmac('sha256', settings.jwtSecret)
        .update('make-my-marriage-csrf')
        .digest('hex'),
    getSessionIdentifier: (req) => req.cookies[names.context] || '',
    cookieName: names.csrf,
    cookieOptions: { ...base, maxAge: settings.sessionTtlDays * 86400000 },
    getCsrfTokenFromRequest: (req) => req.get('x-csrf-token'),
  });
  function issueCsrf(req, res, rotate = false) {
    requireSessionConfiguration(settings);
    const present = /^[A-Za-z0-9_-]{43}$/.test(
      req.cookies[names.context] || '',
    );
    if (!present || rotate) {
      const context = generateToken();
      req.cookies[names.context] = context;
      res.cookie(names.context, context, {
        ...base,
        maxAge: settings.sessionTtlDays * 86400000,
      });
    }
    return csrf.generateCsrfToken(req, res, { overwrite: rotate || !present });
  }
  function protect(req, res, next) {
    try {
      requireSessionConfiguration(settings);
    } catch (error) {
      return next(error);
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(req.cookies[names.context] || '')) {
      return next(
        new ApiError(403, 'CSRF_INVALID', 'Please retry this request.'),
      );
    }
    csrf.doubleCsrfProtection(req, res, (error) => {
      next(
        error
          ? new ApiError(403, 'CSRF_INVALID', 'Please retry this request.')
          : undefined,
      );
    });
  }
  function write(res, issued) {
    res.cookie(names.access, issued.accessToken, {
      ...base,
      expires: issued.accessExpiresAt,
    });
    res.cookie(names.refresh, issued.refreshToken, {
      ...base,
      path: '/api/v1/auth',
      expires: issued.expiresAt,
    });
  }
  function clear(res) {
    res.clearCookie(names.access, base);
    res.clearCookie(names.refresh, { ...base, path: '/api/v1/auth' });
    res.clearCookie(names.csrf, base);
    res.clearCookie(names.context, base);
  }
  const input = (req) => ({
    accessToken: req.cookies[names.access],
    refreshToken: req.cookies[names.refresh],
  });
  return { names, issueCsrf, protect, write, clear, input };
}
