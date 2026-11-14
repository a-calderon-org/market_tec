import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Container, SqlQuerySpec } from '@azure/cosmos';
import { InMemoryChatRepository, InMemoryMessageRepository } from '../src/adapters/out/in-memory-messaging-repository.js';
import { InMemoryPublicationRepository } from '../src/adapters/out/in-memory-publication-repository.js';
import { publicationDocument } from '../src/adapters/out/cosmos/documents.js';
import { CosmosPublicationRepository } from '../src/adapters/out/cosmos/publication-repository.js';
import { CosmosStore, CosmosPersistenceError } from '../src/adapters/out/cosmos/store.js';
import { CosmosMessageRepository } from '../src/adapters/out/cosmos/messaging-repositories.js';
import { normalizeQuery } from '../src/domain/publication.js';
import { catalogContainerDefinitions } from '../src/config/cosmos-catalog.js';
import { assertCatalogRepositoryContract, publicationFixture } from './fixtures/catalog-repository-contract.js';

const pk = 'test-pk';
const document = publicationDocument(publicationFixture, pk);
const response = (statusCode: number, resource?: unknown) => ({ statusCode, resource });

test('repository contract against in-memory baseline', async () => {
  await assertCatalogRepositoryContract({
    publications: new InMemoryPublicationRepository(),
    chats: new InMemoryChatRepository(),
    messages: new InMemoryMessageRepository(),
  });
});

test('Cosmos selects a partition, shares predicates across count/list and drains empty SDK pages', async () => {
  const calls: SqlQuerySpec[] = [];
  const store = new CosmosStore({
    items: {
      query(spec: SqlQuerySpec, options: { partitionKey: string; abortSignal: AbortSignal }) {
        assert.equal(options.partitionKey, pk);
        assert.ok(options.abortSignal);
        calls.push(spec);
        const pages = spec.query.startsWith('SELECT VALUE') ? [[], [8]] : [[], [document]];
        return { hasMoreResults: () => pages.length > 0, async fetchNext() { return { resources: pages.shift() }; } };
      },
    },
  } as unknown as Container, pk);
  const repo = new CosmosPublicationRepository(store);
  const query = normalizeQuery({ q: " ÁLBUM' ", page: 2, pageSize: 2, precioMax: 20 }, 'seller');
  const result = await repo.search(query);
  assert.deepEqual(result, { items: [publicationFixture], totalRecords: 8 });
  assert.equal(calls.length, 2);
  const count = calls[0]!;
  const list = calls[1]!;
  assert.equal(count.query.split(' WHERE ')[1], list.query.split(' WHERE ')[1]?.split(' ORDER BY ')[0]);
  assert.doesNotMatch(list.query, /álbum/);
  assert.deepEqual(list.parameters?.slice(0, -2), count.parameters);
  assert.deepEqual(list.parameters?.slice(-2), [{ name: '@offset', value: 2 }, { name: '@limit', value: 2 }]);
});

test('Cosmos rejects an indexing policy that cannot serve the publication filters and sort orders', async () => {
  const provisioned = catalogContainerDefinitions()[0]!.indexingPolicy!;
  const paths = provisioned.includedPaths!.map(({ path }) => path);
  const composites = provisioned.compositeIndexes!;
  let policy = provisioned;
  const store = new CosmosStore({
    async read() { return response(200, { partitionKey: { kind: 'Hash', paths: ['/pk'] }, indexingPolicy: policy }); },
  } as unknown as Container, pk);
  const validate = () => store.validate(AbortSignal.timeout(1_000), { paths, composites });
  await validate();
  policy = { ...provisioned, includedPaths: [{ path: '/*' }], excludedPaths: [{ path: '/imagenes/*' }],
    compositeIndexes: composites.map(index => index.map(({ path, order }) =>
      ({ path, order: order === 'ascending' ? 'descending' : 'ascending' }))) };
  await validate();
  policy = { ...policy, excludedPaths: [{ path: '/"searchText"/*' }] };
  await assert.rejects(validate, { name: 'CosmosPersistenceError', operation: 'validate' });
  policy = { ...provisioned, compositeIndexes: composites.slice(1) };
  await assert.rejects(validate, { name: 'CosmosPersistenceError', operation: 'validate' });
});

test('Cosmos conditions replacement on the read ETag and maps a 412 to the domain conflict', async () => {
  const store = new CosmosStore({
    item(id: string, partition: string) {
      assert.equal(id, document.id);
      assert.equal(partition, pk);
      return {
        async read() { return response(200, { ...document, _etag: 'known' }); },
        async replace(value: { revision: number }, options: { accessCondition: unknown }) {
          assert.equal(value.revision, 2);
          assert.deepEqual(options.accessCondition, { type: 'IfMatch', condition: 'known' });
          throw { code: 412 };
        },
      };
    },
  } as unknown as Container, pk);
  const repo = new CosmosPublicationRepository(store);
  await assert.rejects(repo.replace({ ...publicationFixture, revision: 2 }, 1), { code: 'PUBLICATION_CONFLICT' });
});

