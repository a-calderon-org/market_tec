import { Router, type Request } from 'express';
import type { Publications } from '../../../application/ports/in/publications.js';
import { PublicationError, invalid } from '../../../domain/publication.js';
import type { PublicationFilter } from '../../../domain/publication.js';

export interface PublicationHttpDependencies {
  readonly publications: Pick<Publications, 'list' | 'get'>;
  // Must verify credentials before returning an opaque internal userId.
  // This callback is trusted server composition, never a browser identity header.
  readonly authenticate: (request: Request) => Promise<{ readonly userId: string } | undefined>;
}

const allowedKeys = new Set(['page', 'pageSize', 'q', 'categoria', 'sortBy', 'sortDirection', 'precioMin', 'precioMax']);

function parseFilter(request: Request): PublicationFilter {
  // URLSearchParams retains duplicates even if Express changes its query parser.
  const params = new URL(request.originalUrl, 'http://catalog.invalid').searchParams;
  const values: Record<string, string> = {};
  for (const [key, value] of params) {
    if (!allowedKeys.has(key) || Object.hasOwn(values, key)) invalid('Unknown or repeated query parameter');
    values[key] = value;
  }
  const filter: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (['page', 'pageSize', 'precioMin', 'precioMax'].includes(key)) {
      const pattern = key === 'page' || key === 'pageSize' ? /^\d+$/ : /^\d+(?:\.\d+)?$/;
      if (!pattern.test(value)) invalid('Invalid numeric query parameter');
      filter[key] = Number(value);
    } else {
      filter[key] = value;
    }
  }
  // Enum and range checks remain owned by the application/domain.
  return filter as PublicationFilter;
}

export function createPublicationRouter(dependencies: PublicationHttpDependencies): Router {
  const router = Router();
  router.use(async (request, response, next) => {
    const principal = await dependencies.authenticate(request);
    if (!principal || typeof principal.userId !== 'string' || !principal.userId.trim() || principal.userId.length > 64) {
      response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.',
        details: [], correlationId: request.correlationId, timestamp: Math.floor(Date.now() / 1000) } });
      return;
    }
    next();
  });
  router.get('/', async (request, response) => {
    response.json(await dependencies.publications.list(parseFilter(request)));
  });
  router.get('/:publicationId', async (request, response) => {
    response.json(await dependencies.publications.get(request.params.publicationId as string));
  });
  router.use(((error, request, response, next) => {
    if (!(error instanceof PublicationError)) { next(error); return; }
    const status = { INVALID_PUBLICATION: 400, PUBLICATION_NOT_FOUND: 404,
      PUBLICATION_FORBIDDEN: 403, PUBLICATION_CONFLICT: 409 }[error.code];
    const message = { INVALID_PUBLICATION: 'Invalid publication request.', PUBLICATION_NOT_FOUND: 'Publication not found.',
      PUBLICATION_FORBIDDEN: 'Publication access denied.', PUBLICATION_CONFLICT: 'Publication changed concurrently.' }[error.code];
    response.status(status).json({ error: { code: error.code, message, details: [],
      correlationId: request.correlationId, timestamp: Math.floor(Date.now() / 1000) } });
  }) satisfies import('express').ErrorRequestHandler);
  return router;
}
