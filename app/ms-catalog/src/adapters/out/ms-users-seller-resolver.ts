import { ActorResolutionError } from '../../application/ports/in/publications.js';
import type { AuthenticatedPrincipal, PublicationActor } from '../../application/ports/in/publications.js';

const unavailable = (message: string) => new ActorResolutionError('SELLER_PROFILE_UNAVAILABLE', message);

/**
 * Builds the seller snapshot from the caller's OWN profile, `GET <ms-users>/v1/me/profile`, sent with the same
 * internal JWT the caller presented. Bounded delegation approved 2026-11-10 for this single operation only:
 * the JWT was already verified by ms-catalog, the URL is fixed by configuration to the gateway route
 * (see settings.ts), redirects are refused, the token is neither stored nor logged, and the returned `id` must be
 * the authenticated `sub`. Do not reuse this class for other inter-service calls. It never reads ms-users tables.
 * ms-users has no numeric user id nor a `carrera` field, so the snapshot carries `id: null` and `carrera: ''`.
 */
export class MsUsersSellerResolver {
  // Must stay well below the 38 s same-origin proxy deadline: a profile answer arriving after the browser got a 504
  // would still create the publication, and a retry would duplicate it. A slow (cold) ms-users yields 503, unwritten.
  constructor(private readonly profileUrl: string, private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = 20_000) {}

  async resolve(principal: AuthenticatedPrincipal): Promise<PublicationActor> {
    if (!principal.credential) throw unavailable('No delegated credential');
    let response: Response;
    try {
      response = await this.fetchFn(this.profileUrl, {
        headers: { Authorization: `Bearer ${principal.credential}`, Accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw unavailable('Profile request failed');
    }
    if (response.status === 401) throw new ActorResolutionError('UNAUTHENTICATED', 'Profile credential rejected');
    if (!response.ok) throw unavailable(`Profile answered ${response.status}`);
    let profile: Record<string, unknown>;
    try { profile = await response.json() as Record<string, unknown>; } catch {
      throw unavailable('Invalid profile body');
    }
    const { id, nombre, apellidos, verificado } = profile ?? {};
    if (id !== principal.userId) throw unavailable('Profile does not belong to the principal');
    if (typeof nombre !== 'string' || typeof verificado !== 'boolean' ||
      (apellidos !== undefined && typeof apellidos !== 'string')) throw unavailable('Invalid profile');
    const fullName = [...`${nombre} ${apellidos ?? ''}`.trim()].slice(0, 160).join('');
    if (!fullName) throw unavailable('Empty profile name');
    return { userId: principal.userId, seller: { id: null, nombre: fullName, carrera: '', verificado } };
  }
}
