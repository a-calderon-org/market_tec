import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

const header = 'x-mtec-catalog-gateway-key';

export function requireGateway(key: string): RequestHandler {
  const expected = Buffer.from(key);
  return (request, response, next) => {
    const values = request.headersDistinct[header];
    const received = values?.length === 1 ? Buffer.from(values[0]!) : undefined;
    if (received?.length === expected.length && timingSafeEqual(received, expected)) {
      next();
      return;
    }
    response.status(403).json({ error: {
      code: 'GATEWAY_REQUIRED', message: 'Catalog gateway required.', details: [],
      correlationId: request.correlationId, timestamp: Math.floor(Date.now() / 1000),
    } });
  };
}
