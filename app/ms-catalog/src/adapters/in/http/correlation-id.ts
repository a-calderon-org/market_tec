import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_HEADER = 'X-Correlation-ID';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

export function correlationId(request: Request, response: Response, next: NextFunction): void {
  const candidate = request.header(CORRELATION_HEADER)?.trim();
  request.correlationId = candidate && candidate.length <= 128 ? candidate : randomUUID();
  response.setHeader(CORRELATION_HEADER, request.correlationId);
  next();
}
