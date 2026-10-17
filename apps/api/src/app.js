import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { requestContext } from './middleware/request-context.js';
import { errorHandler, notFound } from './middleware/error-handler.js';

export const app = express();

app.disable('x-powered-by');
app.use(requestContext);
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) =>
      callback(null, !origin || origin === config.webOrigin),
    credentials: true,
    exposedHeaders: ['x-request-id'],
  }),
);
app.use(express.json({ limit: '100kb' }));
// just a comment for commit checkp

app.get('/api/v1/health', (_req, res) => {
  res.setHeader('cache-control', 'no-store');
  res.json({
    success: true,
    data: { status: 'ok', service: 'make-my-marriage-api' },
  });
});

app.use(notFound);
app.use(errorHandler);
