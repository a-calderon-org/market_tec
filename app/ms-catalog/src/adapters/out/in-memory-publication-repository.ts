import { PublicationError } from '../../domain/publication.js';
import type { Publication, PublicationQuery } from '../../domain/publication.js';
import type { PublicationRepository } from '../../application/ports/out/publication-repository.js';

export class InMemoryPublicationRepository implements PublicationRepository {
  private readonly publications = new Map<string, Publication>();

  async findById(id: string): Promise<Publication | undefined> {
    const publication = this.publications.get(id);
    return publication === undefined ? undefined : structuredClone(publication);
  }

  async insert(publication: Publication): Promise<void> {
    if (this.publications.has(publication.id)) throw new PublicationError('PUBLICATION_CONFLICT', 'Duplicate publication ID');
    this.publications.set(publication.id, structuredClone(publication));
  }

  async replace(publication: Publication, expectedRevision: number): Promise<void> {
    const current = this.publications.get(publication.id);
    if (!current || current.revision !== expectedRevision || publication.ownerId !== current.ownerId || publication.revision !== expectedRevision + 1) {
      throw new PublicationError('PUBLICATION_CONFLICT', 'Publication changed concurrently');
    }
    this.publications.set(publication.id, structuredClone(publication));
  }

  async search(query: PublicationQuery): Promise<{ items: Publication[]; totalRecords: number }> {
    const needle = query.q.trim().toLocaleLowerCase('es');
    const items = [...this.publications.values()].filter(publication =>
      (query.ownerId === undefined || publication.ownerId === query.ownerId) &&
      (!query.categoria || publication.categoria === query.categoria) &&
      (!needle || `${publication.titulo}\n${publication.descripcion}`.toLocaleLowerCase('es').includes(needle)) &&
      publication.precio >= query.precioMin && publication.precio <= query.precioMax);
    items.sort((a, b) => {
      const difference = query.sortBy === 'precio' ? a.precio - b.precio : a.createdAt.getTime() - b.createdAt.getTime();
      return (query.sortDirection === 'asc' ? difference : -difference) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    const start = (query.page - 1) * query.pageSize;
    return { totalRecords: items.length, items: structuredClone(items.slice(start, start + query.pageSize)) };
  }
}
