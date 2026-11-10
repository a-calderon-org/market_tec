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

/**
 * Fake upstream: records calls; `script(url, init, n)` returns
 * {status, headers, body, setCookies, delayMs, hang, slowBody, java}.
 * `java: true` models a response produced by ms-users, whose CorrelationIdFilter echoes a valid inbound
 * X-Correlation-ID; without it the response models an APIM terminal deny (no X-Correlation-ID).
 * `slowBody: true` sends headers at once and a body that never ends (and ignores the abort signal).
 */
function upstream(script) {
  let clock = 0;
  const calls = [];
  const deps = {
    deadlineMs: 300, minForwardMs: 60, // scaled-down 38 s / 8 s so hanging calls end fast
    now: () => clock,
    randomId: () => `nonce${calls.length}`,
    fetch: (url, init) => new Promise((resolve, reject) => {
      calls.push({ url, init });
      const r = script(url, init, calls.length);
      const onAbort = () => reject(new Error('aborted'));
      init.signal.addEventListener('abort', onAbort, { once: true });
      if (r.hang) return; // never answers: only the abort settles it
      clock += r.delayMs || 0;
      const headers = new Headers(r.headers || {});
      for (const c of r.setCookies || []) headers.append('Set-Cookie', c);
      const sent = init.headers['x-correlation-id'];
      if (r.java && sent && /^[A-Za-z0-9._-]{1,128}$/.test(sent)) headers.set('X-Correlation-ID', sent);
      const body = r.slowBody
        ? new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"partial":')); } })
        : (r.body ?? '{}');
      resolve(new Response(body, { status: r.status ?? 200, headers }));
    }),
  };
  return { deps, calls, advance: (ms) => { clock += ms; } };
}

const APIM_DENY = { status: 401, body: '{"error":{"code":"REFRESH_INVALID"}}',
  headers: { 'content-type': 'application/json' } };

test.beforeEach(() => resetWarmState());

