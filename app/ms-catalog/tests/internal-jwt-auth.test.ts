import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { composePublications } from '../src/config/publications.js';
import { loadSettings } from '../src/config/settings.js';
import { InternalJwtVerifier, RemoteJwks, StaticJwks, bearerToken } from '../src/adapters/in/http/internal-jwt-verifier.js';

const ISSUER = 'https://users.example.test/users';
const AUDIENCE = 'markettec-api';
const PROFILE_URL = 'https://users.example.test/users/v1/me/profile';
const NOW = 1_800_000_000;

function rsaKey() { return generateKeyPairSync('rsa', { modulusLength: 2048 }); }
const signing = rsaKey();
const foreign = rsaKey();
const jwk = (key: KeyObject, kid: string) => ({ ...key.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' });
const JWKS = { keys: [jwk(signing.publicKey, 'stg-test')] };

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const hex = () => randomBytes(16).toString('hex');

// Mirrors ms-users InternalJwtService: RS256, typ at+jwt, kid, sub/sid/iss/aud/iat/exp/jti, 240 s lifetime.
function mint(sub: string, overrides: { header?: Record<string, unknown>; claims?: Record<string, unknown>; key?: KeyObject } = {}) {
  const header = { alg: 'RS256', typ: 'at+jwt', kid: 'stg-test', ...overrides.header };
  const claims = { sub, sid: hex(), iss: ISSUER, aud: AUDIENCE, iat: NOW - 10, exp: NOW + 230, jti: hex(), ...overrides.claims };
  const input = `${b64(header)}.${b64(claims)}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), overrides.key ?? signing.privateKey).toString('base64url')}`;
}

// ms-users profiles keyed by userId; a Google user and a Magic Link user share the same e-mail on purpose.
const profiles: Record<string, Record<string, unknown>> = {
  'usr-google': { id: 'usr-google', nombreUsuario: 'ana', nombre: 'Ana', apellidos: 'Mora', correo: 'ana@estudiantec.cr', verificado: true },
  'usr-magic': { id: 'usr-magic', nombreUsuario: 'ana2', nombre: 'Ana', apellidos: '', correo: 'ana@estudiantec.cr', verificado: false },
  'usr-mismatch': { id: 'usr-other', nombre: 'X', apellidos: '', verificado: false },
};
const profileCalls: string[] = [];
let profileMode: 'ok' | 'revoked' | 'down' = 'ok';
const fakeUsers: typeof fetch = async (input, init) => {
  assert.equal(String(input), PROFILE_URL);
  assert.equal(init?.redirect, 'error');
  assert.deepEqual([...new Headers(init?.headers).keys()].sort(), ['accept', 'authorization']);
  const auth = new Headers(init?.headers).get('authorization') ?? '';
  const sub = JSON.parse(Buffer.from(auth.slice(7).split('.')[1]!, 'base64url').toString()).sub as string;
  profileCalls.push(sub);
  if (profileMode === 'down') throw new TypeError('fetch failed');
  if (profileMode === 'revoked') return new Response('{"error":{"code":"UNAUTHENTICATED"}}', { status: 401 });
  return Response.json(profiles[sub]);
};

let server: Server;
let base: string;
const content = { categoria: 'Electrónica', subcategoria: '', titulo: 'Laptop', descripcion: 'Prueba', precio: 10, condicion: null, ubicacion: '' };
const call = (method: string, path: string, token?: string, body?: unknown, extra: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

before(async () => {
  const settings = loadSettings({ CATALOG_JWT_ISSUER: ISSUER, CATALOG_JWT_AUDIENCE: AUDIENCE,
    CATALOG_JWT_JWKS_JSON: JSON.stringify(JWKS), CATALOG_USERS_PROFILE_URL: PROFILE_URL,
    CATALOG_PUBLICATIONS_STORE: 'memory', CATALOG_PLACEHOLDER_IMAGE_URL: 'https://cdn.example.test/placeholder.svg',
    LOG_LEVEL: 'silent' });
  assert.ok(settings.publications);
  const app = createApp(settings, composePublications(settings.publications, { fetchFn: fakeUsers, nowSeconds: () => NOW }));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/publicaciones`;
});
after(async () => { await new Promise<void>((resolve, reject) => {
  server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
}); });

test('Google and Magic Link principals create publications owned by their own token subject', async () => {
  profileMode = 'ok';
  const google = await call('POST', '', mint('usr-google'), content);
  assert.equal(google.status, 201);
  const googleBody = await google.json();
  assert.deepEqual(googleBody.vendedor, { id: null, nombre: 'Ana Mora', carrera: '', verificado: true, userId: 'usr-google' });

  const magic = await call('POST', '', mint('usr-magic'), { ...content, titulo: 'Bicicleta' });
  assert.equal(magic.status, 201);
  const magicBody = await magic.json();
  // Same e-mail, different accounts: never merged.
  assert.equal(magicBody.vendedor.userId, 'usr-magic');
  assert.equal(magicBody.vendedor.nombre, 'Ana');

  const list = await call('GET', '', mint('usr-magic'));
  assert.equal(list.status, 200);
  assert.equal((await list.json()).totalRecords, 2);
  const detail = await call('GET', `/${googleBody.id}`, mint('usr-magic'));
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).vendedor.userId, 'usr-google');

  const foreignUpdate = await call('PUT', `/${googleBody.id}`, mint('usr-magic'), { ...content, titulo: 'Robada' });
  assert.equal(foreignUpdate.status, 403);
  assert.equal((await foreignUpdate.json()).error.code, 'PUBLICATION_FORBIDDEN');
  const ownUpdate = await call('PUT', `/${googleBody.id}`, mint('usr-google'), { ...content, titulo: 'Editada' });
  assert.equal(ownUpdate.status, 200);
  assert.equal((await ownUpdate.json()).titulo, 'Editada');
  assert.equal((await call('PUT', '/missing', mint('usr-google'), content)).status, 404);
});

test('tampered, expired, foreign-key and wrong issuer/audience/type tokens are rejected with 401', async () => {
  const valid = mint('usr-google');
  const [h, p, s] = valid.split('.') as [string, string, string];
  const forgedPayload = b64({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), sub: 'usr-magic' });
  const rejected = {
    tampered: `${h}.${forgedPayload}.${s}`,
    expired: mint('usr-google', { claims: { iat: NOW - 300, exp: NOW - 1 } }),
    foreignKey: mint('usr-google', { key: foreign.privateKey }),
    unknownKid: mint('usr-google', { header: { kid: 'other' } }),
    issuer: mint('usr-google', { claims: { iss: 'https://accounts.google.com' } }),
    audience: mint('usr-google', { claims: { aud: 'other-api' } }),
    type: mint('usr-google', { header: { typ: 'JWT' } }),
    algNone: `${b64({ alg: 'none', typ: 'at+jwt', kid: 'stg-test' })}.${p}.`,
    noSubject: mint('', {}),
    future: mint('usr-google', { claims: { iat: NOW + 1, exp: NOW + 200 } }),
    expiresNow: mint('usr-google', { claims: { iat: NOW - 240, exp: NOW } }),
    tooLong: mint('usr-google', { claims: { iat: NOW - 10, exp: NOW + 300 } }),
    audienceArray: mint('usr-google', { claims: { aud: [AUDIENCE] } }),
    stringTimes: mint('usr-google', { claims: { iat: String(NOW - 10) } }),
    badSid: mint('usr-google', { claims: { sid: 'not-hex' } }),
    embeddedJwk: mint('usr-google', { header: { jwk: jwk(foreign.publicKey, 'x') } }),
  };
  for (const [name, token] of Object.entries(rejected)) {
    for (const [method, path, body] of [['GET', '', undefined], ['POST', '', content]] as const) {
      const response = await call(method, path, token, body);
      assert.equal(response.status, 401, `${name} ${method}`);
      assert.equal(response.headers.get('www-authenticate'), 'Bearer');
      assert.equal((await response.json()).error.code, 'UNAUTHENTICATED');
    }
  }
});

test('identity headers, Google-style tokens and body ownership fields never authenticate or assign ownership', async () => {
  profileMode = 'ok';
  assert.equal((await call('GET', '', undefined, undefined, { 'X-User-Id': 'usr-google' })).status, 401);
  assert.equal((await call('GET', '', undefined, undefined, { Authorization: 'usr-google' })).status, 401);
  for (const field of ['userId', 'vendedor', 'ownerId', 'id']) {
    const response = await call('POST', '', mint('usr-magic'), { ...content, [field]: 'usr-google' });
    assert.equal(response.status, 400, field);
  }
});

test('seller snapshot failures never write: revoked session 401, unavailable or mismatched profile 503', async () => {
  const before = (await (await call('GET', '', mint('usr-google'))).json()).totalRecords;
  profileMode = 'revoked';
  assert.equal((await call('POST', '', mint('usr-google'), content)).status, 401);
  profileMode = 'down';
  const down = await call('POST', '', mint('usr-google'), content);
  assert.equal(down.status, 503);
  assert.equal((await down.json()).error.code, 'SELLER_PROFILE_UNAVAILABLE');
  profileMode = 'ok';
  assert.equal((await call('POST', '', mint('usr-mismatch'), content)).status, 503);
  assert.equal((await (await call('GET', '', mint('usr-google'))).json()).totalRecords, before);
  // Reads, authentication and updates never call ms-users; only creation resolves the seller snapshot.
  profileCalls.length = 0;
  profileMode = 'down';
  const list = await (await call('GET', '', mint('usr-google'))).json();
  const own = list.items.find((item: { vendedor: { userId: string } }) => item.vendedor.userId === 'usr-google');
  assert.equal((await call('PUT', `/${own.id}`, mint('usr-google'), content)).status, 200);
  assert.equal((await call('PUT', `/${own.id}`, mint('usr-magic'), content)).status, 403);
  assert.equal((await call('PUT', '/missing', mint('usr-magic'), content)).status, 404);
  assert.deepEqual(profileCalls, []);
  profileMode = 'ok';
});

test('RemoteJwks fetches the published JWKS once and refreshes for a rotated kid', async () => {
  let now = 0;
  const rotated = rsaKey();
  let served: { keys: unknown[] } = JWKS;
  let fetches = 0;
  const keys = new RemoteJwks('https://users.example.test/.well-known/jwks.json', async () => {
    fetches++;
    return Response.json(served);
  }, () => now);
  const verifier = new InternalJwtVerifier({ issuer: ISSUER, audience: AUDIENCE, keys, nowSeconds: () => NOW });
  assert.equal((await verifier.verify(mint('usr-google')))?.userId, 'usr-google');
  assert.equal((await verifier.verify(mint('usr-google')))?.userId, 'usr-google');
  assert.equal(fetches, 1);
  served = { keys: [...JWKS.keys, jwk(rotated.publicKey, 'next')] };
  now = 31_000;
  const next = mint('usr-magic', { header: { kid: 'next' }, key: rotated.privateKey });
  assert.equal((await verifier.verify(next))?.userId, 'usr-magic');
  assert.equal(fetches, 2);
});

test('RemoteJwks keeps known keys only for a bounded time when refresh fails, then fails closed', async () => {
  let now = 0;
  let healthy = true;
  const keys = new RemoteJwks('https://users.example.test/.well-known/jwks.json', async () => {
    if (!healthy) throw new TypeError('fetch failed');
    return Response.json(JWKS);
  }, () => now, 300_000, 30_000, 600_000);
  const verifier = new InternalJwtVerifier({ issuer: ISSUER, audience: AUDIENCE, keys, nowSeconds: () => NOW });
  assert.ok(await verifier.verify(mint('usr-google')));
  healthy = false;
  now = 400_000;
  assert.ok(await verifier.verify(mint('usr-google')), 'stale but within maxStaleMs');
  now = 700_000;
  await assert.rejects(verifier.verify(mint('usr-google')), /JWKS unavailable/);
});

test('static JWKS rejects private material and the bearer parser accepts a single Bearer token only', () => {
  assert.throws(() => new StaticJwks({ keys: [{ ...signing.privateKey.export({ format: 'jwk' }), kid: 'k' }] }));
  assert.throws(() => new StaticJwks({ keys: [JWKS.keys[0], JWKS.keys[0]] }), /duplicate kid/);
  assert.equal(bearerToken('Bearer a.b.c'), 'a.b.c');
  for (const value of [undefined, 'bearer a.b.c', 'Bearer a.b.c extra', 'Basic abc', ['Bearer a.b.c']]) {
    assert.equal(bearerToken(value as string | undefined), undefined);
  }
});

test('publication settings: absent keeps health-only and partial configurations fail startup', () => {
  assert.equal(loadSettings({}).publications, undefined);
  assert.throws(() => loadSettings({ CATALOG_JWT_ISSUER: ISSUER }), /CATALOG_JWT_AUDIENCE/);
  const complete = { CATALOG_JWT_ISSUER: ISSUER, CATALOG_JWT_AUDIENCE: AUDIENCE, CATALOG_JWT_JWKS_URI: 'https://u.example.test/jwks.json',
    CATALOG_USERS_PROFILE_URL: PROFILE_URL, CATALOG_PUBLICATIONS_STORE: 'memory', CATALOG_PLACEHOLDER_IMAGE_URL: 'https://c.example.test/p.svg' };
  assert.equal(loadSettings(complete).publications?.store, 'memory');
  assert.throws(() => loadSettings({ ...complete, CATALOG_PUBLICATIONS_STORE: 'cosmos' }), /CATALOG_COSMOS_ENDPOINT/);
  assert.throws(() => loadSettings({ ...complete, CATALOG_JWT_JWKS_JSON: '{}' }), /exactly one/);
  assert.throws(() => loadSettings({ ...complete, CATALOG_USERS_PROFILE_URL: 'http://users.example.test/me' }), /https/);
  // Bounded delegation: only <issuer>/v1/me/profile on the gateway (loopback HTTP for local tests).
  for (const url of ['https://evil.example.test/users/v1/me/profile', 'https://users.example.test/users/v1/usuarios/x',
    `${PROFILE_URL}?x=1`, 'https://users.example.test/v1/me/profile']) {
    assert.throws(() => loadSettings({ ...complete, CATALOG_USERS_PROFILE_URL: url }), /must be exactly/, url);
  }
  assert.ok(loadSettings({ ...complete, CATALOG_USERS_PROFILE_URL: 'http://127.0.0.1:3911/v1/me/profile' }).publications);
});

test('Cosmos settings select explicit persistent storage with managed identity or an external key', () => {
  const settings = { CATALOG_JWT_ISSUER: ISSUER, CATALOG_JWT_AUDIENCE: AUDIENCE,
    CATALOG_JWT_JWKS_URI: 'https://u.example.test/jwks.json', CATALOG_USERS_PROFILE_URL: PROFILE_URL,
    CATALOG_PLACEHOLDER_IMAGE_URL: 'https://c.example.test/p.svg', CATALOG_PUBLICATIONS_STORE: 'cosmos',
    CATALOG_COSMOS_ENDPOINT: 'https://account.example.test', CATALOG_COSMOS_DATABASE: 'catalog' };
  const managed = loadSettings(settings);
  assert.equal(managed.publications?.store, 'cosmos');
  assert.deepEqual(managed.cosmos, {
    endpoint: settings.CATALOG_COSMOS_ENDPOINT, database: 'catalog',
    containers: { publications: 'publicaciones', chats: 'chats', messages: 'mensajes' },
    authentication: { type: 'managed-identity' },
  });
  const clientId = '10000000-0000-0000-0000-000000000001';
  assert.deepEqual(loadSettings({ ...settings, CATALOG_COSMOS_MANAGED_IDENTITY_CLIENT_ID: clientId }).cosmos?.authentication,
    { type: 'managed-identity', clientId });
  assert.deepEqual(loadSettings({ ...settings, CATALOG_COSMOS_KEY: 'test-key',
    CATALOG_COSMOS_MESSAGES_CONTAINER: 'messages-v2' }).cosmos?.containers,
  { publications: 'publicaciones', chats: 'chats', messages: 'messages-v2' });
  assert.throws(() => loadSettings({ ...settings, CATALOG_COSMOS_MANAGED_IDENTITY_CLIENT_ID: clientId,
    CATALOG_COSMOS_KEY: 'test-key' }), /either a Cosmos key or a managed identity/);
  assert.throws(() => loadSettings({ ...settings, CATALOG_COSMOS_MESSAGES_CONTAINER: 'chats' }), /distinct/);
  assert.throws(() => loadSettings({ ...settings, CATALOG_COSMOS_DATABASE: '' }), /CATALOG_COSMOS_DATABASE/);
  assert.throws(() => loadSettings({ ...settings, CATALOG_PUBLICATIONS_STORE: 'memory' }), /require CATALOG_PUBLICATIONS_STORE/);
  for (const endpoint of ['http://localhost:8081', 'https://account.example.test/path', 'https://account.example.test/?q=1']) {
    assert.throws(() => loadSettings({ ...settings, CATALOG_COSMOS_ENDPOINT: endpoint }), /HTTPS origin/);
  }
});
