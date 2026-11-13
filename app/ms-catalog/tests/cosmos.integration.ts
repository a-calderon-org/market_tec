import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createCatalogRuntime } from '../src/config/catalog-runtime.js';
import { loadSettings } from '../src/config/settings.js';
import { catalogContainerDefinitions, composeCosmosCatalog, createCosmosClient,
  defaultCatalogContainers } from '../src/config/cosmos-catalog.js';
import { CosmosPersistenceError } from '../src/adapters/out/cosmos/store.js';
import { DispatchMessageEvents } from '../src/application/use-cases/dispatch-message-events.js';
import type { MessageSent } from '../src/domain/messaging.js';
import { assertCatalogRepositoryContract } from './fixtures/catalog-repository-contract.js';
import type { CatalogRepositories } from './fixtures/catalog-repository-contract.js';

async function assertAuthenticatedHttp(repositories: CatalogRepositories, endpoint: string, key: string, database: string) {
  const issuer = 'https://users.example.test/users';
  const audience = 'markettec-api';
  const profileUrl = issuer + '/v1/me/profile';
  const now = 1_800_000_000;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const signingKey = { ...publicKey.export({ format: 'jwk' }), kid: 'cosmos-test', alg: 'RS256', use: 'sig' };
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = (sub: string) => {
    const header = encode({ typ: 'at+jwt', alg: 'RS256', kid: signingKey.kid });
    const claims = encode({ sub, iss: issuer, aud: audience, iat: now, exp: now + 240,
      sid: randomBytes(16).toString('hex'), jti: randomBytes(16).toString('hex') });
    const input = header + '.' + claims;
    return input + '.' + sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
  };
  const ownerToken = token('http-owner');
  const otherToken = token('http-other');
  const environment = { CATALOG_JWT_ISSUER: issuer, CATALOG_JWT_AUDIENCE: audience,
    CATALOG_JWT_JWKS_JSON: JSON.stringify({ keys: [signingKey] }), CATALOG_USERS_PROFILE_URL: profileUrl,
    CATALOG_PUBLICATIONS_STORE: 'cosmos', CATALOG_PLACEHOLDER_IMAGE_URL: 'https://example.test/default.png',
    CATALOG_COSMOS_ENDPOINT: endpoint, CATALOG_COSMOS_KEY: key, CATALOG_COSMOS_DATABASE: database,
    LOG_LEVEL: 'silent' };
  const settings = loadSettings(environment);
  const unavailable = loadSettings({ ...environment, CATALOG_COSMOS_MESSAGES_CONTAINER: 'not-provisioned' });
  await assert.rejects(createCatalogRuntime(unavailable), { name: 'CosmosPersistenceError', operation: 'validate' });
  const runtime = await createCatalogRuntime(settings, {
    nowSeconds: () => now,
    async fetchFn(url, init) {
      assert.equal(String(url), profileUrl);
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer ' + ownerToken);
      return Response.json({ id: 'http-owner', nombre: 'Ana', apellidos: 'Mora', verificado: true });
    },
  });
  const server = runtime.app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    const collection = base + '/v1/publicaciones';
    const content = { categoria: 'Libros', subcategoria: '', titulo: 'Álbum HTTP',
      descripcion: '', precio: 12, condicion: null, ubicacion: '' };
    function write(url: string, method: 'POST' | 'PUT', token: string, changes: Partial<typeof content> = {}) {
      return fetch(url, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...content, ...changes }), signal: AbortSignal.timeout(15_000) });
    }
    const created = await write(collection, 'POST', ownerToken);
    assert.equal(created.status, 201);
    const row = await created.json() as { id: string; vendedor: { userId: string; id: number | null } };
    assert.equal(row.vendedor.userId, 'http-owner');
    assert.equal(row.vendedor.id, null);
    const second = await write(collection, 'POST', ownerToken, { titulo: 'Colección', descripcion: 'Álbum HTTP', precio: 18 });
    assert.equal(second.status, 201);
    const secondRow = await second.json() as { id: string };
    for (const changes of [{ categoria: 'Arte' }, { precio: 19 }, { titulo: 'Sin coincidencia' }]) {
      const outside = await write(collection, 'POST', ownerToken, changes);
      assert.equal(outside.status, 201);
      await outside.body?.cancel();
    }
    const detail = collection + '/' + encodeURIComponent(row.id);
    const authorized = { Authorization: 'Bearer ' + ownerToken };
    const query = new URLSearchParams({
      q: ' áLBUM http ', categoria: content.categoria, precioMin: '1.2e+1', precioMax: '18',
      sortBy: 'precio', sortDirection: 'asc', page: '1', pageSize: '1',
    });
    async function assertPage(number: number, expectedIds: string[], totalRecords: number) {
      query.set('page', String(number));
      const list = await fetch(collection + '?' + query, { headers: authorized, signal: AbortSignal.timeout(15_000) });
      assert.equal(list.status, 200);
      const { items, ...metadata } = await list.json() as {
        items: { id: string }[]; totalRecords: number; page: number; pageSize: number;
      };
      assert.deepEqual(metadata, { totalRecords, page: number, pageSize: 1 });
      assert.deepEqual(items.map(item => item.id), expectedIds);
    }
    await assertPage(1, [row.id], 2);
    await assertPage(2, [secondRow.id], 2);
    await assertPage(3, [], 2);
    const rejected = await write(detail, 'PUT', otherToken, { titulo: 'bad' });
    assert.equal(rejected.status, 403);
    await rejected.body?.cancel();
    const unchanged = await fetch(detail, { headers: authorized, signal: AbortSignal.timeout(15_000) });
    assert.equal(unchanged.status, 200);
    assert.equal((await unchanged.json()).titulo, content.titulo);
    const updated = await write(detail, 'PUT', ownerToken, { titulo: 'Updated' });
    assert.equal(updated.status, 200);
    await updated.body?.cancel();
    await assertPage(1, [secondRow.id], 1);
    assert.ok(runtime.messaging);
    const buyer = { userId: 'http-other' };
    const chat = await runtime.messaging.start(buyer, row.id);
    const sent = await runtime.messaging.send(buyer, chat.id, 'Hola', randomUUID());
    const restarted = await createCatalogRuntime(settings, { nowSeconds: () => now });
    try {
      assert.ok(restarted.messaging);
      assert.equal((await restarted.messaging.listMessages(buyer, chat.id)).totalRecords, 1);
      assert.equal((await repositories.messages.listByChat(chat.id, { page: 1, pageSize: 10 })).items[0]?.id, sent.id);
      const stored = await repositories.publications.findById(row.id);
      assert.equal(stored?.revision, 2);
      assert.equal(stored?.titulo, 'Updated');
      assert.equal(stored?.ownerId, 'http-owner');
      assert.equal(stored?.seller.id, null);
    } finally {
      restarted.dispose();
    }
  } finally {
    try {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    } finally {
      runtime.dispose();
    }
  }
}

