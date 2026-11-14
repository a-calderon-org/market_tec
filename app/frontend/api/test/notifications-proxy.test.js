'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { handle, configFromEnv, DEADLINE_MS } = require('../lib/notifications-proxy');

const ORIGIN = 'https://victorious-beach-0a55f0c1e.2.azurestaticapps.net';
const CONFIG = { upstream: 'https://markettec-api.azure-api.net/notifications', publicOrigin: ORIGIN };
const JWT = 'Bearer internal.jwt.value';
const ID = '0124185f-275f-41da-89b4-8d3952b97d28';
const HEADERS = { origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'x-mtec-authorization': JWT };

function req(method, path, headers = HEADERS) {
  return { method, url: `${ORIGIN}${path}`, headers };
}

function upstream(status = 200, body = '{"items":[],"nextCursor":null}', hang = false) {
  const calls = [];
  return {
    calls,
    deps: {
      deadlineMs: 50,
      fetch: (url, init) => new Promise((resolve, reject) => {
        calls.push({ url, init });
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        if (!hang) resolve(new Response(body, { status, headers: { 'content-type': 'application/json',
          'x-correlation-id': 'corr-1', 'set-cookie': 'x=1', 'x-internal': 'y' } }));
      }),
    },
  };
}

test('deadline fits the 45 s Static Web Apps limit', () => assert.ok(DEADLINE_MS <= 40000));

test('reads its configuration from the Function app settings', () => {
  assert.deepEqual(configFromEnv({ MTEC_NOTIFICATIONS_UPSTREAM: CONFIG.upstream, MTEC_PUBLIC_ORIGIN: ORIGIN }),
    { upstream: CONFIG.upstream, subscriptionKey: undefined, publicOrigin: ORIGIN });
});

test('lists notifications with the internal JWT as Authorization, never cookies or other headers', async () => {
  const up = upstream();
  const res = await handle(req('GET', '/api/notifications/v1/notifications?pageSize=20&cursor=abc_-1', {
    ...HEADERS, cookie: '__Host-mtec-refresh=abc', 'x-csrf-token': 'csrf', authorization: 'Bearer swa.platform.token',
    accept: 'application/json',
  }), CONFIG, up.deps);
  assert.equal(res.status, 200);
  assert.equal(up.calls.length, 1);
  assert.equal(up.calls[0].url, `${CONFIG.upstream}/v1/notifications?pageSize=20&cursor=abc_-1`);
  assert.equal(up.calls[0].init.method, 'GET');
  assert.equal(up.calls[0].init.redirect, 'manual');
  assert.deepEqual(up.calls[0].init.headers, { authorization: JWT, accept: 'application/json' });
  assert.equal(res.headers['x-correlation-id'], 'corr-1');
  assert.equal(res.headers['set-cookie'], undefined);
  assert.equal(res.headers['x-internal'], undefined);
});

test('marks one notification as read with PATCH', async () => {
  const up = upstream(200, '{"isRead":true}');
  const res = await handle(req('PATCH', `/api/notifications/v1/notifications/${ID}/read`), CONFIG, up.deps);
  assert.equal(res.status, 200);
  assert.equal(up.calls[0].url, `${CONFIG.upstream}/v1/notifications/${ID}/read`);
  assert.equal(up.calls[0].init.method, 'PATCH');
  assert.equal(up.calls[0].init.body, undefined);
});

test('adds the APIM subscription key only when it is configured', async () => {
  const up = upstream();
  await handle(req('GET', '/api/notifications/v1/notifications'), { ...CONFIG, subscriptionKey: 'k' }, up.deps);
  assert.equal(up.calls[0].init.headers['ocp-apim-subscription-key'], 'k');
});

test('rejects other routes, methods and queries without calling the upstream', async () => {
  const up = upstream();
  const cases = [
    ['GET', '/api/notifications/v1/notifications/stream', 404],
    ['GET', '/api/notifications/v1/other', 404],
    ['GET', '/api/notifications/v1/notifications/not-a-uuid-not-a-uuid-not-a-uuid-xxxx/read', 404],
    ['POST', '/api/notifications/v1/notifications', 405],
    ['DELETE', `/api/notifications/v1/notifications/${ID}/read`, 405],
    ['GET', `/api/notifications/v1/notifications/${ID}/read`, 405],
    ['PATCH', '/api/notifications/v1/notifications', 405],
    ['GET', '/api/notifications/v1/notifications?pageSize=0', 400],
    ['GET', '/api/notifications/v1/notifications?pageSize=101', 400],
    ['GET', '/api/notifications/v1/notifications?pageSize=1&pageSize=2', 400],
    ['GET', '/api/notifications/v1/notifications?cursor=a%2Fb', 400],
    ['GET', '/api/notifications/v1/notifications?userId=x', 400],
    ['PATCH', `/api/notifications/v1/notifications/${ID}/read?x=1`, 400],
  ];
  for (const [method, path, status] of cases) {
    assert.equal((await handle(req(method, path), CONFIG, up.deps)).status, status, `${method} ${path}`);
  }
  assert.equal(up.calls.length, 0);
});

test('requires a same-origin request with a bearer JWT in X-MTEC-Authorization', async () => {
  const up = upstream();
  const path = '/api/notifications/v1/notifications';
  assert.equal((await handle(req('GET', path, { ...HEADERS, 'sec-fetch-site': 'cross-site' }), CONFIG, up.deps)).status, 403);
  assert.equal((await handle(req('GET', path, { ...HEADERS, origin: 'https://evil.example' }), CONFIG, up.deps)).status, 403);
  assert.equal((await handle(req('GET', path, { origin: ORIGIN }), CONFIG, up.deps)).status, 401);
  assert.equal((await handle(req('GET', path, { ...HEADERS, 'x-mtec-authorization': 'Basic abc' }), CONFIG, up.deps)).status, 401);
  assert.equal((await handle(req('GET', path, { origin: ORIGIN, authorization: JWT }), CONFIG, up.deps)).status, 401);
  assert.equal(up.calls.length, 0);
});

test('fails closed when the upstream or the public origin is not configured', async () => {
  const path = '/api/notifications/v1/notifications';
  for (const config of [
    { ...CONFIG, upstream: undefined },
    { ...CONFIG, upstream: 'http://markettec-api.azure-api.net/notifications' },
    { ...CONFIG, upstream: `${CONFIG.upstream}/` },
    { ...CONFIG, upstream: `${CONFIG.upstream}?x=1` },
    { ...CONFIG, publicOrigin: undefined },
  ]) {
    assert.equal((await handle(req('GET', path), config, upstream().deps)).status, 503);
  }
});

test('passes upstream errors through and times out a hung upstream', async () => {
  const unauthorized = await handle(req('GET', '/api/notifications/v1/notifications'), CONFIG,
    upstream(401, '{"error":{"code":"UNAUTHENTICATED"}}').deps);
  assert.equal(unauthorized.status, 401);
  const hung = await handle(req('GET', '/api/notifications/v1/notifications'), CONFIG, upstream(200, '', true).deps);
  assert.equal(hung.status, 504);
});
