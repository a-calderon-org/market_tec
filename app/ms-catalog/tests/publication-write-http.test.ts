import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { createApp } from '../src/app.js';
import { PublicationService } from '../src/application/use-cases/publication-service.js';
import { InMemoryPublicationRepository } from '../src/adapters/out/in-memory-publication-repository.js';

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats.default(ajv);
const contract = JSON.parse(await readFile(new URL('../../../../contracts/openapi/catalog.json', import.meta.url), 'utf8'));
// Compile the schema graph, without treating the entire OpenAPI document as a schema.
const root = { $id: 'https://catalog.example.invalid/schema', components: contract.components };
ajv.addSchema(root);
function validates(schema: string, value: unknown) {
  const validate = ajv.compile({ $ref: `${root.$id}#/components/schemas/${schema}` });
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
}

let server: Server;
let base: string;
let sequence = 0;
const headers = { Authorization: 'Bearer owner-test', 'Content-Type': 'application/json', 'X-Correlation-ID': 'write-test' };
const content = { categoria: 'Electrónica', subcategoria: '', titulo: 'Laptop', descripcion: 'Prueba', precio: 10, condicion: null, ubicacion: '' };
before(async () => {
  const service = new PublicationService(new InMemoryPublicationRepository(),
    { async assertUsableBy(_owner, urls) { if (urls.length) throw new Error('Image adapter unavailable'); } },
    () => `pub-write-${++sequence}`, () => new Date('2026-11-09T12:00:00Z'), 'https://example.invalid/placeholder.svg');
  const app = createApp({ port: 3000, serviceName: 'ms-catalog', logLevel: 'silent' }, {
    publications: service,
    async authenticate(request) {
      if (request.headers.authorization === 'Bearer owner-test') return { userId: 'usr-owner' };
      if (request.headers.authorization === 'Bearer other-test') return { userId: 'usr-other' };
      if (request.headers.authorization === 'Bearer mismatch-test') return { userId: 'usr-mismatch' };
      return undefined;
    },
    writes: { publications: service, async resolveActor({ userId }) {
      return { userId: userId === 'usr-mismatch' ? 'usr-owner' : userId,
        seller: { id: 101, nombre: 'Ana', carrera: '', verificado: false } };
    } },
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/publicaciones`;
});
after(async () => { await new Promise<void>((resolve, reject) => {
  server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
}); });

async function create() {
  const response = await fetch(base, { method: 'POST', headers, body: JSON.stringify(content) });
  assert.equal(response.status, 201);
  const body = await response.json();
  validates('PublicationDetailV1', body);
  assert.equal(response.headers.get('location'), `/v1/publicaciones/${body.id}`);
  assert.equal(response.headers.get('x-correlation-id'), 'write-test');
  assert.deepEqual(body.imagenes, []);
  assert.equal(body.vendedor.userId, 'usr-owner');
  return body;
}

test('POST and PUT return schema-valid payloads and preserve original metadata', async () => {
  validates('PublicationWriteRequest', content);
  const created = await create();
  const response = await fetch(`${base}/${created.id}`, { method: 'PUT', headers, body: JSON.stringify({ ...content, titulo: 'Actualizada', precio: 0 }) });
  assert.equal(response.status, 200);
  const updated = await response.json();
  validates('PublicationDetailV1', updated);
  assert.equal(updated.titulo, 'Actualizada');
  assert.equal(updated.createdAt, created.createdAt);
  assert.deepEqual(updated.vendedor, created.vendedor);
  const detail = await fetch(`${base}/${created.id}`, { headers });
  validates('PublicationDetailV1', await detail.json());
  const page = await fetch(base, { headers });
  validates('PublicationPageV1', await page.json());
});

test('other principal cannot update; missing publication is 404', async () => {
  const created = await create();
  for (const [id, auth, status] of [[created.id, 'other-test', 403], ['missing', 'owner-test', 404]] as const) {
    const response = await fetch(`${base}/${id}`, { method: 'PUT', headers: { ...headers, Authorization: `Bearer ${auth}` }, body: JSON.stringify(content) });
    assert.equal(response.status, status);
    const error = await response.json();
    validates('ErrorEnvelope', error);
    assert.equal(error.error.correlationId, 'write-test');
  }
  const unchanged = await fetch(`${base}/${created.id}`, { headers });
  assert.deepEqual(await unchanged.json(), created);
});

test('write authentication precedes parsing even malformed JSON', async () => {
  for (const method of ['POST', 'PUT']) {
    const response = await fetch(method === 'POST' ? base : `${base}/missing`, {
      method, headers: { 'Content-Type': 'application/json', 'X-User-ID': 'usr-owner', 'X-Correlation-ID': 'no-auth' }, body: '{',
    });
    assert.equal(response.status, 401);
    validates('ErrorEnvelope', await response.json());
  }
});

test('body validation rejects mass assignment, missing required fields and wrong types', async () => {
  const created = await create();
  for (const body of [null, [], {}, { ...content, ownerId: 'usr-other' }, { ...content, vendedor: {} },
    { ...content, precio: '10' }, { ...content, precio: -1 }, { ...content, imagenes: null }, { ...content, titulo: '' }]) {
    for (const method of ['POST', 'PUT']) {
      const response = await fetch(method === 'POST' ? base : `${base}/${created.id}`, { method, headers, body: JSON.stringify(body) });
      assert.equal(response.status, 400);
      validates('ErrorEnvelope', await response.json());
    }
  }
  const unchanged = await fetch(`${base}/${created.id}`, { headers });
  assert.deepEqual(await unchanged.json(), created);
});

test('parser errors and large bodies produce correlated sanitized envelopes', async () => {
  for (const [body, status] of [['{private-data', 400], [JSON.stringify({ ...content, descripcion: 'x'.repeat(1024 * 1024) }), 413]] as const) {
    const response = await fetch(base, { method: 'POST', headers, body });
    assert.equal(response.status, status);
    const result = await response.json();
    validates('ErrorEnvelope', result);
    assert.equal(result.error.correlationId, 'write-test');
    assert.equal(JSON.stringify(result).includes('private-data'), false);
  }
});

test('CAT-001: compressed and malformed bodies are parsed safely with controlled errors', async () => {
  const { gzipSync, deflateSync, brotliCompressSync } = await import('node:zlib');
  const send = (body: Buffer | string, extra: Record<string, string>) =>
    fetch(base, { method: 'POST', headers: { ...headers, ...extra }, body: typeof body === 'string' ? body : new Uint8Array(body) });
  const json = JSON.stringify(content);
  // Valid compressed bodies are accepted.
  for (const [encoding, compress] of [['gzip', gzipSync], ['deflate', deflateSync], ['br', brotliCompressSync]] as const) {
    const response = await send(compress(Buffer.from(json)), { 'Content-Encoding': encoding });
    assert.equal(response.status, 201, encoding);
  }
  const cases: [Buffer | string, Record<string, string>, number, string][] = [
    // Plain trailing garbage after a gzip member is ignored by zlib; a corrupt second member is rejected.
    [Buffer.concat([gzipSync(Buffer.from(json)), Buffer.from([0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0xff, 0xde, 0xad])]),
      { 'Content-Encoding': 'gzip' }, 400, 'INVALID_PUBLICATION'],
    [Buffer.from('not-gzip-private-data'), { 'Content-Encoding': 'gzip' }, 400, 'INVALID_PUBLICATION'],
    // Small compressed payload that inflates beyond the 1 MiB limit.
    [gzipSync(Buffer.from(JSON.stringify({ ...content, descripcion: ' '.repeat(2 * 1024 * 1024) }))), { 'Content-Encoding': 'gzip' }, 413, 'PAYLOAD_TOO_LARGE'],
    [json, { 'Content-Encoding': 'compress' }, 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [json, { 'Content-Type': 'application/json; charset=latin9' }, 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ['', {}, 400, 'INVALID_PUBLICATION'],
    ['{"titulo": "private-data"', {}, 400, 'INVALID_PUBLICATION'],
    [json, { 'Content-Type': 'text/plain' }, 400, 'INVALID_PUBLICATION'],
  ];
  for (const [body, extra, status, code] of cases) {
    const response = await send(body, extra);
    assert.equal(response.status, status, `${JSON.stringify(extra)} ${status}`);
    const result = await response.json();
    validates('ErrorEnvelope', result);
    assert.equal(result.error.code, code);
    assert.equal(result.error.correlationId, 'write-test');
    assert.equal(JSON.stringify(result).includes('private-data'), false);
  }
  // GHSA-27r3-jxmh-p828: a complete compressed frame, then trailing bytes in a LATER chunk that reach the finished
  // decoder. With body-parser < 2.4.0 that error has no listener and terminates the process.
  const { request: httpRequest } = await import('node:http');
  for (const [encoding, compress] of [['deflate', deflateSync], ['gzip', gzipSync], ['br', brotliCompressSync]] as const) {
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(base, { method: 'POST', headers: { ...headers, 'Content-Encoding': encoding } }, res => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      });
      req.on('error', reject);
      req.write(compress(Buffer.from(json)));
      setTimeout(() => req.end(Buffer.from('trailing-bytes')), 50);
    });
    assert.ok([201, 400].includes(status), `${encoding} ${status}`);
  }
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal((await fetch(base, { headers })).status, 200, 'service still answers after trailing bytes');
  // The same parser protects PUT.
  const created = await create();
  const put = await fetch(`${base}/${created.id}`, { method: 'PUT', headers: { ...headers, 'Content-Encoding': 'gzip' },
    body: new Uint8Array(Buffer.concat([gzipSync(Buffer.from(json)), Buffer.from('x')])) });
  assert.equal(put.status, 400);
});

test('identity resolution mismatch fails closed', async () => {
  const response = await fetch(base, { method: 'POST', headers: { ...headers, Authorization: 'Bearer mismatch-test' }, body: JSON.stringify(content) });
  assert.equal(response.status, 500);
  validates('ErrorEnvelope', await response.json());
});

test('JSON Schema validator rejects broken dates, extra fields and incorrect numeric types', () => {
  const validate = ajv.compile({ $ref: `${root.$id}#/components/schemas/PublicationWriteRequest` });
  assert.equal(validate({ ...content, userId: 'forged' }), false);
  assert.equal(validate({ ...content, precio: '10' }), false);
  const date = ajv.compile({ type: 'string', format: 'date-time' });
  assert.equal(date('not-a-date'), false);
});