test('forwards only allow-listed headers to the APIM users API, keeping cookie, CSRF and user JWT', async () => {
  const up = upstream(() => ({ status: 200, body: '{"ok":true}', java: true }));
  await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps); // warm-up only
  const res = await handle(req('POST', '/api/users/v1/auth/refresh', {
    origin: ORIGIN, cookie: '__Host-mtec-refresh=x', 'x-csrf-token': 'c', 'content-type': 'application/json',
    authorization: 'Bearer swa-platform-token', 'x-mtec-authorization': 'Bearer user.jwt',
    'x-ms-client-principal': 'forged', 'x-user-id': '1',
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

test('never forwards the Authorization that Static Web Apps injects; without X-MTEC-Authorization none is sent',
  async () => {
    const up = upstream(() => ({ status: 401, body: '{}', java: true }));
    await handle(req('GET', '/api/users/v1/me/profile', {
      authorization: 'Bearer swa-platform-token', 'sec-fetch-site': 'same-origin',
    }), CONFIG, up.deps);
    assert.equal(up.calls.at(-1).init.headers.authorization, undefined);
    assert.equal(up.calls.at(-1).init.headers['x-mtec-authorization'], undefined);
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

test('Magic Link: request sets the email attempt cookie; confirm forwards it with CSRF and gets the session', async () => {
  const attempt = '__Host-mtec-email-attempt=' + '7'.repeat(64) + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600';
  const up = upstream((url) => (url.endsWith('/auth/email/requests')
    ? { status: 202, setCookies: [attempt], body: '{"status":"accepted"}', java: true,
      headers: { 'content-type': 'application/json' } }
    : { status: 200, setCookies: [REFRESH, '__Host-mtec-email-attempt=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0'],
      body: '{"token":"t"}', java: true, headers: { 'content-type': 'application/json' } }));
  await handle(req('POST', '/api/users/v1/auth/email/requests', { origin: ORIGIN }), CONFIG, up.deps); // warm-up only
  const requested = await handle(req('POST', '/api/users/v1/auth/email/requests', {
    origin: ORIGIN, 'content-type': 'application/json', 'x-mtec-client': 'web', 'sec-fetch-site': 'same-origin',
  }, '{"email":"ana@estudiantec.cr"}'), CONFIG, up.deps);
  assert.equal(requested.status, 202);
  assert.equal(up.calls.at(-1).url, 'https://markettec-api.azure-api.net/users/v1/auth/email/requests');
  assert.deepEqual(requested.cookies, [{ name: '__Host-mtec-email-attempt', value: '7'.repeat(64), path: '/',
    secure: true, httpOnly: true, sameSite: 'Lax', maxAge: 600 }]);
  const confirmed = await handle(req('POST', '/api/users/v1/auth/email/confirm', {
    origin: ORIGIN, 'content-type': 'application/json', 'x-mtec-client': 'web', 'sec-fetch-site': 'same-origin',
    cookie: `__Host-mtec-email-attempt=${'7'.repeat(64)}`, 'x-csrf-token': 'c'.repeat(64),
  }, `{"attemptId":"${'a'.repeat(32)}","token":"${'b'.repeat(64)}"}`), CONFIG, up.deps);
  assert.equal(confirmed.status, 200);
  const sent = up.calls.at(-1);
  assert.equal(sent.url, 'https://markettec-api.azure-api.net/users/v1/auth/email/confirm');
  assert.equal(sent.init.headers.cookie, `__Host-mtec-email-attempt=${'7'.repeat(64)}`);
  assert.equal(sent.init.headers['x-csrf-token'], 'c'.repeat(64));
  assert.deepEqual(confirmed.cookies.map((c) => [c.name, c.maxAge]),
    [['__Host-mtec-refresh', 28800], ['__Host-mtec-email-attempt', 0]]);
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

test('cold start: a write is never held for the warm-up; it is sent exactly once on the retry, once warm', async () => {
  const up = upstream((url, init, n) => (n === 1 ? { status: 404, delayMs: 200, java: true } : { status: 200 }));
  const cold = await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps);
  // MTEC-37: the warm-up succeeded, but the browser may have cancelled meanwhile: the write is NOT sent.
  assert.equal(cold.status, 503);
  assert.equal(JSON.parse(cold.body).error.code, 'BACKEND_WARMING');
  assert.deepEqual(up.calls.map((c) => c.init.method), ['GET']);
  const res = await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(up.calls.map((c) => [c.init.method, c.url.replace(CONFIG.upstream, '')]),
    [['GET', '/v1/auth/session'], ['POST', '/v1/auth/refresh']]);
  assert.equal(up.calls[0].init.headers.cookie, undefined); // the warm-up carries no credentials
  assert.equal(up.calls[0].init.headers.origin, ORIGIN); // same origin contract as a browser read
  assert.equal(up.calls[0].init.headers['x-correlation-id'], 'swa-warmup-nonce0');
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
  const up = upstream(() => ({ status: 404, delayMs: 260, java: true }));
  const res = await handle(req('PUT', '/api/users/v1/me/profile', { origin: ORIGIN }), CONFIG, up.deps);
  assert.equal(res.status, 503);
  assert.deepEqual(up.calls.map((c) => c.init.method), ['GET']);
});

test('a backend 5xx during warm-up is not taken as warm', async () => {
  const up = upstream(() => ({ status: 500, java: true }));
  const res = await handle(req('POST', '/api/users/v1/auth/logout', { origin: ORIGIN }), CONFIG, up.deps);
  assert.equal(JSON.parse(res.body).error.code, 'BACKEND_WARMING');
  assert.equal(up.calls.length, 1);
});

test('once warm, writes skip the warm-up until the TTL expires', async () => {
  const up = upstream(() => ({ status: 200, java: true }));
  await handle(req('GET', '/api/users/v1/auth/session', { 'x-correlation-id': 'c-1' }), CONFIG, up.deps);
  await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps);
  assert.deepEqual(up.calls.map((c) => c.init.method), ['GET', 'POST']);
  up.advance(121000);
  const expired = await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps);
  assert.equal(JSON.parse(expired.body).error.code, 'BACKEND_WARMING'); // warmed again, write not sent
  await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps);
  assert.deepEqual(up.calls.map((c) => c.init.method), ['GET', 'POST', 'GET', 'POST']);
});

test('a GET that outlives the deadline answers BACKEND_WARMING; a write timing out answers UPSTREAM_TIMEOUT', async () => {
  let up = upstream(() => ({ hang: true }));
  let res = await handle(req('GET', '/api/users/v1/auth/session'), CONFIG, up.deps);
  assert.equal(JSON.parse(res.body).error.code, 'BACKEND_WARMING');
  up = upstream((url, init, n) => (n === 1 ? { status: 404, java: true } : { hang: true }));
  resetWarmState();
  await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps); // warms, not sent
  res = await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps);
  assert.equal(res.status, 504);
  assert.equal(JSON.parse(res.body).error.code, 'UPSTREAM_TIMEOUT'); // never "safe to retry"
});

// MTEC-37: the SPA's remaining budget caps the proxy. Scaled: deadline 300, minForward 60, margin 20.
const BUDGET = 'x-mtec-client-budget-ms';
const scaled = (up) => ({ ...up.deps, clientMarginMs: 20 });

test('a write is never forwarded after the client budget: warm backend found too late answers BACKEND_WARMING', async () => {
  // ms-users answers the warm-up after 200 ms; a browser with only 150 ms left has already given up. The write is
  // NOT sent (and, since MTEC-37, it is not sent after any warm-up wait, with or without a budget).
  const up = upstream((url, init, n) => (n === 1 ? { status: 404, delayMs: 200, java: true } : { status: 200, java: true }));
  const res = await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN, [BUDGET]: '150' }), CONFIG,
    scaled(up));
  assert.equal(res.status, 503);
  assert.equal(JSON.parse(res.body).error.code, 'BACKEND_WARMING');
  assert.deepEqual(up.calls.map((c) => c.init.method), ['GET']); // the write was not sent: safe to retry
});

