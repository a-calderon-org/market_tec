import { randomUUID } from 'node:crypto';
import { PublicationService } from '../application/use-cases/publication-service.js';
import { InMemoryPublicationRepository } from '../adapters/out/in-memory-publication-repository.js';
import { MsUsersSellerResolver } from '../adapters/out/ms-users-seller-resolver.js';
import { NoImageStorage } from '../adapters/out/no-image-storage.js';
import { InternalJwtVerifier, RemoteJwks, StaticJwks, bearerToken } from '../adapters/in/http/internal-jwt-verifier.js';
import type { PublicationHttpDependencies } from '../adapters/in/http/publication-router.js';
import type { PublicationSettings } from './settings.js';
import type { PublicationRepository } from '../application/ports/out/publication-repository.js';

export interface PublicationRuntimeOptions {
  readonly fetchFn?: typeof fetch;
  readonly nowSeconds?: () => number;
  readonly repository?: PublicationRepository;
}

// Runtime composition of the publication routes: internal JWT authentication + ms-users seller snapshot.
export function composePublications(settings: PublicationSettings, options: PublicationRuntimeOptions = {}): PublicationHttpDependencies {
  const fetchFn = options.fetchFn ?? fetch;
  const keys = settings.jwksUri ? new RemoteJwks(settings.jwksUri, fetchFn) : new StaticJwks(JSON.parse(settings.jwksJson!));
  const verifier = new InternalJwtVerifier({ issuer: settings.jwtIssuer, audience: settings.jwtAudience, keys,
    ...(options.nowSeconds ? { nowSeconds: options.nowSeconds } : {}) });
  const sellers = new MsUsersSellerResolver(settings.usersProfileUrl, fetchFn);
  const publications = new PublicationService(options.repository ?? new InMemoryPublicationRepository(), new NoImageStorage(),
    () => randomUUID(), () => new Date(), settings.placeholderImageUrl);
  return {
    publications,
    async authenticate(request) {
      const token = bearerToken(request.headers.authorization);
      return token === undefined ? undefined : verifier.verify(token);
    },
    writes: { publications, resolveActor: principal => sellers.resolve(principal) },
  };
}
