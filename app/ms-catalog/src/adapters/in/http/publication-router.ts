import { Router, json, type Request } from 'express';
import type { Publications, PublicationActor } from '../../../application/ports/in/publications.js';
import { PublicationError, invalid } from '../../../domain/publication.js';
import type { PublicationFilter, PublicationContent } from '../../../domain/publication.js';

export interface PublicationWrites {
  readonly publications: Pick<Publications, 'create' | 'update'>;
  readonly resolveActor: (userId: string) => Promise<PublicationActor>;
}

export interface PublicationHttpDependencies {
  readonly publications: Pick<Publications, 'list' | 'get'>;
  // Must verify credentials before returning an opaque internal userId.
  // This callback is trusted server composition, never a browser identity header.
  readonly authenticate: (request: Request) => Promise<{ readonly userId: string } | undefined>;
  readonly writes?: PublicationWrites;
}

function parseContent(body: unknown): PublicationContent {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Invalid publication body');
  const allowed = ['categoria', 'subcategoria', 'titulo', 'descripcion', 'precio', 'condicion', 'ubicacion', 'imagenes'];
  for (const key of Object.keys(body)) if (!allowed.includes(key)) invalid('Unknown publication field');
  const data = body as PublicationContent;
  return { ...data, imagenes: data.imagenes === undefined ? [] : data.imagenes };
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
  const identities = new WeakMap<Request, string>();
  router.use(async (request, response, next) => {
    const principal = await dependencies.authenticate(request);
    if (!principal || typeof principal.userId !== 'string' || !principal.userId.trim() || principal.userId.length > 64) {
      response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.',
        details: [], correlationId: request.correlationId, timestamp: Math.floor(Date.now() / 1000) } });
      return;
    }
    identities.set(request, principal.userId);
    next();
  });
  if (dependencies.writes) {
    const writes = dependencies.writes;
    // Parse after authentication, with a bounded body, never before principal verification.
    router.use(json({ limit: '1mb' }));
    async function actor(request: Request): Promise<PublicationActor> {
      const userId = identities.get(request)!;
      const result = await writes.resolveActor(userId);
      if (result.userId !== userId) throw new Error('Actor resolution mismatch');
      return result;
    }
    router.post('/', async (request, response) => {
      const content = parseContent(request.body);
      const created = await writes.publications.create(await actor(request), content);
      response.location(`/v1/publicaciones/${encodeURIComponent(created.id)}`).status(201).json(created);
    });
    router.put('/:publicationId', async (request, response) => {
      const content = parseContent(request.body);
      response.json(await writes.publications.update(await actor(request), request.params.publicationId as string, content));
    });
  }
  router.get('/', async (request, response) => {
    response.json(await dependencies.publications.list(parseFilter(request)));
  });
  router.get('/:publicationId', async (request, response) => {
    response.json(await dependencies.publications.get(request.params.publicationId as string));
  });
  router.use(((error, request, response, next) => {
    if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
      response.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: {
        code: error.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_PUBLICATION',
        message: 'Invalid request body.', details: [], correlationId: request.correlationId,
        timestamp: Math.floor(Date.now() / 1000),
      } });
      return;
    }
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
