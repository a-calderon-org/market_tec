import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { MessagingService } from '../src/application/use-cases/messaging-service.js';
import { InMemoryChatRepository, InMemoryMessageRepository } from '../src/adapters/out/in-memory-messaging-repository.js';
import { isUuid } from '../src/domain/messaging.js';
import { publicationFixture } from './fixtures/catalog-repository-contract.js';

test('messaging HTTP persists authenticated messages with the correlation ID returned to the caller', async () => {
  const messages = new InMemoryMessageRepository();
  const messaging = new MessagingService(new InMemoryChatRepository(), messages,
    { async findById(id) { return id === publicationFixture.id ? publicationFixture : undefined; } },
    randomUUID, () => 100);
  const app = createApp({ port: 3000, serviceName: 'ms-catalog', logLevel: 'silent' }, undefined, {
    messaging,
    async authenticate(request) {
      const userId = new Map([['Bearer buyer', 'buyer'], ['Bearer seller', publicationFixture.ownerId],
        ['Bearer stranger', 'stranger']]).get(request.headers.authorization ?? '');
      return userId ? { userId } : undefined;
    },
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/v1/chats';
    const post = (url: string, actor: string, body: object, correlationId = 'legacy-correlation') =>
      fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + actor, 'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    const started = await post(base, 'buyer', { publicationId: publicationFixture.id });
    assert.equal(started.status, 200);
    const { id } = await started.json();
    const chat = base + '/' + id + '/mensajes';
    for (const [actor, body, status] of [
      ['', { texto: 'Hola' }, 401], ['stranger', { texto: 'Hola' }, 403],
      ['buyer', { texto: 'Hola', recipientUserId: 'stranger' }, 400],
    ] as const) {
      const rejected = await post(chat, actor, body);
      assert.equal(rejected.status, status);
      await rejected.body?.cancel();
    }
    assert.deepEqual(messages.preparedEvents(), []);

    const correlationId = randomUUID();
    const sent = await post(chat, 'buyer', { texto: 'Hola' }, correlationId);
    assert.equal(sent.status, 201);
    assert.equal(sent.headers.get('x-correlation-id'), correlationId);
    const { data } = await sent.json();
    assert.equal(data.createdAt, 100);
    assert.deepEqual(messages.preparedEvents().map(event => [event.messageId, event.correlationId, event.recipientUserId]),
      [[data.id, correlationId, publicationFixture.ownerId]]);

    const reply = await post(chat, 'seller', { texto: 'Respuesta' });
    assert.equal(reply.status, 201);
    const replyCorrelation = reply.headers.get('x-correlation-id');
    assert.ok(isUuid(replyCorrelation));
    await reply.body?.cancel();
    assert.equal(messages.preparedEvents()[1]?.recipientUserId, 'buyer');
    assert.equal(messages.preparedEvents()[1]?.correlationId, replyCorrelation);
    const page = await fetch(chat + '?pageSize=1', { headers: { Authorization: 'Bearer seller' },
      signal: AbortSignal.timeout(5000) });
    assert.equal(page.status, 200);
    const { totalRecords, items } = await page.json();
    assert.equal(totalRecords, 2);
    assert.equal(items.length, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
