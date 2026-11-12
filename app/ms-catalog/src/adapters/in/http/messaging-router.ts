import { randomUUID } from 'node:crypto';
import { Router, json, type Request, type Response } from 'express';
import type { Messaging } from '../../../application/ports/in/messaging.js';
import { isUuid, MessagingError, messageText, type PageRequest } from '../../../domain/messaging.js';
import { CORRELATION_HEADER } from './correlation-id.js';
import type { PublicationHttpDependencies } from './publication-router.js';

export interface MessagingHttpDependencies {
  readonly messaging: Messaging;
  readonly authenticate: PublicationHttpDependencies['authenticate'];
}

function invalid(): never {
  throw new MessagingError('INVALID_MESSAGE', 'Invalid messaging request.');
}

function bodyText(request: Request, key: string, limit: number): string {
  if (!request.is('application/json')) {
    throw Object.assign(new Error('JSON body required'), { status: 415, expose: true });
  }
  const body: unknown = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, key)) invalid();
  const value = (body as Record<string, unknown>)[key];
  messageText(value, key, limit);
  return value;
}

function pagination(request: Request): PageRequest {
  const page: { page?: number; pageSize?: number } = {};
  for (const [key, value] of new URL(request.originalUrl, 'http://catalog.invalid').searchParams) {
    if ((key !== 'page' && key !== 'pageSize') || Object.hasOwn(page, key) || !/^\d+$/.test(value)) invalid();
    page[key] = Number(value);
  }
  return page;
}

function fail(request: Request, response: Response, status: number, code: string, message: string): void {
  response.status(status).json({ error: { code, message, details: [], correlationId: request.correlationId,
    timestamp: Math.floor(Date.now() / 1000) } });
}

export function createMessagingRouter({ messaging, authenticate }: MessagingHttpDependencies): Router {
  const router = Router();
  const principals = new WeakMap<Request, { userId: string }>();
  router.use(async (request, response, next) => {
    // Use one contract-valid correlation ID across HTTP, persistence and Queue.
    if (!isUuid(request.correlationId)) {
      request.correlationId = randomUUID();
      response.setHeader(CORRELATION_HEADER, request.correlationId);
    }
    const principal = await authenticate(request);
    if (!principal || typeof principal.userId !== 'string' || !principal.userId.trim() || principal.userId.length > 64) {
      response.setHeader('WWW-Authenticate', 'Bearer');
      fail(request, response, 401, 'UNAUTHENTICATED', 'Authentication required.');
      return;
    }
    principals.set(request, { userId: principal.userId });
    next();
  });

  const parse = json({ limit: '32kb' });
  router.post('/', parse, async (request, response) => {
    const chat = await messaging.start(principals.get(request)!, bodyText(request, 'publicationId', 128));
    response.status(200).json(chat);
  });
  router.get('/', async (request, response) => {
    response.json(await messaging.listChats(principals.get(request)!, pagination(request)));
  });
  router.get('/:chatId/mensajes', async (request, response) => {
    response.json(await messaging.listMessages(principals.get(request)!, request.params.chatId, pagination(request)));
  });
  router.post('/:chatId/mensajes', parse, async (request, response) => {
    const message = await messaging.send(principals.get(request)!, request.params.chatId,
      bodyText(request, 'texto', 5000), request.correlationId);
    response.status(201).json({ data: { id: message.id, createdAt: message.sentAt } });
  });

  router.use(((error, request, response, next) => {
    if (error instanceof MessagingError) {
      const status = { INVALID_MESSAGE: 400, CHAT_NOT_FOUND: 404, CHAT_FORBIDDEN: 403, CHAT_CONFLICT: 409 }[error.code];
      fail(request, response, status, error.code, error.message);
    } else if (error?.expose === true && typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
      const status = error.status === 413 ? 413 : error.status === 415 ? 415 : 400;
      fail(request, response, status, { 413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE', 400: 'INVALID_MESSAGE' }[status],
        'Invalid request body.');
    } else {
      next(error);
    }
  }) satisfies import('express').ErrorRequestHandler);
  return router;
}
