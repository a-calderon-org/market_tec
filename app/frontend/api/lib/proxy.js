'use strict';
const crypto = require('node:crypto');
/**
 * Same-origin proxy (MTEC-12/D04): https://<swa-origin>/api/users/v1/... -> <APIM>/users/v1/...
 *
 * The SPA and its API share one origin, so the `__Host-` cookies that ms-users sets are first-party host-only
 * cookies of the Static Web App. APIM keeps every check (Origin, cookie shape, CSRF, CORS, JWT) and its own
 * managed-identity authentication to Container Apps; this proxy only narrows what reaches APIM.
 *
 * Static Web Apps cuts every /api request at 45 s, and ms-users scales from zero (26-45 s observed). A
 * non-idempotent request (POST/PUT) is therefore forwarded only once ms-users is known to be warm; otherwise the
 * proxy answers 503 BACKEND_WARMING **without sending it**, so the client may retry it safely. A GET that does
 * not finish in time also answers 503 BACKEND_WARMING (reads are safe to repeat).
 *
 * "Warm" needs proof that ms-users itself answered, not just APIM: its CorrelationIdFilter echoes any valid
 * inbound X-Correlation-ID on every response (including its own 4xx), while APIM's terminal denials
 * (return-response) never carry one. The warm-up therefore sends a fresh nonce and is accepted only when that
 * exact value comes back with a non-5xx status. Every deadline covers the whole response, body included.
 */

const PATH = /^\/api\/users(\/v1(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}){1,6})$/;
const QUERY = /^\?[A-Za-z0-9=&._-]{1,256}$/;
const METHODS = new Set(['GET', 'POST', 'PUT']);
const REQUEST_HEADERS = ['accept', 'authorization', 'content-type', 'cookie', 'origin', 'x-csrf-token',
  'x-mtec-client', 'x-correlation-id'];
const RESPONSE_HEADERS = ['content-type', 'cache-control', 'www-authenticate', 'retry-after', 'x-correlation-id',
  'vary'];
const DEADLINE_MS = 38000; // below the 45 s Static Web Apps limit, leaving room for the function itself
const MIN_FORWARD_MS = 8000; // a warm ms-users answers in < 1 s; never start a write with less than this left
const WARM_TTL_MS = 120000; // well below the 300 s Container Apps scale-in cooldown
const WARM_PROBE_PATH = '/v1/auth/session'; // idempotent read that reaches ms-users through APIM
const CORRELATION = /^[A-Za-z0-9._-]{1,128}$/; // what ms-users echoes back unchanged

let warmUntil = 0;

function configFromEnv(env) {
  return { upstream: env.MTEC_USERS_UPSTREAM, publicOrigin: env.MTEC_PUBLIC_ORIGIN };
}

function json(status, code, extra = {}) {
  return {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      ...extra },
    body: JSON.stringify({ error: { code } }),
  };
}

function validHttpsOrigin(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validUpstream(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.search && !url.hash && !url.username && !url.password
      && `${url.origin}${url.pathname}` === value && !value.endsWith('/');
  } catch {
    return false;
  }
}

function header(req, name) {
  const value = (req.headers || {})[name];
  return typeof value === 'string' ? value : undefined;
}

/** null when allowed, otherwise the denial response. */
function checkRequest(req, url, config) {
  if (!METHODS.has(req.method)) return json(405, 'METHOD_NOT_ALLOWED');
  if (!PATH.test(url.pathname) || url.pathname.includes('/.') || url.hash) return json(404, 'ROUTE_NOT_FOUND');
  if (url.search && !QUERY.test(url.search)) return json(400, 'INVALID_REQUEST');
  // Same-origin only: a cross-site or same-site (sibling *.azurestaticapps.net) caller never reaches APIM.
  const fetchSite = header(req, 'sec-fetch-site');
  if (fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none') return json(403, 'ORIGIN_DENIED');
  const origin = header(req, 'origin');
  if (origin !== undefined && origin !== config.publicOrigin) return json(403, 'ORIGIN_DENIED');
  return null;
}

function forwardHeaders(req, config) {
  const headers = {};
  for (const name of REQUEST_HEADERS) {
    const value = header(req, name);
    if (value !== undefined) headers[name] = value;
  }
  // Browsers may omit Origin on a same-origin GET, and ms-users answers 403 ORIGIN_DENIED without it. Only a
  // browser-asserted same-origin read (Sec-Fetch-Site cannot be set by page script) gets the configured origin;
  // a foreign Origin was already rejected by checkRequest and anything else is forwarded as it came.
  if (req.method === 'GET' && headers.origin === undefined && header(req, 'sec-fetch-site') === 'same-origin') {
    headers.origin = config.publicOrigin;
  }
  return headers;
}

/** True only when ms-users echoed the correlation id that was sent (APIM denials never carry one). */
function answeredByBackend(res, sentCorrelationId) {
  return res.status < 500 && typeof sentCorrelationId === 'string' && CORRELATION.test(sentCorrelationId)
    && res.headers.get('x-correlation-id') === sentCorrelationId;
}

/** Set-Cookie -> Azure Functions cookie object. Cookies with Domain are dropped (ms-users never sets one). */
function parseSetCookie(line) {
  const [pair, ...attrs] = line.split(';').map((part) => part.trim());
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  const cookie = { name: pair.slice(0, eq), value: pair.slice(eq + 1) };
  for (const attr of attrs) {
    const i = attr.indexOf('=');
    const key = (i < 0 ? attr : attr.slice(0, i)).toLowerCase();
    const val = i < 0 ? '' : attr.slice(i + 1);
    if (key === 'domain') return null;
    if (key === 'path') cookie.path = val;
    else if (key === 'secure') cookie.secure = true;
    else if (key === 'httponly') cookie.httpOnly = true;
    else if (key === 'samesite') {
      const v = val.toLowerCase();
      if (v === 'lax') cookie.sameSite = 'Lax';
      else if (v === 'strict') cookie.sameSite = 'Strict';
      else if (v === 'none') cookie.sameSite = 'None';
      else return null;
    } else if (key === 'max-age') {
      if (!/^-?[0-9]{1,10}$/.test(val)) return null;
      cookie.maxAge = Number(val);
    } else if (key === 'expires') {
      const date = new Date(val);
      if (Number.isNaN(date.getTime())) return null;
      cookie.expires = date;
    }
  }
  if (cookie.name.startsWith('__Host-') && !(cookie.secure && cookie.path === '/')) return null;
  return cookie;
}

/** Response and full body within `timeoutMs`; rejects on timeout while waiting for headers *or* body. */
async function callUpstream(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('deadline'));
    }, Math.max(1, timeoutMs));
  });
  try {
    const read = (async () => {
      const res = await fetchImpl(url, { ...init, signal: controller.signal, redirect: 'manual' });
      return { res, body: Buffer.from(await res.arrayBuffer()) };
    })();
    read.catch(() => {}); // settled by `expired` first: its later rejection is not unhandled
    return await Promise.race([read, expired]);
  } finally {
    clearTimeout(timer);
  }
}

