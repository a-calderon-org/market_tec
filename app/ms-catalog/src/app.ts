import express, { type Express } from 'express';
import { createHealthRouter } from './adapters/in/http/health-router.js';
import { correlationId } from './adapters/in/http/correlation-id.js';
import { createErrorHandler, notFoundHandler } from './adapters/in/http/error-handler.js';
import { requestLogger } from './adapters/in/http/request-logger.js';
import { createContainer } from './config/container.js';
import { loadSettings, type Settings } from './config/settings.js';

export function createApp(settings: Settings = loadSettings()): Express {
  const app = express();
  const container = createContainer(settings);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(correlationId);
  app.use(requestLogger(settings.serviceName, settings.logLevel));
  app.use(createHealthRouter(container.getHealthQuery));
  app.use(notFoundHandler);
  app.use(createErrorHandler(settings.serviceName, settings.logLevel));

  return app;
}
