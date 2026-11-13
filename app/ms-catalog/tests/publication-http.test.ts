import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { PublicationService } from '../src/application/use-cases/publication-service.js';
import { InMemoryPublicationRepository } from '../src/adapters/out/in-memory-publication-repository.js';

let server: Server;
let base: string;
let id: string;
const settings = { port: 3000, serviceName: 'ms-catalog', logLevel: 'silent' as const };
const headers = { Authorization: 'Bearer test-only', 'X-Correlation-ID': 'http-publications' };
before(async () => {
  let sequence = 0;
  const service = new PublicationService(new InMemoryPublicationRepository(),
    { async assertUsableBy(_owner, images) { assert.equal(images.length, 0); } },
    () => `pub-${++sequence}`, () => new Date('2026-11-06T12:00:00Z'), 'https://example.invalid/placeholder.svg');
  for (const price of [20, 10, 30]) {
    const result = await service.create({ userId: 'usr-test', seller: { id: 101, nombre: 'Ana', carrera: 'Computación', verificado: true } },
      { categoria: 'Electrónica', subcategoria: '', titulo: `Laptop ${price}`, descripcion: 'Prueba', precio: price,
        condicion: null, ubicacion: '', imagenes: [] });
    id = result.id;
  }
  const app = createApp(settings, { publications: service, async authenticate(request) {
    // Fake authentication exists only in this test suite.
    if (request.headers.authorization === 'Bearer throw') throw new Error('secret-auth-details');
    return request.headers.authorization === 'Bearer test-only' ? { userId: 'usr-test' } : undefined;
  } });
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/publicaciones`;
});
after(async () => { await new Promise<void>((resolve, reject) => {
  server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
}); });

test('HTTP listing combines filters, sorting and pagination with flat Angular payload', async () => {
  const response = await fetch(`${base}?q=lapTOP&categoria=Electr%C3%B3nica&precioMin=1e1&precioMax=3e%2B1&sortBy=precio&sortDirection=asc&page=2&pageSize=1`, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-correlation-id'), headers['X-Correlation-ID']);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['items', 'page', 'pageSize', 'totalRecords']);
  assert.equal(body.totalRecords, 3);
  assert.equal(body.items[0].precio, 20);
  assert.equal(body.page, 2);
  assert.equal(body.pageSize, 1);
  assert.equal('imagenes' in body.items[0], false);
  assert.equal(body.items[0].vendedor.id, 101);
  assert.equal(typeof body.items[0].fechaPublicacion, 'string');
});

test('HTTP detail returns original compatibility fields and missing resource gives correlated 404', async () => {
  const response = await fetch(`${base}/${id}`, { headers });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.id, id);
  assert.deepEqual(body.imagenes, []);
  assert.equal(Date.parse(body.fechaPublicacion), body.createdAt * 1000);
  const missing = await fetch(`${base}/missing`, { headers });
  assert.equal(missing.status, 404);
  const error = (await missing.json()).error;
  assert.equal(error.code, 'PUBLICATION_NOT_FOUND');
  assert.equal(error.correlationId, headers['X-Correlation-ID']);
  assert.equal(Number.isInteger(error.timestamp), true);
});

for (const query of ['page=0', 'page=1.5', 'pageSize=101', 'page=1&page=2', 'page=', 'page=1e2', 'precioMin=NaN',
  'precioMin=-1', 'precioMax=1e999', 'precioMin=30&precioMax=10', 'sortBy=bad', 'sortDirection=bad', 'sortDir=asc', 'q[x]=a', 'userId=usr-test']) {
  test(`HTTP rejects invalid query: ${query}`, async () => {
    const response = await fetch(`${base}?${query}`, { headers });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'INVALID_PUBLICATION');
  });
}

test('missing credentials and spoofed identity headers cannot authenticate list or detail', async () => {
  for (const suffix of ['', `/${id}`, '?page=invalid']) {
    const response = await fetch(`${base}${suffix}`, { headers: { 'X-User-ID': 'usr-test', 'X-Correlation-ID': 'unauthorized' } });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
    assert.equal(body.error.correlationId, 'unauthorized');
  }
});

test('authentication failures do not expose internal exception details', async () => {
  const response = await fetch(base, { headers: { Authorization: 'Bearer throw' } });
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes('secret-auth-details'), false);
});

test('out of range page returns empty items with unchanged count', async () => {
  const response = await fetch(`${base}?page=100`, { headers });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.totalRecords, 3);
  assert.deepEqual(body.items, []);
});
