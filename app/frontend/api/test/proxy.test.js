'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { handle, probe, parseSetCookie, resetWarmState, DEADLINE_MS, MIN_FORWARD_MS } = require('../lib/proxy');

test('production budget fits the 45 s Static Web Apps limit', () => {
  assert.ok(DEADLINE_MS <= 40000 && MIN_FORWARD_MS < DEADLINE_MS / 2);
});

const ORIGIN = 'https://victorious-beach-0a55f0c1e.2.azurestaticapps.net';
const CONFIG = { upstream: 'https://markettec-api.azure-api.net/users', publicOrigin: ORIGIN };
const REFRESH = '__Host-mtec-refresh=AAAAAAAAAAAAAAAAAAAAAAAA; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=28800';

function req(method, path, headers = {}, rawBody) {
  return { method, url: `${ORIGIN}${path}`, headers, rawBody };
}

/** Fake upstream: records calls; `script(url, init)` returns {status, headers, body, setCookies, delayMs}. */
function upstream(script) {
  let clock = 0;
  const calls = [];
  const deps = {
    deadlineMs: 300, minForwardMs: 60, // scaled-down 38 s / 8 s so hanging calls end fast
    now: () => clock,
    fetch: (url, init) => new Promise((resolve, reject) => {
      calls.push({ url, init });
      const r = script(url, init, calls.length);
      const onAbort = () => reject(new Error('aborted'));
      init.signal.addEventListener('abort', onAbort, { once: true });
      if (r.hang) return; // never answers: only the abort settles it
      clock += r.delayMs || 0;
      const headers = new Headers(r.headers || {});
      for (const c of r.setCookies || []) headers.append('Set-Cookie', c);
      resolve(new Response(r.body ?? '{}', { status: r.status ?? 200, headers }));
    }),
  };
  return { deps, calls, advance: (ms) => { clock += ms; } };
}

test.beforeEach(() => resetWarmState());

test('forwards only allow-listed headers to the APIM users API, keeping cookie, CSRF and user JWT', async () => {
  const up = upstream(() => ({ status: 200, body: '{"ok":true}' }));
  const res = await handle(req('POST', '/api/users/v1/auth/refresh', {
    origin: ORIGIN, cookie: '__Host-mtec-refresh=x', 'x-csrf-token': 'c', 'content-type': 'application/json',
    authorization: 'Bearer user.jwt', 'x-ms-client-principal': 'forged', 'x-user-id': '1',
    'x-mtec-user-authorization': 'Bearer smuggled', 'x-forwarded-for': '1.2.3.4', 'sec-fetch-site': 'same-origin',
  }, '{"mode":"rotate"}'), CONFIG, up.deps);
  assert.equal(res.status, 200);
  const sent = up.calls.at(-1);
  assert.equal(sent.url, 'https://markettec-api.azure-api.net/users/v1/auth/refresh');
  assert.deepEqual(Object.keys(sent.init.headers).sort(),
    ['authorization', 'content-type', 'cookie', 'origin', 'x-csrf-token']);
  assert.equal(sent.init.headers.authorization, 'Bearer user.jwt');
  assert.equal(sent.init.body, '{"mode":"rotate"}');
  assert.equal(sent.init.redirect, 'manual');
});

