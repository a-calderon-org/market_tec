import { Router, json, type Request } from 'express';
import { ActorResolutionError } from '../../../application/ports/in/publications.js';
import type { AuthenticatedPrincipal, Publications, PublicationActor } from '../../../application/ports/in/publications.js';
import { PublicationError, invalid } from '../../../domain/publication.js';
import type { PublicationFilter, PublicationContent } from '../../../domain/publication.js';

export interface PublicationWrites {
  readonly publications: Pick<Publications, 'create' | 'update'>;
  readonly resolveActor: (principal: AuthenticatedPrincipal) => Promise<PublicationActor>;
}

export interface PublicationHttpDependencies {
  readonly publications: Pick<Publications, 'list' | 'get'>;
  // Must verify credentials before returning an opaque internal userId.
  // This callback is trusted server composition, never a browser identity header.
  readonly authenticate: (request: Request) => Promise<AuthenticatedPrincipal | undefined>;
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
  const identities = new WeakMap<Request, AuthenticatedPrincipal>();
  const unauthenticated = (request: Request, response: import('express').Response) => {
    response.status(401).set('WWW-Authenticate', 'Bearer').json({ error: { code: 'UNAUTHENTICATED',
      message: 'Authentication required.', details: [], correlationId: request.correlationId,
      timestamp: Math.floor(Date.now() / 1000) } });
  };
  router.use(async (request, response, next) => {
    const principal = await dependencies.authenticate(request);
    if (!principal || typeof principal.userId !== 'string' || !principal.userId.trim() || principal.userId.length > 64) {
      unauthenticated(request, response);
      return;
    }
    identities.set(request, principal);
    next();
  });
  if (dependencies.writes) {
    const writes = dependencies.writes;
    // Parse after authentication, with a bounded body, never before principal verification.
    router.use(json({ limit: '1mb' }));
    async function actor(request: Request): Promise<PublicationActor> {
      const principal = identities.get(request)!;
      const result = await writes.resolveActor(principal);
      if (result.userId !== principal.userId) throw new Error('Actor resolution mismatch');
      return result;
    }
    router.post('/', async (request, response) => {
      const content = parseContent(request.body);
      const created = await writes.publications.create(await actor(request), content);
      response.location(`/v1/publicaciones/${encodeURIComponent(created.id)}`).status(201).json(created);
    });
    router.put('/:publicationId', async (request, response) => {
      const content = parseContent(request.body);
      // Ownership uses only the verified subject; ms-users is not consulted on updates.
      const owner = { userId: identities.get(request)!.userId };
      response.json(await writes.publications.update(owner, request.params.publicationId as string, content));
    });
  }
  router.get('/', async (request, response) => {
    response.json(await dependencies.publications.list(parseFilter(request)));
  });
  router.get('/:publicationId', async (request, response) => {
    response.json(await dependencies.publications.get(request.params.publicationId as string));
  });
  router.use(((error, request, response, next) => {
    // body-parser/raw-body client errors (http-errors with expose=true): malformed or truncated JSON, bodies over
    // 1 MiB (also after decompression), unsupported encoding/charset or invalid compressed data. Never echo details.
    if (typeof error?.status === 'number' && error.status >= 400 && error.status < 500 && error.expose === true) {
      const status = error.status === 413 ? 413 : error.status === 415 ? 415 : 400;
      response.status(status).json({ error: {
        code: { 413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE', 400: 'INVALID_PUBLICATION' }[status],
        message: 'Invalid request body.', details: [], correlationId: request.correlationId,
        timestamp: Math.floor(Date.now() / 1000),
      } });
      return;
    }
    if (error instanceof ActorResolutionError) {
      if (error.code === 'UNAUTHENTICATED') { unauthenticated(request, response); return; }
      response.status(503).set('Retry-After', '5').json({ error: { code: error.code,
        message: 'Seller profile unavailable.', details: [], correlationId: request.correlationId,
        timestamp: Math.floor(Date.now() / 1000) } });
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
