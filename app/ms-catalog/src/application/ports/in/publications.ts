import type { PublicationContent, PublicationFilter, SellerSnapshot } from '../../../domain/publication.js';

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
