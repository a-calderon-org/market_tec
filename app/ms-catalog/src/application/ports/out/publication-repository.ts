import type { Publication, PublicationQuery } from '../../../domain/publication.js';

export interface PublicationRepository {
  findById(id: string): Promise<Publication | undefined>;
  insert(publication: Publication): Promise<void>;
  // Must atomically compare the stored revision before replacing, or throw conflict.
  replace(publication: Publication, expectedRevision: number): Promise<void>;
  search(query: PublicationQuery): Promise<{ items: Publication[]; totalRecords: number }>;
}
