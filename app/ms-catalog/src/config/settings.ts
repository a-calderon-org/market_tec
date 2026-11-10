export interface Settings {
  readonly port: number;
  readonly serviceName: string;
  readonly logLevel: LogLevel;
  // Present only when the business routes are explicitly configured (see loadPublicationSettings).
  readonly publications?: PublicationSettings;
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
  // Only `memory` exists today: data is lost on restart and is not shared between replicas.
  readonly store: 'memory';
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

const PUBLICATION_VARIABLES = ['CATALOG_JWT_ISSUER', 'CATALOG_JWT_AUDIENCE', 'CATALOG_JWT_JWKS_URI', 'CATALOG_JWT_JWKS_JSON',
  'CATALOG_USERS_PROFILE_URL', 'CATALOG_PUBLICATIONS_STORE', 'CATALOG_PLACEHOLDER_IMAGE_URL'];

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
  if (environment.CATALOG_PUBLICATIONS_STORE?.trim() !== 'memory') {
    throw new Error('CATALOG_PUBLICATIONS_STORE must be "memory": no persistent publication store is implemented');
  }
  return {
    jwtIssuer: issuer,
    jwtAudience: audience,
    ...(jwksUri ? { jwksUri: secureUrl(jwksUri, 'CATALOG_JWT_JWKS_URI') } : { jwksJson: jwksJson! }),
    usersProfileUrl: secureUrl(environment.CATALOG_USERS_PROFILE_URL?.trim(), 'CATALOG_USERS_PROFILE_URL'),
    store: 'memory',
    placeholderImageUrl: secureUrl(environment.CATALOG_PLACEHOLDER_IMAGE_URL?.trim(), 'CATALOG_PLACEHOLDER_IMAGE_URL'),
  };
}

export function loadSettings(environment: NodeJS.ProcessEnv = process.env): Settings {
  const publications = loadPublicationSettings(environment);
  return {
    port: parsePort(environment.PORT),
    serviceName: environment.SERVICE_NAME?.trim() || 'ms-catalog',
    logLevel: parseLogLevel(environment.LOG_LEVEL),
    ...(publications ? { publications } : {}),
  };
}
