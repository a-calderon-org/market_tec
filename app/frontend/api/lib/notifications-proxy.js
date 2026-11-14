'use strict';
/**
 * Same-origin proxy for the ms-notifications history (MTEC-25):
 * https://<swa-origin>/api/notifications/v1/notifications[...] -> <MTEC_NOTIFICATIONS_UPSTREAM>/v1/notifications[...]
 *
 * The SPA sends the ms-users internal JWT in X-MTEC-Authorization (Static Web Apps replaces `Authorization` before
 * the Function runs); it is forwarded as `Authorization` ONLY to MTEC_NOTIFICATIONS_UPSTREAM, and ms-notifications
 * validates it itself. Only the two operations the SPA uses are accepted: the paginated list (GET) and marking one
 * notification as read (PATCH). The SSE stream is not proxied: a Function cannot hold a connection beyond the 45 s
 * Static Web Apps limit, so the SPA polls the list instead.
 *
 * What never crosses this proxy: cookies (the ms-users `__Host-` cookies reach every same-origin path and are dropped
 * here), CSRF tokens and any header not in the allow-list.
 */

const PATH = /^\/api\/notifications(\/v1\/notifications(?:\/[0-9a-fA-F-]{36}\/read)?)$/;
const LIST = '/v1/notifications';
const READ = /^\/v1\/notifications\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/read$/;
const PAGE_SIZE = /^(?:[1-9]|[1-9][0-9]|100)$/;
const CURSOR = /^[A-Za-z0-9_-]{1,2048}$/;
const BEARER = /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const REQUEST_HEADERS = ['accept'];
const RESPONSE_HEADERS = ['content-type', 'www-authenticate', 'retry-after', 'x-correlation-id'];
const DEADLINE_MS = 38000; // below the 45 s Static Web Apps limit

function configFromEnv(env) {
  return {
    upstream: env.MTEC_NOTIFICATIONS_UPSTREAM,
    subscriptionKey: env.MTEC_NOTIFICATIONS_SUBSCRIPTION_KEY,
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

/** https origin, optionally with a base path (the APIM API suffix), without credentials, query or trailing slash. */
function validUpstream(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && (url.origin === value || (`${url.origin}${url.pathname}` === value && !value.endsWith('/')));
  } catch {
    return false;
  }
}

/** Only `pageSize` and `cursor`, each at most once, with the formats ms-notifications accepts. */
function validListQuery(url) {
  if (!url.search) return true;
  if (url.search.length > 2200) return false;
  const seen = new Set();
  for (const [key, value] of url.searchParams) {
    if (seen.has(key)) return false;
    seen.add(key);
    if (key === 'pageSize' ? !PAGE_SIZE.test(value) : key !== 'cursor' || !CURSOR.test(value)) return false;
  }
  return true;
}

async function handle(req, config, deps = { fetch: globalThis.fetch, deadlineMs: DEADLINE_MS }) {
  if (!validUpstream(config.upstream) || !validOrigin(config.publicOrigin)) {
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
  const isList = path === LIST;
  if (!isList && !READ.test(path)) return json(404, 'ROUTE_NOT_FOUND');
  if (req.method !== (isList ? 'GET' : 'PATCH')) return json(405, 'METHOD_NOT_ALLOWED');
  if (isList ? !validListQuery(url) : url.search) return json(400, 'INVALID_REQUEST');

  const fetchSite = header(req, 'sec-fetch-site');
  if (fetchSite !== undefined && fetchSite !== 'same-origin') return json(403, 'ORIGIN_DENIED');
  const origin = header(req, 'origin');
  if (origin !== undefined && origin !== config.publicOrigin) return json(403, 'ORIGIN_DENIED');
  const credential = header(req, 'x-mtec-authorization');
  if (credential === undefined || !BEARER.test(credential)) return json(401, 'AUTH_REQUIRED');

  const headers = { authorization: credential };
  if (typeof config.subscriptionKey === 'string' && config.subscriptionKey.trim()) {
    headers['ocp-apim-subscription-key'] = config.subscriptionKey;
  }
  for (const name of REQUEST_HEADERS) {
    const value = header(req, name);
    if (value !== undefined) headers[name] = value;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.deadlineMs);
  try {
    const res = await deps.fetch(`${config.upstream}${path}${url.search}`, {
      method: req.method, headers, redirect: 'manual', signal: controller.signal,
    });
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
