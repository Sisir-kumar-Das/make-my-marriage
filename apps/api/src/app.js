import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { requestContext } from './middleware/request-context.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { createAuthRouter } from './auth/router.js';
import { createProductionAuthService } from './auth/service.js';

export const authService = createProductionAuthService(config);

export function createApp({ service = authService, settings = config } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !origin || origin === settings.webOrigin),
      credentials: true,
      exposedHeaders: ['x-request-id', 'Retry-After'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  // just a comment for commit checkp

  app.get('/api/v1/health', (_req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.json({
      success: true,
      data: { status: 'ok', service: 'make-my-marriage-api' },
    });
  });

  app.use('/api/v1/auth', createAuthRouter({ service, settings }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
