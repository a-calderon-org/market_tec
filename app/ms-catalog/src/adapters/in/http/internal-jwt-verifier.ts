import { createPublicKey, verify, type JsonWebKey, type KeyObject } from 'node:crypto';

// Principal derived only from a verified ms-users internal JWT (RS256, typ at+jwt).
export interface VerifiedPrincipal {
  readonly userId: string;
  readonly sessionId: string;
  readonly tokenId: string;
  readonly expiresAt: number;
  // The same bearer, kept only to resolve the caller's own profile at ms-users.
  readonly credential: string;
}

export interface KeySource {
  key(kid: string): Promise<KeyObject | undefined>;
}

const MAX_TOKEN_CHARS = 8192;
const COMPACT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const HEX32 = /^[0-9a-f]{32}$/;
const FORBIDDEN_HEADERS = ['jku', 'jwk', 'x5u', 'x5c', 'crit'];

export function parseJwks(value: unknown): Map<string, KeyObject> {
  const keys = new Map<string, KeyObject>();
  const list = (value as { keys?: unknown } | null)?.keys;
  if (!Array.isArray(list)) throw new Error('Invalid JWKS');
  for (const jwk of list as Record<string, unknown>[]) {
    if (!jwk || typeof jwk !== 'object' || jwk.kty !== 'RSA' || typeof jwk.kid !== 'string' || !jwk.kid) continue;
    if ((jwk.alg !== undefined && jwk.alg !== 'RS256') || (jwk.use !== undefined && jwk.use !== 'sig')) continue;
    if ('d' in jwk) throw new Error('JWKS must not contain private keys');
    const key = createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e } as JsonWebKey, format: 'jwk' });
    if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) continue;
    keys.set(jwk.kid, key);
  }
  if (!keys.size) throw new Error('JWKS has no usable RS256 keys');
  return keys;
}

export class StaticJwks implements KeySource {
  private readonly keys: Map<string, KeyObject>;
  constructor(jwks: unknown) { this.keys = parseJwks(jwks); }
  async key(kid: string) { return this.keys.get(kid); }
}

// Fetches the published JWKS, caches it and refreshes on unknown kid at most once per minRefreshMs.
export class RemoteJwks implements KeySource {
  private keys = new Map<string, KeyObject>();
  private fetchedAt: number | undefined;
  private pending: Promise<void> | undefined;

  constructor(private readonly uri: string, private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now, private readonly ttlMs = 300_000,
    private readonly minRefreshMs = 30_000) {}

  async key(kid: string) {
    const age = this.fetchedAt === undefined ? Infinity : this.now() - this.fetchedAt;
    if (age > this.ttlMs || (!this.keys.has(kid) && age > this.minRefreshMs)) await this.refresh();
    return this.keys.get(kid);
  }

  private refresh(): Promise<void> {
    this.pending ??= (async () => {
      try {
        const response = await this.fetchFn(this.uri, { headers: { Accept: 'application/json' }, redirect: 'error',
          signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`JWKS fetch failed with ${response.status}`);
        this.keys = parseJwks(await response.json());
        this.fetchedAt = this.now();
      } catch (error) {
        // Keep previously verified keys; without any key every token is rejected (fail closed).
        if (!this.keys.size) throw error;
      } finally {
        this.pending = undefined;
      }
    })();
    return this.pending;
  }
}

function decode(segment: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export class InternalJwtVerifier {
  constructor(private readonly options: { readonly issuer: string; readonly audience: string; readonly keys: KeySource;
    readonly nowSeconds?: () => number; readonly clockSkewSeconds?: number }) {}

  // Returns undefined for any invalid token; throws only when no verification keys can be obtained.
  async verify(token: string): Promise<VerifiedPrincipal | undefined> {
    if (typeof token !== 'string' || token.length > MAX_TOKEN_CHARS || !COMPACT.test(token)) return undefined;
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.') as [string, string, string];
    const header = decode(encodedHeader);
    if (!header || header.alg !== 'RS256' || header.typ !== 'at+jwt' || typeof header.kid !== 'string' ||
      FORBIDDEN_HEADERS.some(name => name in header)) return undefined;
    const key = await this.options.keys.key(header.kid);
    if (!key) return undefined;
    const signed = verify('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), key,
      Buffer.from(encodedSignature, 'base64url'));
    if (!signed) return undefined;
    const claims = decode(encodedPayload);
    if (!claims) return undefined;
    const now = this.options.nowSeconds?.() ?? Math.floor(Date.now() / 1000);
    const skew = this.options.clockSkewSeconds ?? 30;
    const audience = claims.aud;
    const audienceOk = audience === this.options.audience ||
      (Array.isArray(audience) && audience.length === 1 && audience[0] === this.options.audience);
    const { sub, sid, jti, iat, exp, nbf } = claims;
    if (claims.iss !== this.options.issuer || !audienceOk) return undefined;
    if (typeof sub !== 'string' || !sub.trim() || sub.length > 64) return undefined;
    if (typeof sid !== 'string' || !HEX32.test(sid) || typeof jti !== 'string' || !HEX32.test(jti)) return undefined;
    if (!isTime(iat) || !isTime(exp) || exp <= iat || now >= exp || iat > now + skew) return undefined;
    if (nbf !== undefined && (!isTime(nbf) || nbf > now + skew)) return undefined;
    return { userId: sub, sessionId: sid, tokenId: jti, expiresAt: exp, credential: token };
  }
}

// Exactly one `Authorization: Bearer <compact JWT>` header; anything else is unauthenticated.
export function bearerToken(authorization: string | string[] | undefined): string | undefined {
  if (typeof authorization !== 'string') return undefined;
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(authorization);
  return match?.[1];
}
