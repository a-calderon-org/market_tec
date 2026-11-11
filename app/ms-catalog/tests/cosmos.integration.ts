import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { composePublications } from '../src/config/publications.js';
import { loadSettings } from '../src/config/settings.js';
import { catalogContainerDefinitions, composeCosmosCatalog, createCosmosTestClient,
  defaultCatalogContainers } from '../src/config/cosmos-catalog.js';
import { CosmosPersistenceError } from '../src/adapters/out/cosmos/store.js';
import { assertCatalogRepositoryContract } from './fixtures/catalog-repository-contract.js';
import type { CatalogRepositories } from './fixtures/catalog-repository-contract.js';

async function assertAuthenticatedHttp(repositories: CatalogRepositories) {
  const issuer = 'https://users.example.test/users';
  const audience = 'markettec-api';
  const profileUrl = issuer + '/v1/me/profile';
  const now = 1_800_000_000;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = { ...publicKey.export({ format: 'jwk' }), kid: 'cosmos-test', alg: 'RS256', use: 'sig' };
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = (sub: string) => {
    const header = encode({ typ: 'at+jwt', alg: 'RS256', kid: key.kid });
    const claims = encode({ sub, iss: issuer, aud: audience, iat: now, exp: now + 240,
      sid: randomBytes(16).toString('hex'), jti: randomBytes(16).toString('hex') });
    const input = header + '.' + claims;
    return input + '.' + sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
  };
  const ownerToken = token('http-owner');
  const otherToken = token('http-other');
  const settings = loadSettings({ CATALOG_JWT_ISSUER: issuer, CATALOG_JWT_AUDIENCE: audience,
    CATALOG_JWT_JWKS_JSON: JSON.stringify({ keys: [key] }), CATALOG_USERS_PROFILE_URL: profileUrl,
    CATALOG_PUBLICATIONS_STORE: 'memory', CATALOG_PLACEHOLDER_IMAGE_URL: 'https://example.test/default.png',
    LOG_LEVEL: 'silent' });
  assert.ok(settings.publications);
  const app = createApp(settings, composePublications(settings.publications, {
    repository: repositories.publications,
    nowSeconds: () => now,
    async fetchFn(url, init) {
      assert.equal(String(url), profileUrl);
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer ' + ownerToken);
      return Response.json({ id: 'http-owner', nombre: 'Ana', apellidos: 'Mora', verificado: true });
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    const collection = base + '/v1/publicaciones';
    const content = { categoria: 'Libros', subcategoria: '', titulo: 'HTTP test',
      descripcion: '', precio: 12, condicion: null, ubicacion: '' };
    function write(url: string, method: 'POST' | 'PUT', token: string, titulo: string) {
      return fetch(url, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...content, titulo }), signal: AbortSignal.timeout(15_000) });
    }
    const created = await write(collection, 'POST', ownerToken, content.titulo);
    assert.equal(created.status, 201);
    const row = await created.json() as { id: string; vendedor: { userId: string; id: number | null } };
    assert.equal(row.vendedor.userId, 'http-owner');
    assert.equal(row.vendedor.id, null);
    const detail = collection + '/' + encodeURIComponent(row.id);
    const rejected = await write(detail, 'PUT', otherToken, 'bad');
    assert.equal(rejected.status, 403);
    await rejected.body?.cancel();
    assert.equal((await repositories.publications.findById(row.id))?.revision, 1);
    const updated = await write(detail, 'PUT', ownerToken, 'Updated');
    assert.equal(updated.status, 200);
    await updated.body?.cancel();
    const stored = await repositories.publications.findById(row.id);
    assert.equal(stored?.revision, 2);
    assert.equal(stored?.titulo, 'Updated');
    assert.equal(stored?.ownerId, 'http-owner');
    assert.equal(stored?.seller.id, null);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('Cosmos NoSQL repository contract with isolated database and independent clients', { timeout: 180_000 }, async () => {
  const { COSMOS_TEST_ENDPOINT: endpoint, COSMOS_TEST_KEY: key } = process.env;
  assert.ok(endpoint && key, 'Set COSMOS_TEST_ENDPOINT and COSMOS_TEST_KEY for an isolated NoSQL test account or emulator');
  const client = createCosmosTestClient(endpoint, key);
  const second = createCosmosTestClient(endpoint, key);
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
    await assertAuthenticatedHttp(primary);
    const fresh = createCosmosTestClient(endpoint, key);
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
