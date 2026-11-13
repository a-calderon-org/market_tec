import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { BlobServiceClient } from '@azure/storage-blob';
import sharp from 'sharp';
import { createCatalogRuntime } from '../src/config/catalog-runtime.js';
import { loadSettings } from '../src/config/settings.js';
import { maxImageBytes } from '../src/domain/publication-image.js';

const azurite = process.env.CATALOG_TEST_BLOB_ENDPOINT;
const accountKey = process.env.CATALOG_TEST_BLOB_KEY;
const issuer = 'https://users.example.test/users';
const audience = 'markettec-api';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const gatewayKey = Buffer.alloc(32, 1).toString('base64url');
const publication = { categoria: 'Libros', subcategoria: '', titulo: 'Libro', descripcion: '', precio: 100,
  condicion: null, ubicacion: '' };

function jwt(sub: string) {
  const iat = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'at+jwt', kid: 'blob-test' };
  const claims = { iss: issuer, aud: audience, sub, iat, exp: iat + 240,
    jti: randomUUID().replaceAll('-', ''), sid: randomUUID().replaceAll('-', '') };
  const input = [header, claims].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return input + '.' + sign('RSA-SHA256', Buffer.from(input), keys.privateKey).toString('base64url');
}

interface Upload {
  uploadUrl: string;
  publicUrl: string;
  expiresAt: number;
}