test('a hanging warm-up is abandoned within the client budget, not the proxy deadline', async () => {
  const up = upstream(() => ({ hang: true }));
  const started = Date.now();
  const res = await handle(req('POST', '/api/users/v1/auth/logout', { origin: ORIGIN, [BUDGET]: '120' }), CONFIG,
    scaled(up));
  assert.ok(Date.now() - started < 120, 'answered after the client budget');
  assert.equal(JSON.parse(res.body).error.code, 'BACKEND_WARMING');
  assert.deepEqual(up.calls.map((c) => c.init.method), ['GET']);
});

test('a budget too small for any write answers BACKEND_WARMING without contacting APIM', async () => {
  for (const [method, path] of [['POST', '/api/users/v1/auth/refresh'], ['GET', '/api/users/v1/auth/session']]) {
    const up = upstream(() => ({ status: 200, java: true }));
    const res = await handle(req(method, path, { origin: ORIGIN, [BUDGET]: '20' }), CONFIG, scaled(up));
    assert.equal(JSON.parse(res.body).error.code, 'BACKEND_WARMING');
    assert.equal(up.calls.length, 0);
  }
});

test('the client budget is never forwarded and a malformed one falls back to the proxy deadline', async () => {
  const up = upstream(() => ({ status: 200, java: true }));
  await handle(req('GET', '/api/users/v1/auth/session', { 'x-correlation-id': 'c-1' }), CONFIG, scaled(up)); // warm
  for (const value of ['5000', '-1', '1e9', '12345678', 'abc']) {
    const res = await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN, [BUDGET]: value }), CONFIG,
      scaled(up));
    assert.equal(res.status, 200, value);
  }
  for (const call of up.calls) assert.equal(call.init.headers[BUDGET], undefined);
});

test('a write still timing out inside the client budget answers UPSTREAM_TIMEOUT and is not marked retryable', async () => {
  const up = upstream((url, init, n) => (n === 1 ? { status: 404, java: true } : { hang: true }));
  await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN, [BUDGET]: '200' }), CONFIG, scaled(up));
  const res = await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN, [BUDGET]: '200' }), CONFIG,
    scaled(up));
  assert.equal(res.status, 504);
  assert.equal(JSON.parse(res.body).error.code, 'UPSTREAM_TIMEOUT');
  assert.deepEqual(up.calls.map((c) => c.init.method), ['GET', 'POST']); // sent exactly once, never resent
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

