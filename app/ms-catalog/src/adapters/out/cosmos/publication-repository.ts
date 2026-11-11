import type { SqlParameter } from '@azure/cosmos';
import type { PublicationRepository } from '../../../application/ports/out/publication-repository.js';
import { PublicationError } from '../../../domain/publication.js';
import type { Publication, PublicationQuery } from '../../../domain/publication.js';
import { physicalId, publicationDocument, readPublication } from './documents.js';
import { CosmosPersistenceError, deadline, hasStatus } from './store.js';
import type { CosmosStore } from './store.js';

function conflict(): never {
  throw new PublicationError('PUBLICATION_CONFLICT', 'Publication already exists or changed concurrently');
}

export class CosmosPublicationRepository implements PublicationRepository {
  constructor(private readonly store: CosmosStore) {}

  async findById(id: string): Promise<Publication | undefined> {
    const row = await this.store.read(physicalId('publication', id), deadline());
    return row && readPublication(row.document, this.store.partitionKey);
  }

  async insert(value: Publication): Promise<void> {
    try {
      await this.store.create(publicationDocument(value, this.store.partitionKey), deadline());
    } catch (error) {
      if (hasStatus(error, 409)) conflict();
      throw error;
    }
  }

  async replace(value: Publication, expectedRevision: number): Promise<void> {
    const signal = deadline();
    const row = await this.store.read(physicalId('publication', value.id), signal);
    if (!row) conflict();
    const current = readPublication(row.document, this.store.partitionKey);
    if (current.revision !== expectedRevision || value.ownerId !== current.ownerId ||
        value.revision !== expectedRevision + 1) conflict();
    if (!row.etag) throw new CosmosPersistenceError('read');
    try {
      await this.store.replace(publicationDocument(value, this.store.partitionKey), row.etag, signal);
    } catch (error) {
      if (hasStatus(error, 409, 412)) conflict();
      if (hasStatus(error, 404)) {
        await this.store.validate(signal);
        conflict();
      }
      throw error;
    }
  }

  async search(query: PublicationQuery) {
    const clauses = ["c.kind = 'publication'", 'c.precio >= @min'];
    const parameters: SqlParameter[] = [{ name: '@min', value: query.precioMin }];
    // The domain uses MAX_VALUE as its unbounded default. The emulator overflows
    // when binding that double, and every valid stored price is already <= it.
    if (query.precioMax !== Number.MAX_VALUE) {
      clauses.push('c.precio <= @max');
      parameters.push({ name: '@max', value: query.precioMax });
    }
    if (query.ownerId !== undefined) {
      clauses.push('c.ownerId = @owner');
      parameters.push({ name: '@owner', value: query.ownerId });
    }
    if (query.categoria) {
      clauses.push('c.categoria = @category');
      parameters.push({ name: '@category', value: query.categoria });
    }
    const needle = query.q.trim().toLocaleLowerCase('es');
    if (needle) {
      clauses.push('CONTAINS(c.searchText, @needle)');
      parameters.push({ name: '@needle', value: needle });
    }
    const field = query.sortBy === 'precio' ? 'c.precio' : 'c.createdAtMs';
    const direction = query.sortDirection === 'asc' ? 'ASC' : 'DESC';
    const { items, totalRecords } = await this.store.page(clauses.join(' AND '), parameters,
      field + ' ' + direction + ', c.sortId ASC', query.page, query.pageSize, deadline());
    return { items: items.map(item => readPublication(item, this.store.partitionKey)), totalRecords };
  }
}
