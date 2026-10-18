import type { NextFunction, Request, Response } from 'express';
import type { LogLevel } from '../../../config/settings.js';

export function requestLogger(serviceName: string, logLevel: LogLevel) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();
    response.on('finish', () => {
      if (logLevel !== 'debug' && logLevel !== 'info') {
        return;
      }
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      console.info(JSON.stringify({
        level: 'info',
        event: 'request_completed',
        service: serviceName,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Number(durationMs.toFixed(3)),
        correlationId: request.correlationId,
        timestamp: Math.floor(Date.now() / 1000),
      }));
    });
    next();
  };
}
