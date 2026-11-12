import express, { type Express } from 'express';
import { createHealthRouter } from './adapters/in/http/health-router.js';
import { correlationId } from './adapters/in/http/correlation-id.js';
import { createErrorHandler, notFoundHandler } from './adapters/in/http/error-handler.js';
import { requestLogger } from './adapters/in/http/request-logger.js';
import { requireGateway } from './adapters/in/http/require-gateway.js';
import { createContainer } from './config/container.js';
import { loadSettings, type Settings } from './config/settings.js';
import { createPublicationRouter, type PublicationHttpDependencies } from './adapters/in/http/publication-router.js';
import { createMessagingRouter, type MessagingHttpDependencies } from './adapters/in/http/messaging-router.js';

export function createApp(settings: Settings = loadSettings(), publications?: PublicationHttpDependencies,
  messaging?: MessagingHttpDependencies): Express {
  const app = express();
  const container = createContainer(settings);

  app.disable('x-powered-by');
  app.use(correlationId);
  app.use(requestLogger(settings.serviceName, settings.logLevel));
  if (settings.gatewayKey) app.use(requireGateway(settings.gatewayKey));
  app.use(createHealthRouter(container.getHealthQuery));
  if (publications) app.use('/v1/publicaciones', createPublicationRouter(publications));
  if (messaging) app.use('/v1/chats', createMessagingRouter(messaging));
  app.use(notFoundHandler);
  app.use(createErrorHandler(settings.serviceName, settings.logLevel));

  return app;
}