async function ensureWarm(deps, config, remainingMs) {
  if (deps.now() < warmUntil) return true;
  if (remainingMs <= 0) return false;
  const nonce = `swa-warmup-${deps.randomId()}`;
  try {
    const { res } = await callUpstream(deps.fetch, `${config.upstream}${WARM_PROBE_PATH}`, {
      method: 'GET',
      headers: { origin: config.publicOrigin, 'x-mtec-client': 'swa-proxy-warmup', 'x-correlation-id': nonce },
    }, remainingMs);
    if (!answeredByBackend(res, nonce)) return false;
    warmUntil = deps.now() + WARM_TTL_MS;
    return true;
  } catch {
    return false;
  }
}

function toResponse({ res, body }) {
  const headers = { 'X-Content-Type-Options': 'nosniff' };
  for (const name of RESPONSE_HEADERS) {
    const value = res.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  const lines = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const cookies = lines.map(parseSetCookie).filter(Boolean);
  return { status: res.status, headers, body, cookies, isRaw: true };
}

const DEFAULT_DEPS = { fetch: globalThis.fetch, now: Date.now, randomId: () => crypto.randomUUID(),
  deadlineMs: DEADLINE_MS, minForwardMs: MIN_FORWARD_MS };

async function handle(req, config, overrides = {}) {
  const deps = { ...DEFAULT_DEPS, ...overrides };
  const start = deps.now();
  if (!validUpstream(config.upstream) || !validHttpsOrigin(config.publicOrigin)) return json(503, 'PROXY_UNCONFIGURED');
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return json(400, 'INVALID_REQUEST');
  }
  const denied = checkRequest(req, url, config);
  if (denied) return denied;

  const target = `${config.upstream}${PATH.exec(url.pathname)[1]}${url.search}`;
  const init = { method: req.method, headers: forwardHeaders(req, config) };
  if (req.method !== 'GET') init.body = req.rawBody ?? '';
  const left = () => deps.deadlineMs - (deps.now() - start);
  const warming = json(503, 'BACKEND_WARMING', { 'Retry-After': '3' });

  if (req.method !== 'GET') {
    const warm = await ensureWarm(deps, config, left() - deps.minForwardMs);
    if (!warm || left() < deps.minForwardMs) return warming; // the write was NOT sent: safe to retry
  }
  let upstream;
  try {
    upstream = await callUpstream(deps.fetch, target, init, left());
  } catch {
    // A GET is safe to repeat. A write that was sent may have been processed: never "warming", never resent.
    return req.method === 'GET' ? warming : json(504, 'UPSTREAM_TIMEOUT');
  }
  if (answeredByBackend(upstream.res, init.headers['x-correlation-id'])) warmUntil = deps.now() + WARM_TTL_MS;
  return toResponse(upstream);
}

/** D-04 browser probe: sets / reports a `__Host-` cookie through the same Set-Cookie translation as the proxy. */
function probe(req, env) {
  if (env.MTEC_D04_PROBE !== 'enabled') return json(404, 'ROUTE_NOT_FOUND');
  if (req.method === 'POST') {
    if (header(req, 'origin') !== env.MTEC_PUBLIC_ORIGIN) return json(403, 'ORIGIN_DENIED');
    const cookie = parseSetCookie('__Host-mtec-probe=probe-0123456789abcdef; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=300');
    return { status: 204, headers: { 'Cache-Control': 'no-store' }, cookies: [cookie] };
  }
  const cookies = header(req, 'cookie') || '';
  const count = cookies.split(';').filter((c) => c.trim().startsWith('__Host-mtec-probe=')).length;
  return { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ probe: { cookieCount: count, authorizationPresent: header(req, 'authorization') !== undefined,
      origin: header(req, 'origin') ?? null, secFetchSite: header(req, 'sec-fetch-site') ?? null } }) };
}

function resetWarmState() {
  warmUntil = 0;
}

module.exports = { handle, probe, parseSetCookie, configFromEnv, resetWarmState, DEADLINE_MS, MIN_FORWARD_MS };
