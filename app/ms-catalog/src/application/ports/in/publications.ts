import type { PublicationContent, PublicationFilter, SellerSnapshot } from '../../../domain/publication.js';

// Principal produced by credential verification (internal JWT), never by request bodies or identity headers.
export interface AuthenticatedPrincipal {
  readonly userId: string;
  // Verified bearer, only forwarded to ms-users to read the caller's own profile.
  readonly credential?: string;
}

// Raised while resolving the actor: the caller's session was rejected, or the seller profile is unavailable.
export class ActorResolutionError extends Error {
  constructor(readonly code: 'UNAUTHENTICATED' | 'SELLER_PROFILE_UNAVAILABLE', message: string) { super(message); }
}

// Output of trusted identity integration, never constructed from request bodies/headers.
export interface PublicationActor {
  readonly userId: string;
  readonly seller: SellerSnapshot;
}

export interface PublicationView extends PublicationContent {
  readonly id: string;
  readonly fechaPublicacion: string;
  readonly createdAt: number;
  readonly estado: string;
  readonly imagen: string;
  readonly vendedor: SellerSnapshot & { readonly userId: string };
}

export interface PublicationPage {
  readonly items: Omit<PublicationView, 'imagenes'>[];
  readonly totalRecords: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface Publications {
  create(actor: PublicationActor, content: PublicationContent): Promise<PublicationView>;
  get(id: string): Promise<PublicationView>;
  update(actor: PublicationActor, id: string, content: PublicationContent): Promise<PublicationView>;
  list(filter?: PublicationFilter): Promise<PublicationPage>;
  listOwned(actor: PublicationActor, filter?: PublicationFilter): Promise<PublicationPage>;
}
