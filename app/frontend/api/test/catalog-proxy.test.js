'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { handle, DEADLINE_MS } = require('../lib/catalog-proxy');

const ORIGIN = 'https://victorious-beach-0a55f0c1e.2.azurestaticapps.net';
const CONFIG = { upstream: 'https://markettec-api.azure-api.net', subscriptionKey: 'test-key', publicOrigin: ORIGIN };
const GOOGLE = 'Bearer aaa.bbb.ccc';

function req(method, path, headers = {}, rawBody) {
  return { method, url: `${ORIGIN}${path}`, headers, rawBody };
}

function upstream(status = 200, body = '{"items":[]}', hang = false) {
  const calls = [];
  return {
    calls,
    deps: {
      deadlineMs: 50,
      fetch: (url, init) => new Promise((resolve, reject) => {
        calls.push({ url, init });
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        if (!hang) resolve(new Response(body, { status, headers: { 'content-type': 'application/json',
          'set-cookie': 'x=1', 'x-internal': 'y' } }));
      }),
    },
  };
}

test('deadline fits the 45 s Static Web Apps limit', () => assert.ok(DEADLINE_MS <= 40000));

test('lists publications with the server-side key and the Google token, never cookies or the internal JWT', async () => {
  const up = upstream();
  const res = await handle(req('GET', '/api/catalog/v1/publicaciones?page=1&pageSize=12', {
    origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'x-mtec-google-authorization': GOOGLE,
    'x-mtec-authorization': 'Bearer internal.jwt.value', cookie: '__Host-mtec-refresh=abc', 'x-csrf-token': 'csrf',
    authorization: 'Bearer swa.platform.token', accept: 'application/json',
  }), CONFIG, up.deps);
  assert.equal(res.status, 200);
  assert.equal(up.calls.length, 1);
  assert.equal(up.calls[0].url, 'https://markettec-api.azure-api.net/v1/publicaciones?page=1&pageSize=12');
  assert.deepEqual(up.calls[0].init.headers, {
    authorization: GOOGLE, 'ocp-apim-subscription-key': 'test-key', accept: 'application/json',
  });
  assert.equal(res.headers['set-cookie'], undefined);
  assert.equal(res.headers['x-internal'], undefined);
  assert.equal(res.cookies, undefined);
});

test('forwards detail reads and publication creation', async () => {
  const up = upstream(201, '');
  const detail = await handle(req('GET', '/api/catalog/v1/publicaciones/PUB-001',
    { 'x-mtec-google-authorization': GOOGLE }), CONFIG, up.deps);
  const created = await handle(req('POST', '/api/catalog/v1/publicaciones',
    { origin: ORIGIN, 'x-mtec-google-authorization': GOOGLE, 'content-type': 'application/json' }, '{"titulo":"x"}'),
  CONFIG, up.deps);
  assert.equal(detail.status, 201);
  assert.equal(created.status, 201);
  assert.equal(up.calls[1].url, 'https://markettec-api.azure-api.net/v1/publicaciones');
  assert.equal(up.calls[1].init.body, '{"titulo":"x"}');
});

test('rejects everything outside the publication allow-list without calling APIM', async () => {
  const up = upstream();
  const cases = [
    ['GET', '/api/catalog/v1/chats', 404],
    ['GET', '/api/catalog/v1/usuarios/USR-001', 404],
    ['GET', '/api/catalog/v1/usuarios/USR-001/publicaciones', 404],
    ['GET', '/api/catalog/v1/publicaciones/%2e%2e', 404],
    ['GET', '/api/catalog/v1/publicaciones/a/b', 404],
    ['GET', '/api/catalog/publicaciones', 404],
    ['PUT', '/api/catalog/v1/publicaciones/PUB-001', 405],
    ['DELETE', '/api/catalog/v1/publicaciones/PUB-001', 405],
    ['POST', '/api/catalog/v1/publicaciones/PUB-001', 405],
    ['GET', '/api/catalog/v1/publicaciones/PUB-001?x=1', 400],
    ['GET', '/api/catalog/v1/publicaciones?a=<b>', 400],
  ];
  for (const [method, path, status] of cases) {
    const res = await handle(req(method, path, { 'x-mtec-google-authorization': GOOGLE }), CONFIG, up.deps);
    assert.equal(res.status, status, `${method} ${path}`);
  }
  assert.equal(up.calls.length, 0);
});

test('denies foreign callers and requests without a Google token', async () => {
  const up = upstream();
  const path = '/api/catalog/v1/publicaciones';
  const denied = [
    [{ origin: 'https://evil.example', 'x-mtec-google-authorization': GOOGLE }, 403],
    [{ 'sec-fetch-site': 'same-site', 'x-mtec-google-authorization': GOOGLE }, 403],
    [{ 'sec-fetch-site': 'cross-site', 'x-mtec-google-authorization': GOOGLE }, 403],
    [{ origin: ORIGIN }, 401],
    [{ origin: ORIGIN, 'x-mtec-google-authorization': 'Basic abc' }, 401],
    [{ origin: ORIGIN, authorization: GOOGLE }, 401],
  ];
  for (const [headers, status] of denied) {
    assert.equal((await handle(req('GET', path, headers), CONFIG, up.deps)).status, status);
  }
  assert.equal(up.calls.length, 0);
});

test('fails closed when unconfigured and answers 504 on an upstream timeout', async () => {
  const up = upstream(200, '', true);
  const headers = { 'x-mtec-google-authorization': GOOGLE };
  for (const config of [{ ...CONFIG, subscriptionKey: '' }, { ...CONFIG, upstream: 'http://markettec-api.azure-api.net' },
    { ...CONFIG, upstream: 'https://markettec-api.azure-api.net/v1' }, { ...CONFIG, publicOrigin: undefined }]) {
    assert.equal((await handle(req('GET', '/api/catalog/v1/publicaciones', headers), config, up.deps)).status, 503);
  }
  assert.equal(up.calls.length, 0);
  const res = await handle(req('GET', '/api/catalog/v1/publicaciones', headers), CONFIG, up.deps);
  assert.equal(res.status, 504);
});
