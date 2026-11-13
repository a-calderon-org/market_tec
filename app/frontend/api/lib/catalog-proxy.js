'use strict';
/**
 * Same-origin proxy for publications, two separate modes (never mixed):
 *
 * - `google` (legacy, production): https://<swa-origin>/api/catalog/v1/publicaciones[...] -> <APIM>/v1/...
 * - `internal-jwt` (ms-catalog): https://<swa-origin>/api/catalog-v2/v1/publicaciones[...] -> <catalog>/v1/...
 *   The SPA sends the ms-users internal JWT in X-MTEC-Authorization; it is forwarded as `Authorization` ONLY to
 *   MTEC_CATALOG_V2_UPSTREAM. The Google ID token header is never read in this mode, and the internal JWT is never
 *   read in `google` mode. ms-catalog validates the JWT itself (APIM, if placed in front, may validate it too).
 *
 * The description below documents the legacy `google` mode.
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

const PUBLICATIONS = '(\\/v1\\/publicaciones(?:\\/[A-Za-z0-9_-]{1,64})?)$';
const LIST = /^\/v1\/publicaciones$/;
const DETAIL = /^\/v1\/publicaciones\/[A-Za-z0-9_-]{1,64}$/;
const IMAGE_UPLOAD = '/v1/images/upload-url';
const MODES = {
  google: { path: new RegExp(`^\\/api\\/catalog${PUBLICATIONS}`), credentialHeader: 'x-mtec-google-authorization',
    keyRequired: true, update: false, basePath: false },
  'internal-jwt': { path: /^\/api\/catalog-v2(\/v1\/(?:publicaciones(?:\/[A-Za-z0-9_-]{1,64})?|images\/upload-url))$/, credentialHeader: 'x-mtec-authorization',
    keyRequired: false, update: true, basePath: true },
};
const QUERY = /^\?[A-Za-z0-9=&._-]{1,256}$/;
const FILTER_QUERY_KEYS = new Set(['page', 'pageSize', 'q', 'categoria', 'sortBy', 'sortDirection', 'precioMin', 'precioMax']);
const BEARER = /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const REQUEST_HEADERS = ['accept', 'content-type'];
const RESPONSE_HEADERS = ['content-type', 'www-authenticate', 'retry-after'];
const DEADLINE_MS = 38000; // below the 45 s Static Web Apps limit

function configFromEnv(env) {
  return {
    mode: 'google',
    upstream: env.MTEC_CATALOG_UPSTREAM,
    subscriptionKey: env.MTEC_CATALOG_SUBSCRIPTION_KEY,
    publicOrigin: env.MTEC_PUBLIC_ORIGIN,
  };
}

/** ms-catalog with the internal JWT. The subscription key is optional (only if an APIM API requires one). */
function configV2FromEnv(env) {
  return {
    mode: 'internal-jwt',
    upstream: env.MTEC_CATALOG_V2_UPSTREAM,
    subscriptionKey: env.MTEC_CATALOG_V2_SUBSCRIPTION_KEY,
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

/** https origin (legacy) or, in internal-jwt mode, origin + base path (APIM API suffix) without trailing slash. */
function validUpstream(value, allowBasePath) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && (url.origin === value || (allowBasePath && `${url.origin}${url.pathname}` === value && !value.endsWith('/')));
  } catch {
    return false;
  }
}

/** Exact allow-list: list (GET, POST) and detail (GET; PUT only in internal-jwt mode). */
function allowed(method, path, mode) {
  if (path === IMAGE_UPLOAD) return mode.update && method === 'POST';
  if (method === 'GET') return true;
  if (method === 'PUT') return mode.update && DETAIL.test(path);
  return method === 'POST' && LIST.test(path);
}

function validListQuery(url, internalJwt) {
  if (!internalJwt) return QUERY.test(url.search);
  if (url.search.length > 4000) return false;
  const seen = new Set();
  for (const key of url.searchParams.keys()) {
    if (!FILTER_QUERY_KEYS.has(key) || seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

async function handle(req, config, deps = { fetch: globalThis.fetch, deadlineMs: DEADLINE_MS }) {
  const mode = MODES[config.mode ?? 'google'];
  const hasKey = typeof config.subscriptionKey === 'string' && !!config.subscriptionKey.trim();
  if (!mode || !validUpstream(config.upstream, mode?.basePath) || !validOrigin(config.publicOrigin)
    || (mode.keyRequired && !hasKey)) {
    return json(503, 'PROXY_UNCONFIGURED');
  }
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return json(400, 'INVALID_REQUEST');
  }
  const match = mode.path.exec(url.pathname);
  if (!match || url.hash) return json(404, 'ROUTE_NOT_FOUND');
  const path = match[1];
  if (!allowed(req.method, path, mode)) return json(405, 'METHOD_NOT_ALLOWED');
  if (url.search && !(req.method === 'GET' && LIST.test(path) && validListQuery(url, config.mode === 'internal-jwt'))) {
    return json(400, 'INVALID_REQUEST');
  }
  const fetchSite = header(req, 'sec-fetch-site');
  if (fetchSite !== undefined && fetchSite !== 'same-origin') return json(403, 'ORIGIN_DENIED');
  const origin = header(req, 'origin');
  if (origin !== undefined && origin !== config.publicOrigin) return json(403, 'ORIGIN_DENIED');
  const credential = header(req, mode.credentialHeader);
  if (credential === undefined || !BEARER.test(credential)) return json(401, 'AUTH_REQUIRED');

  const headers = { authorization: credential };
  if (hasKey) headers['ocp-apim-subscription-key'] = config.subscriptionKey;
  for (const name of REQUEST_HEADERS) {
    const value = header(req, name);
    if (value !== undefined) headers[name] = value;
  }
  const init = { method: req.method, headers, redirect: 'manual' };
  if (req.method === 'POST' || req.method === 'PUT') init.body = req.rawBody ?? '';

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

module.exports = { handle, configFromEnv, configV2FromEnv, DEADLINE_MS };
