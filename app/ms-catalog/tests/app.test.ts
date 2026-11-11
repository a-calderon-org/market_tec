import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
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

test('default server does not expose publications without explicit authenticated composition', async () => {
  const response = await fetch(`${baseUrl}/v1/publicaciones`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'ROUTE_NOT_FOUND');
});

test('the configured gateway credential is required before reaching staging routes', async () => {
  const gatewayKey = randomBytes(32).toString('base64url');
  const app = createApp({ port: 3000, serviceName: 'ms-catalog', logLevel: 'silent', gatewayKey });
  const gated = app.listen(0, '127.0.0.1');
  try {
    await once(gated, 'listening');
    const base = `http://127.0.0.1:${(gated.address() as AddressInfo).port}`;
    const header = 'X-MTEC-Catalog-Gateway-Key';
    const direct = await fetch(`${base}/v1/publicaciones`, { headers: { 'X-Correlation-ID': 'blocked-direct' } });
    assert.equal(direct.status, 403);
    assert.equal((await direct.json()).error.correlationId, 'blocked-direct');
    const wrong = await fetch(`${base}/health`, { headers: { [header]: randomBytes(32).toString('base64url') } });
    assert.equal(wrong.status, 403);
    await wrong.body?.cancel();
    const trusted = await fetch(`${base}/health`, { headers: { [header]: gatewayKey } });
    assert.equal(trusted.status, 200);
    await trusted.body?.cancel();
  } finally {
    await new Promise<void>((resolve, reject) => gated.close(error => error ? reject(error) : resolve()));
  }
});