test('returns __Host- cookies as host-only first-party cookies of the SPA origin', async () => {
  const up = upstream(() => ({ status: 200, setCookies: [REFRESH, 'other=1; Domain=evil.example; Path=/'],
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': ORIGIN, server: 'x' } }));
  const res = await handle(req('GET', '/api/users/v1/auth/session'), CONFIG, up.deps);
  assert.deepEqual(res.cookies, [{ name: '__Host-mtec-refresh', value: 'AAAAAAAAAAAAAAAAAAAAAAAA', path: '/',
    secure: true, httpOnly: true, sameSite: 'Lax', maxAge: 28800 }]);
  assert.equal(res.headers['access-control-allow-origin'], undefined); // same-origin: no CORS headers
  assert.equal(res.headers.server, undefined);
  assert.equal(res.headers['content-type'], 'application/json');
});

test('Set-Cookie translation refuses Domain, malformed __Host- and unknown SameSite', () => {
  assert.equal(parseSetCookie('__Host-a=1; Path=/; Secure; Domain=x.net'), null);
  assert.equal(parseSetCookie('__Host-a=1; Path=/app; Secure'), null);
  assert.equal(parseSetCookie('__Host-a=1; Path=/'), null);
  assert.equal(parseSetCookie('__Host-a=1; Path=/; Secure; SameSite=Weird'), null);
  assert.deepEqual(parseSetCookie('__Host-mtec-refresh=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0'),
    { name: '__Host-mtec-refresh', value: '', path: '/', secure: true, httpOnly: true, sameSite: 'Lax', maxAge: 0 });
});

test('cross-site, same-site sibling and foreign Origin never reach APIM', async () => {
  const up = upstream(() => ({ status: 200 }));
  for (const headers of [{ 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' },
    { origin: 'https://victorious-beach-0a55f0c1e-12.westus2.2.azurestaticapps.net' }, { origin: 'null' }]) {
    const res = await handle(req('POST', '/api/users/v1/auth/logout', headers), CONFIG, up.deps);
    assert.equal(res.status, 403, JSON.stringify(headers));
  }
  assert.equal(up.calls.length, 0);
});

test('only /api/users/v1/... with plain segments and GET/POST/PUT are proxied', async () => {
  const up = upstream(() => ({ status: 200 }));
  for (const [method, path, status] of [['DELETE', '/api/users/v1/me/profile', 405],
    ['GET', '/api/users/health', 404], ['GET', '/api/users/v1/../admin', 404], ['GET', '/api/users/v1/%2e%2e/x', 404],
    ['GET', '/api/users/v1/.well-known/jwks.json', 404], ['GET', '/api/users/v1/auth/session?a=<b>', 400],
    ['GET', '/api/other/v1/x', 404]]) {
    const res = await handle(req(method, path), CONFIG, up.deps);
    assert.equal(res.status, status, `${method} ${path}`);
  }
  assert.equal(up.calls.length, 0);
});

test('fails closed without a valid upstream or public origin', async () => {
  const up = upstream(() => ({ status: 200 }));
  for (const config of [{}, { ...CONFIG, upstream: 'http://markettec-api.azure-api.net/users' },
    { ...CONFIG, upstream: 'https://markettec-api.azure-api.net/users/' }, { ...CONFIG, publicOrigin: '*' }]) {
    assert.equal((await handle(req('GET', '/api/users/v1/auth/session'), config, up.deps)).status, 503);
  }
  assert.equal(up.calls.length, 0);
});

test('cold start: a write is held until ms-users is warm, then sent exactly once', async () => {
  const up = upstream((url, init, n) => (n === 1 ? { status: 404, delayMs: 200 } : { status: 200 }));
  const res = await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(up.calls.map((c) => [c.init.method, c.url.replace(CONFIG.upstream, '')]),
    [['GET', '/v1/auth/session'], ['POST', '/v1/auth/refresh']]);
  assert.equal(up.calls[0].init.headers.cookie, undefined); // the warm-up carries no credentials
});

test('cold start beyond the budget: 503 BACKEND_WARMING and the write is NOT sent', async () => {
  const up = upstream(() => ({ hang: true }));
  const res = await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps);
  assert.equal(res.status, 503);
  assert.equal(JSON.parse(res.body).error.code, 'BACKEND_WARMING');
  assert.equal(res.headers['Retry-After'], '3');
  assert.deepEqual(up.calls.map((c) => c.init.method), ['GET']);
});

test('warm-up that ends too late for a safe write still does not send it', async () => {
  const up = upstream(() => ({ status: 404, delayMs: 260 }));
  const res = await handle(req('PUT', '/api/users/v1/me/profile', { origin: ORIGIN }), CONFIG, up.deps);
  assert.equal(res.status, 503);
  assert.deepEqual(up.calls.map((c) => c.init.method), ['GET']);
});

test('a backend 5xx during warm-up is not taken as warm', async () => {
  const up = upstream(() => ({ status: 500 }));
  const res = await handle(req('POST', '/api/users/v1/auth/logout', { origin: ORIGIN }), CONFIG, up.deps);
  assert.equal(JSON.parse(res.body).error.code, 'BACKEND_WARMING');
  assert.equal(up.calls.length, 1);
});

test('once warm, writes skip the warm-up until the TTL expires', async () => {
  const up = upstream(() => ({ status: 200 }));
  await handle(req('GET', '/api/users/v1/auth/session'), CONFIG, up.deps);
  await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps);
  assert.deepEqual(up.calls.map((c) => c.init.method), ['GET', 'POST']);
  up.advance(121000);
  await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps);
  assert.deepEqual(up.calls.map((c) => c.init.method), ['GET', 'POST', 'GET', 'POST']);
});

test('a GET that outlives the deadline answers BACKEND_WARMING; a write timing out answers UPSTREAM_TIMEOUT', async () => {
  let up = upstream(() => ({ hang: true }));
  let res = await handle(req('GET', '/api/users/v1/auth/session'), CONFIG, up.deps);
  assert.equal(JSON.parse(res.body).error.code, 'BACKEND_WARMING');
  up = upstream((url, init, n) => (n === 1 ? { status: 404 } : { hang: true }));
  resetWarmState();
  res = await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps);
  assert.equal(res.status, 504);
  assert.equal(JSON.parse(res.body).error.code, 'UPSTREAM_TIMEOUT'); // never "safe to retry"
});

test('probe is disabled unless explicitly enabled and only sets a cookie for its own origin', () => {
  assert.equal(probe(req('POST', '/api/d04-probe/cookie', { origin: ORIGIN }), {}).status, 404);
  const env = { MTEC_D04_PROBE: 'enabled', MTEC_PUBLIC_ORIGIN: ORIGIN };
  assert.equal(probe(req('POST', '/api/d04-probe/cookie', { origin: 'https://evil.example' }), env).status, 403);
  const set = probe(req('POST', '/api/d04-probe/cookie', { origin: ORIGIN }), env);
  assert.equal(set.cookies[0].name, '__Host-mtec-probe');
  const read = probe(req('GET', '/api/d04-probe/cookie', { cookie: 'a=1; __Host-mtec-probe=x' }), env);
  assert.equal(JSON.parse(read.body).probe.cookieCount, 1);
});