// --- MTEC-12/D04 PR #38 regressions: Origin on same-origin GET; warm-up evidence and full-body deadline ---

test('a same-origin GET without Origin reaches Java with the configured SWA origin', async () => {
  const up = upstream(() => ({ status: 401, body: '{"error":{"code":"SESSION_EXPIRED"}}', java: true }));
  const res = await handle(req('GET', '/api/users/v1/auth/session', { 'sec-fetch-site': 'same-origin',
    'x-mtec-client': 'web' }), CONFIG, up.deps);
  assert.equal(res.status, 401);
  assert.equal(up.calls.length, 1);
  assert.equal(up.calls[0].init.headers.origin, ORIGIN);
});

test('a same-origin GET with a valid cookie returns the session state and CSRF token from Java', async () => {
  const state = { session: { status: 'active' }, csrfToken: 'csrf-0123456789' };
  const up = upstream((url, init) => (init.headers.cookie === '__Host-mtec-refresh=AAAAAAAAAAAAAAAAAAAAAAAA'
    && init.headers.origin === ORIGIN
    ? { status: 200, body: JSON.stringify(state), headers: { 'content-type': 'application/json' }, java: true }
    : { status: 403, body: '{"error":{"code":"ORIGIN_DENIED"}}', java: true }));
  const res = await handle(req('GET', '/api/users/v1/auth/session', { 'sec-fetch-site': 'same-origin',
    cookie: '__Host-mtec-refresh=AAAAAAAAAAAAAAAAAAAAAAAA', 'x-mtec-client': 'web' }), CONFIG, up.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body.toString()), state);
  assert.equal(res.headers['content-type'], 'application/json');
});

test('Origin is only supplied for browser-asserted same-origin GETs; a foreign Origin is still rejected', async () => {
  const up = upstream(() => ({ status: 200, java: true }));
  for (const headers of [{ origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' },
    { origin: 'null' }, { 'sec-fetch-site': 'cross-site', cookie: '__Host-mtec-refresh=x' },
    { 'sec-fetch-site': 'same-site' }]) {
    const res = await handle(req('GET', '/api/users/v1/auth/session', headers), CONFIG, up.deps);
    assert.equal(res.status, 403, JSON.stringify(headers));
  }
  assert.equal(up.calls.length, 0);
  // Without Sec-Fetch-Site: same-origin nothing is invented (navigation `none`, or a non-browser client).
  for (const headers of [{}, { 'sec-fetch-site': 'none' }]) {
    await handle(req('GET', '/api/users/v1/auth/session', headers), CONFIG, up.deps);
    assert.equal(up.calls.at(-1).init.headers.origin, undefined, JSON.stringify(headers));
  }
  // Writes never get an Origin added: without one APIM/Java keep denying them.
  const write = upstream(() => ({ status: 200, java: true }));
  await handle(req('POST', '/api/users/v1/auth/logout', { 'sec-fetch-site': 'same-origin' }), CONFIG, write.deps);
  await handle(req('POST', '/api/users/v1/auth/logout', { 'sec-fetch-site': 'same-origin' }), CONFIG, write.deps);
  assert.equal(write.calls.at(-1).init.method, 'POST');
  assert.equal(write.calls.at(-1).init.headers.origin, undefined);
});

test('an APIM-generated 401 during warm-up does not certify a warm backend and the write is not sent', async () => {
  const up = upstream(() => APIM_DENY);
  const res = await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps);
  assert.equal(res.status, 503);
  assert.equal(JSON.parse(res.body).error.code, 'BACKEND_WARMING');
  assert.deepEqual(up.calls.map((c) => c.init.method), ['GET']);
  // A correlation id that does not match the nonce is not evidence either.
  const wrong = upstream(() => ({ status: 200, headers: { 'x-correlation-id': 'swa-warmup-other' } }));
  await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, wrong.deps);
  assert.deepEqual(wrong.calls.map((c) => c.init.method), ['GET']);
});

