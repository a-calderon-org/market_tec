import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { LogLevel } from '../../../config/settings.js';

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'The requested route does not exist.',
      details: [],
      correlationId: request.correlationId,
      timestamp: Math.floor(Date.now() / 1000),
    },
  });
};

export function createErrorHandler(serviceName: string, logLevel: LogLevel): ErrorRequestHandler {
  return (error, request, response, _next) => {
    if (logLevel !== 'silent') {
      console.error(JSON.stringify({
        level: 'error',
        event: 'request_failed',
        service: serviceName,
        correlationId: request.correlationId,
        errorType: error instanceof Error ? error.name : 'UnknownError',
        timestamp: Math.floor(Date.now() / 1000),
      }));
    }
    response.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The service could not process the request.',
        details: [],
        correlationId: request.correlationId,
        timestamp: Math.floor(Date.now() / 1000),
      },
    });
  };
}
