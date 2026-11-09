'use strict';
/**
 * Same-origin proxy for publications: https://<swa-origin>/api/catalog/v1/publicaciones[...] -> <APIM>/v1/...
 *
 * The business API (APIM `markettec-api-v1`) requires an APIM subscription key and a Google ID token
 * (`validate-jwt`). The key lives only in the Function's app settings and is added here; it never reaches the
 * browser. The SPA sends the Google ID token in X-MTEC-Google-Authorization (Static Web Apps replaces
 * `Authorization` before the Function runs) and the proxy hands it to APIM as `Authorization`.
 *
 * What never crosses this proxy: cookies (the browser sends the ms-users `__Host-` cookies to every same-origin
 * path, they are dropped here), the internal ms-users JWT (X-MTEC-Authorization), CSRF tokens and any header not in
 * the allow-list. Only the publication operations the SPA uses are accepted.
 */

const PATH = /^\/api\/catalog(\/v1\/publicaciones(?:\/[A-Za-z0-9_-]{1,64})?)$/;
const LIST = /^\/v1\/publicaciones$/;
const QUERY = /^\?[A-Za-z0-9=&._-]{1,256}$/;
const GOOGLE_HEADER = 'x-mtec-google-authorization';
const BEARER = /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const REQUEST_HEADERS = ['accept', 'content-type'];
const RESPONSE_HEADERS = ['content-type', 'www-authenticate', 'retry-after'];
const DEADLINE_MS = 38000; // below the 45 s Static Web Apps limit

function configFromEnv(env) {
  return {
    upstream: env.MTEC_CATALOG_UPSTREAM,
    subscriptionKey: env.MTEC_CATALOG_SUBSCRIPTION_KEY,
    publicOrigin: env.MTEC_PUBLIC_ORIGIN,
  };
}

function json(status, code) {
  return {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    body: JSON.stringify({ error: { code } }),
  };
}

function header(req, name) {
  const value = (req.headers || {})[name];
  return typeof value === 'string' ? value : undefined;
}

function validOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value;
  } catch {
    return false;
  }
}

function validUpstream(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Exact allow-list: list (GET, POST) and detail (GET). */
function allowed(method, path) {
  if (method === 'GET') return true;
  return method === 'POST' && LIST.test(path);
}

async function handle(req, config, deps = { fetch: globalThis.fetch, deadlineMs: DEADLINE_MS }) {
  if (!validUpstream(config.upstream) || !validOrigin(config.publicOrigin)
    || typeof config.subscriptionKey !== 'string' || !config.subscriptionKey.trim()) {
    return json(503, 'PROXY_UNCONFIGURED');
  }
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return json(400, 'INVALID_REQUEST');
  }
  const match = PATH.exec(url.pathname);
  if (!match || url.hash) return json(404, 'ROUTE_NOT_FOUND');
  const path = match[1];
  if (!allowed(req.method, path)) return json(405, 'METHOD_NOT_ALLOWED');
  if (url.search && !(req.method === 'GET' && LIST.test(path) && QUERY.test(url.search))) {
    return json(400, 'INVALID_REQUEST');
  }
  const fetchSite = header(req, 'sec-fetch-site');
  if (fetchSite !== undefined && fetchSite !== 'same-origin') return json(403, 'ORIGIN_DENIED');
  const origin = header(req, 'origin');
  if (origin !== undefined && origin !== config.publicOrigin) return json(403, 'ORIGIN_DENIED');
  const google = header(req, GOOGLE_HEADER);
  if (google === undefined || !BEARER.test(google)) return json(401, 'AUTH_REQUIRED');

  const headers = { authorization: google, 'ocp-apim-subscription-key': config.subscriptionKey };
  for (const name of REQUEST_HEADERS) {
    const value = header(req, name);
    if (value !== undefined) headers[name] = value;
  }
  const init = { method: req.method, headers, redirect: 'manual' };
  if (req.method === 'POST') init.body = req.rawBody ?? '';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.deadlineMs);
  try {
    const res = await deps.fetch(`${config.upstream}${path}${url.search}`, { ...init, signal: controller.signal });
    const body = Buffer.from(await res.arrayBuffer());
    const out = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    for (const name of RESPONSE_HEADERS) {
      const value = res.headers.get(name);
      if (value !== null) out[name] = value;
    }
    return { status: res.status, headers: out, body, isRaw: true };
  } catch {
    return json(504, 'UPSTREAM_TIMEOUT');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { handle, configFromEnv, DEADLINE_MS };