test('a forwarded APIM denial never marks the backend warm (the Java-echo case is the TTL test above)', async () => {
  const up = upstream((url, init) => (init.method === 'GET' ? APIM_DENY : { status: 200, java: true }));
  const read = await handle(req('GET', '/api/users/v1/auth/session', { 'x-correlation-id': 'c-1',
    'sec-fetch-site': 'same-origin' }), CONFIG, up.deps);
  assert.equal(read.status, 401); // the APIM denial is still returned to the browser unchanged
  await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps);
  assert.deepEqual(up.calls.map((c) => c.init.method), ['GET', 'GET']); // warm-up repeated, write held
});

test('a cold backend receives no premature write while the warm-up is uncertain', async () => {
  for (const script of [() => ({ hang: true }), () => ({ slowBody: true, java: true }), () => APIM_DENY,
    () => ({ status: 503, java: true }), () => ({ status: 200, java: true, delayMs: 250 })]) {
    resetWarmState();
    const up = upstream(script);
    const res = await handle(req('PUT', '/api/users/v1/me/profile', { origin: ORIGIN }, '{}'), CONFIG, up.deps);
    assert.equal(JSON.parse(res.body).error.code, 'BACKEND_WARMING');
    assert.deepEqual(up.calls.map((c) => c.init.method), ['GET']);
  }
});

test('a slow response body is bounded by the deadline, not only the headers', async () => {
  const up = upstream(() => ({ status: 200, slowBody: true, java: true }));
  const started = Date.now();
  const res = await handle(req('GET', '/api/users/v1/auth/session', { 'sec-fetch-site': 'same-origin' }),
    CONFIG, up.deps);
  assert.ok(Date.now() - started < 1000, 'deadline must cover the body');
  assert.equal(JSON.parse(res.body).error.code, 'BACKEND_WARMING');
  // The warm-up body is bounded too: the write budget is not spent waiting on it.
  resetWarmState();
  const warm = upstream(() => ({ status: 200, slowBody: true, java: true }));
  const write = await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, warm.deps);
  assert.equal(JSON.parse(write.body).error.code, 'BACKEND_WARMING');
  assert.deepEqual(warm.calls.map((c) => c.init.method), ['GET']);
});

test('a write that was sent is never repeated when its result is unknown', async () => {
  for (const second of [{ hang: true }, { status: 200, slowBody: true, java: true }]) {
    resetWarmState();
    const up = upstream((url, init, n) => (n === 1 ? { status: 404, java: true } : second));
    await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps); // warms only
    const res = await handle(req('POST', '/api/users/v1/auth/refresh', { origin: ORIGIN }), CONFIG, up.deps);
    assert.equal(res.status, 504);
    assert.equal(JSON.parse(res.body).error.code, 'UPSTREAM_TIMEOUT');
    assert.deepEqual(up.calls.map((c) => c.init.method), ['GET', 'POST']); // exactly one POST
  }
});

test('MTEC_D04_PROBE stays disabled unless set to exactly "enabled"', () => {
  for (const value of [undefined, '', 'true', '1', 'Enabled']) {
    assert.equal(probe(req('GET', '/api/d04-probe/cookie'), { MTEC_D04_PROBE: value }).status, 404);
  }
});

test('MTEC-37: a write cancelled by the browser during the warm-up is never forwarded afterwards', async () => {
  // The proxy cannot observe the browser aborting. Whatever the warm-up outcome, the write that arrived cold is
  // answered BACKEND_WARMING; only a NEW request from a client that is still waiting can carry the write.
  for (const script of [() => ({ status: 404, java: true, delayMs: 10 }), () => ({ status: 200, java: true })]) {
    resetWarmState();
    const up = upstream(script);
    for (const [method, path] of [['POST', '/api/users/v1/auth/logout'], ['PUT', '/api/users/v1/me/profile']]) {
      resetWarmState();
      const res = await handle(req(method, path, { origin: ORIGIN, [BUDGET]: '250' }, '{}'), CONFIG, scaled(up));
      assert.equal(JSON.parse(res.body).error.code, 'BACKEND_WARMING');
    }
    assert.deepEqual(up.calls.map((c) => c.init.method), ['GET', 'GET']);
  }
});