test('Cosmos NoSQL repository contract with isolated database and independent clients', { timeout: 180_000 }, async () => {
  const { COSMOS_TEST_ENDPOINT: endpoint, COSMOS_TEST_KEY: key } = process.env;
  assert.ok(endpoint && key, 'Set COSMOS_TEST_ENDPOINT and COSMOS_TEST_KEY for an isolated NoSQL test account or emulator');
  const authentication = { type: 'key', key } as const;
  const client = createCosmosClient(endpoint, authentication);
  const second = createCosmosClient(endpoint, authentication);
  const database = 'mtec29-test-' + randomUUID();
  const settings = { database, containers: defaultCatalogContainers };
  let created = false;
  try {
    const result = await client.databases.create({ id: database }, { abortSignal: AbortSignal.timeout(15_000) });
    created = result.statusCode === 201;
    assert.ok(created, 'Test database was not created');
    for (const definition of catalogContainerDefinitions()) {
      await result.database.containers.create(definition, { abortSignal: AbortSignal.timeout(15_000) });
    }
    let ru = 0;
    const primary = await composeCosmosCatalog(client, settings, metric => { ru += metric.requestCharge ?? 0; });
    const secondary = await composeCosmosCatalog(second, settings);
    const { originalId, chatId } = await assertCatalogRepositoryContract(primary, secondary);
    await assertAuthenticatedHttp(primary, endpoint, key, database);
    const fresh = createCosmosClient(endpoint, authentication);
    try {
      const restarted = await composeCosmosCatalog(fresh, settings);
      assert.equal((await restarted.publications.findById(originalId))?.revision, 2);
      assert.equal((await restarted.messages.listByChat(chatId, { page: 1, pageSize: 10 })).totalRecords, 3);
    } finally {
      fresh.dispose();
    }
    // An unavailable container must never be misreported as an absent item.
    await result.database.container(defaultCatalogContainers.publications).delete({ abortSignal: AbortSignal.timeout(15_000) });
    await assert.rejects(primary.publications.findById(originalId), CosmosPersistenceError);
    console.log('Observed request charge (primary client only):', ru);
  } finally {
    try {
      if (created) await client.database(database).delete({ abortSignal: AbortSignal.timeout(15_000) });
    } finally {
      client.dispose();
      second.dispose();
    }
  }
});