test('Cosmos conditions deletion on the read ETag and maps a stale ETag to conflict', async () => {
  let stale = true;
  const store = new CosmosStore({
    item(id: string, partition: string) {
      assert.equal(id, document.id);
      assert.equal(partition, pk);
      return {
        async read() { return response(200, { ...document, _etag: 'known' }); },
        async delete(options: { accessCondition: unknown }) {
          assert.deepEqual(options.accessCondition, { type: 'IfMatch', condition: 'known' });
          if (stale) throw { code: 412 };
          return response(204);
        },
      };
    },
  } as unknown as Container, pk);
  const repo = new CosmosPublicationRepository(store);
  const { id, ownerId, revision } = publicationFixture;
  await assert.rejects(repo.delete(id, ownerId, revision), { code: 'PUBLICATION_CONFLICT' });
  stale = false;
  await repo.delete(id, ownerId, revision);
});

test('Cosmos distinguishes missing items from missing containers and sanitizes upstream failures', async () => {
  let containerExists = true;
  let status = 404;
  const store = new CosmosStore({
    async read() {
      if (!containerExists) throw { code: 404, message: 'sensitive upstream diagnostics' };
      return response(200, { partitionKey: { kind: 'Hash', paths: ['/pk'] } });
    },
    item() {
      return { async read() {
        if (status !== 404) throw { code: status, message: 'sensitive upstream diagnostics' };
        return response(404);
      } };
    },
  } as unknown as Container, pk);
  const repo = new CosmosPublicationRepository(store);
  assert.equal(await repo.findById('missing'), undefined);
  containerExists = false;
  await assert.rejects(repo.findById('missing'), { name: 'CosmosPersistenceError', status: 404, operation: 'validate' });
  for (const code of [401, 403, 429, 500, 503]) {
    status = code;
    await assert.rejects(repo.findById('missing'), (error: unknown) => error instanceof CosmosPersistenceError &&
      error.status === code && !error.message.includes('sensitive') && error.cause === undefined);
  }
});

test('Cosmos rejects corrupted persisted documents rather than returning partial domain values', async () => {
  const store = new CosmosStore({
    item() { return { async read() { return response(200, { ...document, revision: 'corrupted' }); } }; },
  } as unknown as Container, pk);
  await assert.rejects(new CosmosPublicationRepository(store).findById(publicationFixture.id), CosmosPersistenceError);
});

test('Cosmos batch preserves the causal failure and reconciles an ambiguous write only if both documents match', async () => {
  const message = { id: 'm', chatId: 'c', senderUserId: 'a', recipientUserId: 'b', texto: 'private', sentAt: 1 };
  const event = { eventId: 'e', correlationId: 'trace', publicationId: 'p', messageId: 'm',
    chatId: 'c', senderUserId: 'a', recipientUserId: 'b', sentAt: 1 };
  const persisted = new Map<string, { id: string }>();
  let mode = 'conflict';
  let batchCalls = 0;
  const store = new CosmosStore({
    items: {
      async batch(ops: { operationType: string; resourceBody: { id: string } }[], partition: string) {
        batchCalls++;
        assert.equal(partition, pk);
        assert.deepEqual(ops.map(op => op.operationType), ['Create', 'Create']);
        assert.doesNotMatch(JSON.stringify(ops[1]), /private/);
        if (mode === 'conflict') return { code: 424, headers: {}, result: [{ statusCode: 424 }, { statusCode: 409 }] };
        if (mode === 'both') for (const op of ops) persisted.set(op.resourceBody.id, op.resourceBody);
        throw new Error('request failed', { cause: { code: 503, message: 'raw provider message' } });
      },
    },
    item(id: string, partition: string) {
      assert.equal(partition, pk);
      return { async read() { return persisted.has(id) ? response(200, persisted.get(id)) : response(404); } };
    },
    async read() { return response(200, { partitionKey: { kind: 'Hash', paths: ['/pk'] } }); },
  } as unknown as Container, pk);
  const repo = new CosmosMessageRepository(store);
  await assert.rejects(repo.append(message, event), { code: 'CHAT_CONFLICT' });
  mode = 'both';
  await repo.append(message, event);
  mode = 'missing';
  persisted.delete([...persisted.keys()].find(id => id.startsWith('event:'))!);
  await assert.rejects(repo.append(message, event), { name: 'CosmosPersistenceError', status: 503 });
  assert.equal(batchCalls, 3);
});
