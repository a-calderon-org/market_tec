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

test('only the internal JWT proxy forwards POST for an image upload grant', async () => {
  const up = upstream();
  const config = { ...CONFIG, mode: 'internal-jwt', upstream: CONFIG.upstream + '/catalog-stg' };
  const headers = { origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json',
    'x-mtec-authorization': 'Bearer internal.jwt.value' };
  const path = '/api/catalog-v2/v1/images/upload-url';
  const body = '{"filename":"a.png","contentType":"image/png"}';
  assert.equal((await handle(req('GET', path, headers), config, up.deps)).status, 405);
  assert.equal((await handle(req('POST', path + '?other=1', headers, body), config, up.deps)).status, 400);
  assert.equal((await handle(req('POST', path.replace('catalog-v2', 'catalog'), headers, body), CONFIG, up.deps)).status, 404);
  const response = await handle(req('POST', path, headers, body), config, up.deps);
  assert.equal(response.status, 200);
  assert.equal(up.calls.length, 1);
  assert.equal(String(up.calls[0].url), config.upstream + '/v1/images/upload-url');
  assert.equal(new Headers(up.calls[0].init.headers).get('authorization'), 'Bearer internal.jwt.value');
});

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

// internal-jwt mode: /api/catalog-v2 -> ms-catalog with the ms-users internal JWT, never the Google token.
const V2 = { mode: 'internal-jwt', upstream: 'https://ca-ms-catalog.example.test', publicOrigin: ORIGIN };
const INTERNAL = 'Bearer internal.jwt.value';

test('internal-jwt mode forwards only the internal JWT to the ms-catalog upstream, with PUT on detail', async () => {
  const up = upstream();
  const base = { origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'x-mtec-authorization': INTERNAL,
    'x-mtec-google-authorization': GOOGLE, cookie: '__Host-mtec-refresh=abc', 'x-csrf-token': 'csrf',
    authorization: 'Bearer swa.platform.token', 'content-type': 'application/json' };
  const list = await handle(req('GET', '/api/catalog-v2/v1/publicaciones?page=1', base), V2, up.deps);
  const created = await handle(req('POST', '/api/catalog-v2/v1/publicaciones', base, '{"titulo":"x"}'), V2, up.deps);
  const updated = await handle(req('PUT', '/api/catalog-v2/v1/publicaciones/PUB-1', base, '{"titulo":"y"}'), V2, up.deps);
  assert.deepEqual([list.status, created.status, updated.status], [200, 200, 200]);
  assert.deepEqual(up.calls.map((c) => [c.init.method, c.url]), [
    ['GET', 'https://ca-ms-catalog.example.test/v1/publicaciones?page=1'],
    ['POST', 'https://ca-ms-catalog.example.test/v1/publicaciones'],
    ['PUT', 'https://ca-ms-catalog.example.test/v1/publicaciones/PUB-1'],
  ]);
  for (const call of up.calls) {
    assert.deepEqual(call.init.headers, { authorization: INTERNAL, 'content-type': 'application/json' });
  }
  assert.equal(up.calls[2].init.body, '{"titulo":"y"}');
});

test('internal-jwt list forwards encoded filters and rejects repeated or unknown query keys', async () => {
  const up = upstream();
  const path = '/api/catalog-v2/v1/publicaciones';
  const headers = { 'x-mtec-authorization': INTERNAL };
  const query = '?page=2&pageSize=12&categoria=Tutor%C3%ADa&q=C%2B%2B%20%26%20c%C3%A1lculo&sortBy=precio&sortDirection=asc&precioMin=0&precioMax=1e%2B6';
  assert.equal((await handle(req('GET', path + query, headers), V2, up.deps)).status, 200);
  assert.equal(up.calls[0].url, `${V2.upstream}/v1/publicaciones${query}`);
  for (const invalid of ['?q=a&%71=b', '?sortDir=asc', '?q=' + 'a'.repeat(4000)]) {
    assert.equal((await handle(req('GET', path + invalid, headers), V2, up.deps)).status, 400);
  }
  assert.equal(up.calls.length, 1);
});

test('internal-jwt mode adds an optional APIM key and accepts an API base path upstream', async () => {
  const up = upstream();
  const config = { ...V2, upstream: 'https://markettec-api.azure-api.net/catalog-v2', subscriptionKey: 'k2' };
  await handle(req('GET', '/api/catalog-v2/v1/publicaciones/PUB-1', { 'x-mtec-authorization': INTERNAL }), config, up.deps);
  assert.equal(up.calls[0].url, 'https://markettec-api.azure-api.net/catalog-v2/v1/publicaciones/PUB-1');
  assert.equal(up.calls[0].init.headers['ocp-apim-subscription-key'], 'k2');
});

test('modes never cross: each route and credential header belongs to exactly one mode', async () => {
  const up = upstream();
  const cases = [
    // A Google token alone never authenticates against ms-catalog, nor the internal JWT against the legacy API.
    [V2, 'GET', '/api/catalog-v2/v1/publicaciones', { 'x-mtec-google-authorization': GOOGLE }, 401],
    [CONFIG, 'GET', '/api/catalog/v1/publicaciones', { 'x-mtec-authorization': INTERNAL }, 401],
    [V2, 'GET', '/api/catalog/v1/publicaciones', { 'x-mtec-authorization': INTERNAL }, 404],
    [CONFIG, 'GET', '/api/catalog-v2/v1/publicaciones', { 'x-mtec-google-authorization': GOOGLE }, 404],
    [V2, 'GET', '/api/catalog-v2/v1/publicaciones', { 'x-mtec-authorization': INTERNAL, 'x-user-id': 'u' }, 504],
    [V2, 'PUT', '/api/catalog-v2/v1/publicaciones', { 'x-mtec-authorization': INTERNAL }, 405],
    [V2, 'DELETE', '/api/catalog-v2/v1/publicaciones/PUB-1', { 'x-mtec-authorization': INTERNAL }, 405],
    [V2, 'GET', '/api/catalog-v2/v1/chats', { 'x-mtec-authorization': INTERNAL }, 404],
    [V2, 'GET', '/api/catalog-v2/v1/publicaciones', { origin: 'https://evil.example', 'x-mtec-authorization': INTERNAL }, 403],
    [{ ...V2, upstream: 'https://ca-ms-catalog.example.test/' }, 'GET', '/api/catalog-v2/v1/publicaciones',
      { 'x-mtec-authorization': INTERNAL }, 503],
  ];
  const hanging = upstream(200, '', true);
  for (const [config, method, path, headers, status] of cases) {
    const res = await handle(req(method, path, headers), config, hanging.deps);
    assert.equal(res.status, status, `${method} ${path}`);
  }
  // The only forwarded request (504 case) carried no identity header besides the internal JWT.
  assert.equal(hanging.calls.length, 1);
  assert.deepEqual(hanging.calls[0].init.headers, { authorization: INTERNAL });
  assert.equal(up.calls.length, 0);
});
