import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Container, SqlQuerySpec } from '@azure/cosmos';
import { QueueClient } from '@azure/storage-queue';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { AzureQueueEventPublisher, validateMessageSentV1 } from '../src/adapters/out/azure-queue-event-publisher.js';
import { CosmosMessageOutbox } from '../src/adapters/out/cosmos/message-outbox.js';
import { CosmosMessageRepository } from '../src/adapters/out/cosmos/messaging-repositories.js';
import { eventDocument, physicalId } from '../src/adapters/out/cosmos/documents.js';
import { CosmosStore, type StoredDocument } from '../src/adapters/out/cosmos/store.js';
import type { EventPublisher } from '../src/application/ports/out/event-publisher.js';
import { DispatchMessageEvents, type DispatchNotice } from '../src/application/use-cases/dispatch-message-events.js';
import { loadSettings } from '../src/config/settings.js';

const event = {
  eventId: '40000000-0000-4000-8000-000000000001', correlationId: '40000000-0000-4000-8000-000000000002',
  publicationId: 'p', messageId: 'm', chatId: 'c', senderUserId: 'buyer', recipientUserId: 'seller', sentAt: 100,
};
const pk = 'messages-v1';
const signal = new AbortController().signal;

test('Queue adapter emits raw JSON matching both shared schemas and no private fields', async () => {
  const schema = (file: string) =>
    JSON.parse(readFileSync(new URL('../../../../contracts/events/' + file, import.meta.url), 'utf8'));
  const ajv = new Ajv2020.default({ strict: false });
  addFormats.default(ajv);
  ajv.addSchema(schema('common-event-envelope.schema.json'));
  const validate = ajv.compile(schema('message-sent.v1.schema.json'));
  const publisher = new AzureQueueEventPublisher({
    async sendMessage(body, options) {
      assert.equal(options?.abortSignal, signal);
      assert.equal(options?.messageTimeToLive, -1);
      const actual = JSON.parse(body);
      assert.ok(validate(actual), JSON.stringify(validate.errors));
      assert.deepEqual(actual, {
        eventId: event.eventId, correlationId: event.correlationId, eventType: 'message.sent', schemaVersion: 1,
        occurredAt: 100, producer: 'ms-catalog', payload: {
          publicationId: 'p', messageId: 'm', chatId: 'c', senderUserId: 'buyer', recipientUserId: 'seller', sentAt: 100,
        },
      });
    },
  });
  const privateData = { ...event, texto: 'private', token: 'secret' };
  await publisher.publish(privateData, signal);
  for (const invalid of [
    { ...event, recipientUserId: '' }, { ...event, recipientUserId: event.senderUserId },
    { ...event, sentAt: 1_800_000_000_000 }, { ...event, correlationId: 'opaque' }, { ...event, eventId: 'opaque' },
  ]) await assert.rejects(publisher.publish(invalid, signal));
});