test('Cosmos outbox recovers a persisted event across clients and fences concurrent dispatchers', { timeout: 90_000 }, async () => {
  const { COSMOS_TEST_ENDPOINT: endpoint, COSMOS_TEST_KEY: key } = process.env;
  assert.ok(endpoint && key, 'Set COSMOS_TEST_ENDPOINT and COSMOS_TEST_KEY for an isolated NoSQL test account or emulator');
  const authentication = { type: 'key', key } as const;
  const writer = createCosmosClient(endpoint, authentication);
  const reader = createCosmosClient(endpoint, authentication);
  const database = 'mtec31-test-' + randomUUID();
  const settings = { database, containers: defaultCatalogContainers };
  const signal = AbortSignal.timeout(45_000);
  let created = false;
  try {
    const result = await writer.databases.create({ id: database }, { abortSignal: signal });
    created = result.statusCode === 201;
    assert.ok(created);
    for (const definition of catalogContainerDefinitions()) {
      await result.database.containers.create(definition, { abortSignal: signal });
    }
    const { messages, outbox } = await composeCosmosCatalog(writer, settings, undefined, true);
    const sentAt = 1_800_000_000;
    const message = { id: randomUUID(), chatId: randomUUID(), senderUserId: 'buyer',
      recipientUserId: 'seller', texto: 'privado', sentAt };
    const event: MessageSent = { eventId: randomUUID(), correlationId: randomUUID(), publicationId: 'publication',
      messageId: message.id, chatId: message.chatId, senderUserId: 'buyer', recipientUserId: 'seller', sentAt };
    await messages.append(message, event);

    let now = sentAt;
    const delivered: MessageSent[] = [];
    const notices: unknown[] = [];
    const failedPublisher = { async publish() { throw new Error('Temporary Queue outage'); } };
    const worker = new DispatchMessageEvents(outbox, failedPublisher, () => now, notice => notices.push(notice.stage));
    await worker.run(signal);
    assert.deepEqual(notices, ['publish']);
    assert.deepEqual(await outbox.due(now + 4, 20, signal), []);
    const restarted = await composeCosmosCatalog(reader, settings, undefined, true);
    now += 5;
    const publisher = { async publish(value: MessageSent) { delivered.push(value); } };
    await Promise.all([outbox, restarted.outbox].map(candidate =>
      new DispatchMessageEvents(candidate, publisher, () => now, notice => notices.push(notice.stage)).run(signal)));
    assert.deepEqual(notices, ['publish']);
    assert.deepEqual(delivered, [event]);
    assert.deepEqual(await restarted.outbox.due(now + 300, 20, signal), []);
  } finally {
    try {
      if (created) await writer.database(database).delete({ abortSignal: AbortSignal.timeout(15_000) });
    } finally {
      writer.dispose();
      reader.dispose();
    }
  }
});
