import { cosmosOrigin, defaultCatalogContainers, type CosmosConnectionSettings } from './cosmos-catalog.js';

export interface Settings {
  readonly port: number;
  readonly serviceName: string;
  readonly logLevel: LogLevel;
  // Present only when the business routes are explicitly configured (see loadPublicationSettings).
  readonly publications?: PublicationSettings;
  readonly cosmos?: CosmosConnectionSettings;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface PublicationSettings {
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
  // Exactly one key source: the published JWKS URI or a reviewed JWKS document.
  readonly jwksUri?: string;
  readonly jwksJson?: string;
  // ms-users `GET /v1/me/profile` (through its gateway) used to build the seller snapshot.
  readonly usersProfileUrl: string;
  readonly store: 'memory' | 'cosmos';
  readonly placeholderImageUrl: string;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

function parseLogLevel(value: string | undefined): LogLevel {
  const logLevel = value?.trim().toLowerCase() || 'info';
  if (!['debug', 'info', 'warn', 'error', 'silent'].includes(logLevel)) {
    throw new Error('LOG_LEVEL must be one of debug, info, warn, error or silent');
  }
  return logLevel as LogLevel;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

// HTTPS only; plain HTTP is accepted solely for loopback (local integration against a local ms-users).
function secureUrl(value: string | undefined, name: string): string {
  try {
    const url = new URL(value ?? '');
    const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname));
    if (!secure || url.username || url.password || url.hash) throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${name} must be an https URL (http only for loopback)`);
  }
}

/**
 * Bounded delegation (approved 2026-11-10): the user's verified JWT may be sent ONLY to ms-users
 * `GET /v1/me/profile` through the authorized gateway, i.e. exactly `<issuer>/v1/me/profile` (the issuer is the
 * ms-users API on the gateway). Plain-HTTP loopback is accepted only for local integration tests.
 */
function profileUrl(value: string | undefined, issuer: string): string {
  const url = new URL(secureUrl(value, 'CATALOG_USERS_PROFILE_URL'));
  const expected = `${issuer.replace(/\/+$/, '')}/v1/me/profile`;
  const loopback = url.protocol === 'http:' && url.pathname.endsWith('/v1/me/profile');
  if (url.search || (url.toString() !== expected && !loopback)) {
    throw new Error(`CATALOG_USERS_PROFILE_URL must be exactly ${expected}`);
  }
  return url.toString();
}

const PUBLICATION_VARIABLES = ['CATALOG_JWT_ISSUER', 'CATALOG_JWT_AUDIENCE', 'CATALOG_JWT_JWKS_URI', 'CATALOG_JWT_JWKS_JSON',
  'CATALOG_USERS_PROFILE_URL', 'CATALOG_PUBLICATIONS_STORE', 'CATALOG_PLACEHOLDER_IMAGE_URL'];
const COSMOS_VARIABLES = ['CATALOG_COSMOS_ENDPOINT', 'CATALOG_COSMOS_DATABASE', 'CATALOG_COSMOS_KEY',
  'CATALOG_COSMOS_MANAGED_IDENTITY_CLIENT_ID', 'CATALOG_COSMOS_PUBLICATIONS_CONTAINER',
  'CATALOG_COSMOS_CHATS_CONTAINER', 'CATALOG_COSMOS_MESSAGES_CONTAINER'];

function loadCosmosSettings(environment: NodeJS.ProcessEnv, store?: PublicationSettings['store']): CosmosConnectionSettings | undefined {
  if (store !== 'cosmos') {
    if (COSMOS_VARIABLES.some(name => environment[name]?.trim())) {
      throw new Error('CATALOG_COSMOS settings require CATALOG_PUBLICATIONS_STORE=cosmos');
    }
    return undefined;
  }
  const endpoint = cosmosOrigin(environment.CATALOG_COSMOS_ENDPOINT?.trim());
  const database = environment.CATALOG_COSMOS_DATABASE?.trim();
  const containers = {
    publications: environment.CATALOG_COSMOS_PUBLICATIONS_CONTAINER?.trim() || defaultCatalogContainers.publications,
    chats: environment.CATALOG_COSMOS_CHATS_CONTAINER?.trim() || defaultCatalogContainers.chats,
    messages: environment.CATALOG_COSMOS_MESSAGES_CONTAINER?.trim() || defaultCatalogContainers.messages,
  };
  const names = Object.values(containers);
  const validName = (name: string) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(name);
  if (!database || !validName(database) || names.some(name => !validName(name)) || new Set(names).size !== 3) {
    throw new Error('Set a valid CATALOG_COSMOS_DATABASE and three distinct, valid container names');
  }
  const key = environment.CATALOG_COSMOS_KEY?.trim();
  const clientId = environment.CATALOG_COSMOS_MANAGED_IDENTITY_CLIENT_ID?.trim();
  if (key && clientId) throw new Error('Configure either a Cosmos key or a managed identity client ID');
  if (clientId && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(clientId)) {
    throw new Error('CATALOG_COSMOS_MANAGED_IDENTITY_CLIENT_ID must be a UUID');
  }
  return { endpoint: endpoint.origin, database, containers, authentication: key
    ? { type: 'key', key }
    : { type: 'managed-identity', ...(clientId ? { clientId } : {}) } };
}

// Business routes stay unmounted unless configured; a partial configuration fails startup instead of degrading.
function loadPublicationSettings(environment: NodeJS.ProcessEnv): PublicationSettings | undefined {
  if (!PUBLICATION_VARIABLES.some(name => environment[name]?.trim())) return undefined;
  const issuer = environment.CATALOG_JWT_ISSUER?.trim();
  if (!issuer || !/^https:\/\/\S{1,248}$/.test(issuer)) throw new Error('CATALOG_JWT_ISSUER must be the https ms-users issuer');
  const audience = environment.CATALOG_JWT_AUDIENCE?.trim();
  if (!audience || !/^[A-Za-z0-9:._/-]{1,256}$/.test(audience)) throw new Error('CATALOG_JWT_AUDIENCE is required');
  const jwksUri = environment.CATALOG_JWT_JWKS_URI?.trim();
  const jwksJson = environment.CATALOG_JWT_JWKS_JSON?.trim();
  if (!jwksUri === !jwksJson) throw new Error('Set exactly one of CATALOG_JWT_JWKS_URI or CATALOG_JWT_JWKS_JSON');
  const store = environment.CATALOG_PUBLICATIONS_STORE?.trim();
  if (store !== 'memory' && store !== 'cosmos') {
    throw new Error('CATALOG_PUBLICATIONS_STORE must be "memory" or "cosmos"');
  }
  return {
    jwtIssuer: issuer,
    jwtAudience: audience,
    ...(jwksUri ? { jwksUri: secureUrl(jwksUri, 'CATALOG_JWT_JWKS_URI') } : { jwksJson: jwksJson! }),
    usersProfileUrl: profileUrl(environment.CATALOG_USERS_PROFILE_URL?.trim(), issuer),
    store,
    placeholderImageUrl: secureUrl(environment.CATALOG_PLACEHOLDER_IMAGE_URL?.trim(), 'CATALOG_PLACEHOLDER_IMAGE_URL'),
  };
}

export function loadSettings(environment: NodeJS.ProcessEnv = process.env): Settings {
  const publications = loadPublicationSettings(environment);
  const cosmos = loadCosmosSettings(environment, publications?.store);
  return {
    port: parsePort(environment.PORT),
    serviceName: environment.SERVICE_NAME?.trim() || 'ms-catalog',
    logLevel: parseLogLevel(environment.LOG_LEVEL),
    ...(publications ? { publications } : {}),
    ...(cosmos ? { cosmos } : {}),
  };
}