test('Azure Queue SDK sends raw UTF-8 JSON in the service XML envelope using bearer authentication', async () => {
  const value = { ...event, publicationId: 'Publicación & <TEC>\uffff' };
  let calls = 0;
  const client = new QueueClient('https://markettec.queue.core.windows.net/message-events', {
    async getToken() { return { token: 'sdk-test-token', expiresOnTimestamp: Date.now() + 60_000 }; },
  }, {
    retryOptions: { maxTries: 1 },
    httpClient: {
      async sendRequest(request) {
        calls++;
        assert.equal(request.method, 'POST');
        assert.equal(request.headers.get('authorization'), 'Bearer sdk-test-token');
        const url = new URL(request.url);
        assert.equal(url.pathname, '/message-events/messages');
        assert.equal(url.searchParams.get('messagettl'), '-1');
        const xml = String(request.body);
        const message = /<MessageText>([\s\S]*?)<\/MessageText>/.exec(xml)?.[1];
        assert.ok(message);
        assert.doesNotMatch(message, /\uffff/u);
        const body = JSON.parse(message.replaceAll('&lt;', '<').replaceAll('&gt;', '>')
          .replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
        assert.equal(body.payload.publicationId, value.publicationId);
        assert.equal(body.eventId, value.eventId);
        const headers = request.headers.clone();
        headers.set('content-type', 'application/xml');
        return { request, headers, status: 201,
          bodyAsText: '<QueueMessagesList><QueueMessage><MessageId>queue-id</MessageId></QueueMessage></QueueMessagesList>' };
      },
    },
  });
  await new AzureQueueEventPublisher(client).publish(value, signal);
  assert.equal(calls, 1);
});

function cosmosFake() {
  const rows = new Map<string, StoredDocument & { _etag: string }>();
  let revision = 0;
  let failBatch = false;
  let failAck = false;
  const save = (row: StoredDocument) => rows.set(row.id, { ...row, _etag: String(++revision) }).get(row.id)!;
  const container = {
    items: {
      async batch(ops: { resourceBody: StoredDocument }[], partition: string) {
        assert.equal(partition, pk);
        assert.equal(ops.length, 2);
        if (failBatch) throw { code: 429 };
        for (const { resourceBody } of ops) save(resourceBody);
        return { code: 200, headers: {}, result: ops.map(() => ({ statusCode: 201 })) };
      },
      query({ query, parameters }: SqlQuerySpec, options: { partitionKey: string }) {
        assert.equal(options.partitionKey, pk);
        const now = parameters?.find(parameter => parameter.name === '@now')?.value;
        const limit = parameters?.find(parameter => parameter.name === '@limit')?.value;
        assert.equal(typeof limit, 'number');
        const entries = [...rows.values()].filter(row => row.kind === 'event' &&
          (query.includes('NOT IS_DEFINED') ? row.outboxAvailableAt === undefined :
            typeof now === 'number' && typeof row.outboxAvailableAt === 'number' && row.outboxAvailableAt <= now))
          .slice(0, Number(limit)).map(({ id, _etag }) => ({ id, _etag }));
        let pending = true;
        return { hasMoreResults: () => pending, async fetchNext() { pending = false; return { resources: entries }; } };
      },
    },
    item(id: string, partition: string) {
      assert.equal(partition, pk);
      return {
        async read() { return { statusCode: 200, resource: rows.get(id) }; },
        async replace(row: StoredDocument, options: { accessCondition: { type: string; condition: string } }) {
          assert.equal(options.accessCondition.type, 'IfMatch');
          if (rows.get(id)?._etag !== options.accessCondition.condition) throw { code: 412 };
          if (failAck && row.outboxPublishedAt !== undefined) throw { code: 503 };
          return { statusCode: 200, resource: save(row) };
        },
      };
    },
  } as unknown as Container;
  return { store: () => new CosmosStore(container, pk), save, rows,
    failBatch: (value: boolean) => { failBatch = value; }, failAck: (value: boolean) => { failAck = value; } };
}

test('atomic append, failure recovery, lease contention and ambiguous acknowledgement reuse the same event', async () => {
  const cosmos = cosmosFake();
  const messages = new CosmosMessageRepository(cosmos.store(), validateMessageSentV1);
  const { messageId: id, chatId, senderUserId, recipientUserId, sentAt } = event;
  const message = { id, chatId, senderUserId, recipientUserId, sentAt, texto: 'private' };
  const delivered: unknown[] = [];
  const notices: DispatchNotice[] = [];
  let now = sentAt;
  let failEnqueue = true;
  const publisher: EventPublisher = { async publish(value) {
    assert.ok(cosmos.rows.has(physicalId('message', id)), 'message must already be persisted');
    if (failEnqueue) throw new Error('queue offline');
    delivered.push(value);
  } };
  const worker = () => new DispatchMessageEvents(new CosmosMessageOutbox(cosmos.store()), publisher, () => now,
    notice => notices.push(notice));
  const outbox = new CosmosMessageOutbox(cosmos.store());

  cosmos.failBatch(true);
  await assert.rejects(messages.append(message, event), { status: 429 });
  await worker().run(signal);
  assert.equal(cosmos.rows.size, 0);
  assert.deepEqual(delivered, []);
  cosmos.failBatch(false);
  await assert.rejects(messages.append(message, { ...event, correlationId: 'opaque' }));
  assert.equal(cosmos.rows.size, 0);
  await messages.append(message, event);
  await worker().run(signal);
  assert.equal(notices[0]?.stage, 'publish');
  assert.equal(notices[0]?.retryAt, 105);
  assert.deepEqual(await outbox.due(104, 20, signal), []);

  now = 105;
  failEnqueue = false;
  cosmos.failAck(true);
  await Promise.all([worker().run(signal), worker().run(signal)]);
  assert.deepEqual(delivered, [event]);
  assert.equal(notices.at(-1)?.stage, 'complete');
  assert.deepEqual(await outbox.due(164, 20, signal), []);

  now = 165;
  cosmos.failAck(false);
  await worker().run(signal);
  assert.deepEqual(delivered, [event, event]);
  assert.deepEqual(await outbox.due(1_000_000, 20, signal), []);
  assert.equal(cosmos.rows.get(eventDocument(event, pk).id)?.outboxPublishedAt, now);
});

test('pre-existing Cosmos events can be recovered and stale claims cannot update a new lease', async () => {
  const cosmos = cosmosFake();
  cosmos.save(eventDocument(event, pk));
  const outbox = new CosmosMessageOutbox(cosmos.store());
  const [legacy] = await outbox.due(100, 20, signal);
  assert.ok(legacy);
  const abandoned = await outbox.claim(legacy, 160, signal);
  assert.ok(abandoned);
  const [recovered] = await outbox.due(160, 20, signal);
  assert.ok(recovered);
  const next = await outbox.claim(recovered, 220, signal);
  assert.ok(next);
  assert.equal(next.attempts, 2);
  await assert.rejects(abandoned.complete(161, signal), { status: 412 });
  assert.deepEqual(next.readEvent(), event);
  await next.complete(161, signal);
});

test('Queue runtime configuration requires Cosmos and a credential-free Azure queue URL', () => {
  const queue = 'https://markettec.queue.core.windows.net/message-events';
  const cosmos = {
    CATALOG_JWT_ISSUER: 'https://users.example.test', CATALOG_JWT_AUDIENCE: 'catalog', CATALOG_JWT_JWKS_JSON: '{}',
    CATALOG_USERS_PROFILE_URL: 'https://users.example.test/v1/me/profile',
    CATALOG_PUBLICATIONS_STORE: 'cosmos', CATALOG_PLACEHOLDER_IMAGE_URL: 'https://catalog.example.test/placeholder.png',
    CATALOG_COSMOS_ENDPOINT: 'https://catalog.documents.azure.com', CATALOG_COSMOS_DATABASE: 'catalog',
  };
  assert.deepEqual(loadSettings({ ...cosmos, CATALOG_MESSAGE_QUEUE_URL: queue }).messageQueue, { url: queue });
  assert.throws(() => loadSettings({ CATALOG_MESSAGE_QUEUE_URL: queue }), /persistent Cosmos/);
  for (const url of [queue + '?sig=secret', 'https://example.test/message-events', queue + '/nested']) {
    assert.throws(() => loadSettings({ ...cosmos, CATALOG_MESSAGE_QUEUE_URL: url }), /HTTPS Azure Queue URL/);
  }
});
