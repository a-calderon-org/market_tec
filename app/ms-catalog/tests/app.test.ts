import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';

let server: Server;
let baseUrl: string;

before(async () => {
  const app = createApp({ port: 3000, serviceName: 'ms-catalog', logLevel: 'silent' });
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
});

test('GET /health returns technical health and propagates correlation ID', async () => {
  const response = await fetch(`${baseUrl}/health`, {
    headers: { 'X-Correlation-ID': 'catalog-test' },
  });
  const body = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-correlation-id'), 'catalog-test');
  assert.equal(body.status, 'UP');
  assert.equal(body.service, 'ms-catalog');
  assert.equal(body.correlationId, 'catalog-test');
  assert.equal(typeof body.timestamp, 'number');
});

test('unknown route returns the standard error envelope', async () => {
  const response = await fetch(`${baseUrl}/does-not-exist`);
  const body = await response.json() as { error: Record<string, unknown> };

  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'ROUTE_NOT_FOUND');
  assert.equal(body.error.correlationId, response.headers.get('x-correlation-id'));
  assert.equal(typeof body.error.timestamp, 'number');
});
