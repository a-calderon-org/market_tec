import { Router, json, type ErrorRequestHandler } from 'express';
import type { ImageUploadStorage } from '../../../application/ports/out/image-storage-port.js';
import { PublicationError } from '../../../domain/publication.js';
import { parseImageUpload } from '../../../domain/publication-image.js';
import type { PublicationHttpDependencies } from './publication-router.js';

export function createImageRouter(authenticate: PublicationHttpDependencies['authenticate'], images: ImageUploadStorage): Router {
  const router = Router();
  router.post('/upload-url', async (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    const principal = await authenticate(request);
    if (!principal || typeof principal.userId !== 'string' || !principal.userId.trim() || principal.userId.length > 64) {
      response.status(401).set('WWW-Authenticate', 'Bearer').json({ error: {
        code: 'UNAUTHENTICATED', message: 'Authentication required.', details: [],
        correlationId: request.correlationId, timestamp: Math.floor(Date.now() / 1000),
      } });
      return;
    }
    response.locals.imageOwner = principal.userId;
    next();
  }, json({ limit: '4kb', inflate: false }), async (request, response) => {
    const contentType = parseImageUpload(request.body);
    response.json({ data: await images.issueUpload(response.locals.imageOwner, contentType) });
  });
  router.use(((error, request, response, next) => {
    const clientError = typeof error?.status === 'number' && error.status >= 400 && error.status < 500 && error.expose === true;
    if (!(error instanceof PublicationError) && !clientError) { next(error); return; }
    const status = !clientError ? 400 : error.status === 413 ? 413 : error.status === 415 ? 415 : 400;
    response.status(status).json({ error: {
      code: { 400: 'INVALID_IMAGE_UPLOAD', 413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE' }[status],
      message: 'Invalid image upload request.', details: [], correlationId: request.correlationId,
      timestamp: Math.floor(Date.now() / 1000),
    } });
  }) satisfies ErrorRequestHandler);
  return router;
}
