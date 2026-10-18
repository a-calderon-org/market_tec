import { Router } from 'express';
import type { GetHealthQuery } from '../../../application/ports/in/get-health-query.js';

export function createHealthRouter(getHealthQuery: GetHealthQuery): Router {
  const router = Router();
  router.get('/health', (request, response) => {
    response.status(200).json({
      ...getHealthQuery.getHealth(),
      correlationId: request.correlationId,
    });
  });
  return router;
}
