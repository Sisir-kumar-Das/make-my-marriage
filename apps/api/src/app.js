import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { requestContext } from './middleware/request-context.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { createAuthRouter } from './auth/router.js';
import { createProductionAuthService } from './auth/service.js';
import { createAuthDatabase } from './auth/database.js';
import { createWeddingService } from './weddings/service.js';
import { createWeddingRouter } from './weddings/router.js';
import { createMediaService } from './media/service.js';
import { createMediaRouter } from './media/router.js';
import { createEventService } from './events/service.js';
import { createEventRouter } from './events/router.js';
import { createTaskService } from './tasks/service.js';
import { createTaskRouter } from './tasks/router.js';
import { createChecklistRouter } from './checklist/router.js';
import { createChecklistGenerationRouter } from './checklist/generation-router.js';
import { createMemberService } from './members/service.js';
import { createMemberRouter } from './members/router.js';
import { createInvitationService } from './invitations/service.js';
import {
  createInvitationRouter,
  createInvitationAcceptanceRouter,
} from './invitations/router.js';
import { createInvitationSender } from './auth/email.js';

const database = createAuthDatabase(config);
export const weddingService = createWeddingService({ database });
export const mediaService = createMediaService({ database, settings: config });
export const eventService = createEventService({ database });
export const taskService = createTaskService({ database });
export const memberService = createMemberService({ database });
export const invitationService = createInvitationService({
  database,
  settings: config,
  sendInvitation: createInvitationSender(config),
});
export const authService = createProductionAuthService(config, {
  database,
  getWeddingContext: weddingService.current,
  verificationContinuation: invitationService.verificationContinuation,
});

export function createApp({
  service = authService,
  weddings = weddingService,
  media = mediaService,
  events = eventService,
  tasks = taskService,
  members = memberService,
  invitations = invitationService,
  settings = config,
} = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !origin || origin === settings.webOrigin),
      credentials: true,
      exposedHeaders: ['x-request-id', 'Retry-After', 'ETag'],
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
  app.use(
    '/api/v1/member-invitations',
    createInvitationAcceptanceRouter({ service, invitations, settings }),
  );
  app.use(
    '/api/v1/weddings/:weddingId/invitations',
    createInvitationRouter({ service, invitations, settings }),
  );
  app.use(
    '/api/v1/checklist-templates',
    createChecklistRouter({ service, settings }),
  );
  app.use('/api/v1', createMediaRouter({ service, weddings, media, settings }));
  app.use(
    '/api/v1/weddings/:weddingId/events',
    createEventRouter({ service, events, settings }),
  );
  app.use(
    '/api/v1/weddings/:weddingId/tasks',
    createTaskRouter({ service, tasks, settings }),
  );
  app.use(
    '/api/v1/weddings/:weddingId/checklists',
    createChecklistGenerationRouter({ service, tasks, settings }),
  );
  app.use(
    '/api/v1/weddings/:weddingId/members',
    createMemberRouter({ service, members, settings }),
  );
  app.use(
    '/api/v1/weddings',
    createWeddingRouter({ service, weddings, settings }),
  );
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