test('Azurite: authorized upload, validation and publication round trip', async t => {
  assert.ok(azurite && accountKey, 'Set CATALOG_TEST_BLOB_ENDPOINT and CATALOG_TEST_BLOB_KEY for a loopback Azurite');
  const suffix = randomUUID().replaceAll('-', '');
  const settings = loadSettings({
    LOG_LEVEL: 'silent', CATALOG_JWT_ISSUER: issuer, CATALOG_JWT_AUDIENCE: audience,
    CATALOG_JWT_JWKS_JSON: JSON.stringify({ keys: [{
      ...keys.publicKey.export({ format: 'jwk' }), kid: 'blob-test', alg: 'RS256', use: 'sig',
    }] }),
    CATALOG_APIM_BACKEND_KEY: gatewayKey, CATALOG_USERS_PROFILE_URL: issuer + '/v1/me/profile',
    CATALOG_PLACEHOLDER_IMAGE_URL: 'https://cdn.example.test/placeholder.svg', CATALOG_PUBLICATIONS_STORE: 'memory',
    CATALOG_BLOB_ENDPOINT: azurite, CATALOG_BLOB_EMULATOR_KEY: accountKey,
    CATALOG_BLOB_STAGING_CONTAINER: 'uploads-' + suffix, CATALOG_BLOB_PUBLIC_CONTAINER: 'images-' + suffix,
  });
  const blobSettings = settings.blobImages!;
  const client = BlobServiceClient.fromConnectionString(
    `DefaultEndpointsProtocol=http;AccountName=${blobSettings.account};AccountKey=${accountKey};BlobEndpoint=${azurite}`,
  );
  const staging = client.getContainerClient(blobSettings.stagingContainer);
  const published = client.getContainerClient(blobSettings.publishedContainer);
  await staging.create();
  t.after(() => staging.deleteIfExists());
  await published.create({ access: 'blob' });
  t.after(() => published.deleteIfExists());
  await assert.rejects(createCatalogRuntime({
    ...settings, blobImages: { ...blobSettings, stagingContainer: published.containerName,
      publishedContainer: staging.containerName },
  }), /private staging container/);

  const runtime = await createCatalogRuntime(settings, {
    fetchFn: async (_input, init) => {
      const payload = new Headers(init?.headers).get('authorization')!.split('.')[1]!;
      const { sub } = JSON.parse(Buffer.from(payload, 'base64url').toString());
      return Response.json({ id: sub, nombre: 'Ana', apellidos: '', verificado: true });
    },
  });
  const server = runtime.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await runtime.dispose();
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const call = (path: string, body?: unknown, sub: string | null = 'owner', method = 'POST', gateway = gatewayKey) =>
    fetch(origin + path, { method, headers: { 'X-MTEC-Catalog-Gateway-Key': gateway,
      ...(sub ? { Authorization: 'Bearer ' + jwt(sub) } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const uploadPath = '/images/upload-url';
  const uploadRequest = { filename: 'portada.png', contentType: 'image/png' };
  const issue = async (contentType: string): Promise<Upload> => {
    const response = await call(uploadPath, { ...uploadRequest, contentType });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return (await response.json()).data;
  };
  const put = (url: string, bytes: Buffer, contentType: string) =>
    fetch(url, { method: 'PUT', headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': contentType },
      body: new Uint8Array(bytes) });
  const image = (format: 'jpeg' | 'png' | 'webp') =>
    sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).toFormat(format).toBuffer();

  assert.equal((await call(uploadPath, uploadRequest, 'owner', 'POST', 'bad-key')).status, 403);
  assert.equal((await call(uploadPath, uploadRequest, null)).status, 401);
  for (const body of [{ ...uploadRequest, contentType: 'image/svg+xml' }, { ...uploadRequest, userId: 'other' },
    { ...uploadRequest, filename: '../img.png' }, { contentType: 'image/png' }]) {
    assert.equal((await call(uploadPath, body)).status, 400);
  }

  // Azurite runs in a separate process with its real clock.
  const clock = t.mock.method(Date, 'now', () => new Date().getTime() - 600_000);
  let expired: Upload;
  try {
    expired = await issue('image/png');
  } finally {
    clock.mock.restore();
  }
  assert.ok(expired.expiresAt < Date.now() / 1000);
  assert.equal((await put(expired.uploadUrl, await image('png'), 'image/png')).status, 403);

  const urls: string[] = [];
  for (const format of ['jpeg', 'png', 'webp'] as const) {
    const contentType = 'image/' + format;
    const grant = await issue(contentType);
    const sas = new URL(grant.uploadUrl);
    const current = Math.floor(Date.now() / 1000);
    assert.ok(grant.expiresAt > current && grant.expiresAt <= current + 300);
    assert.equal(Date.parse(sas.searchParams.get('se')!) / 1000, grant.expiresAt);
    assert.equal(sas.searchParams.get('sp'), 'c');
    assert.equal(sas.searchParams.get('sr'), 'b');
    assert.equal(new URL(grant.publicUrl).search, '');
    assert.equal((await call('/publicaciones', { ...publication, imagenes: [grant.publicUrl] })).status, 400);
    const bytes = await image(format);
    const renamed = new URL(sas);
    renamed.pathname += '-other';
    assert.equal((await put(renamed.href, bytes, contentType)).status, 403);
    assert.equal((await put(sas.href, bytes, contentType)).status, 201);
    assert.equal((await fetch(sas.href)).status, 403);
    assert.ok([403, 409].includes((await put(sas.href, bytes, contentType)).status));
    assert.equal((await fetch(grant.publicUrl)).status, 404);
    assert.equal((await call('/publicaciones', { ...publication, imagenes: [grant.publicUrl] }, 'other')).status, 400);
    urls.push(grant.publicUrl);
  }

  const content = { ...publication, imagenes: urls };
  const [first, second] = await Promise.all([call('/publicaciones', content), call('/publicaciones', content)]);
  assert.equal(first.status, 201, await first.clone().text());
  assert.equal(second.status, 201, await second.clone().text());
  const created = await first.json();
  const path = '/publicaciones/' + created.id;
  const detail = await call(path, undefined, 'other', 'GET');
  assert.equal(detail.status, 200);
  assert.deepEqual(await detail.json(), created);
  assert.deepEqual(created.imagenes, urls);
  assert.equal(created.imagen, urls[0]);
  const list = await (await call('/publicaciones', undefined, 'other', 'GET')).json();
  assert.equal(list.totalRecords, 2);
  assert.equal(list.items.find((item: { id: string }) => item.id === created.id).imagen, urls[0]);
  for (const [index, format] of ['jpeg', 'png', 'webp'].entries()) {
    const response = await fetch(urls[index]!);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/' + format);
    assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format, format);
  }

  for (const invalid of [
    { bytes: Buffer.from('<html>not an image</html>'), type: 'image/png' },
    { bytes: await image('jpeg'), type: 'image/png' },
    { bytes: await image('png'), type: 'image/jpeg' },
    { bytes: Buffer.alloc(maxImageBytes + 1), type: 'image/png' },
    { bytes: (await image('png')).subarray(0, 30), type: 'image/png' },
  ]) {
    const grant = await issue('image/png');
    assert.equal((await put(grant.uploadUrl, invalid.bytes, invalid.type)).status, 201);
    const rejected = await call(path, { ...publication, imagenes: [grant.publicUrl] }, 'owner', 'PUT');
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error.code, 'INVALID_PUBLICATION');
    assert.equal((await fetch(grant.publicUrl)).status, 404);
  }
  for (const images of [[urls[0], urls[0]], [urls[0] + '?sig=x'], ['https://example.test/image.png']]) {
    assert.equal((await call(path, { ...publication, imagenes: images }, 'owner', 'PUT')).status, 400);
  }
  assert.deepEqual(await (await call(path, undefined, 'owner', 'GET')).json(), created);
  const updated = await call(path, { ...publication, imagenes: [urls[2], urls[0]] }, 'owner', 'PUT');
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).imagen, urls[2]);
});
