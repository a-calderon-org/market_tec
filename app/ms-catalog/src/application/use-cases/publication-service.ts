import { PublicationError, invalid, normalizeQuery, validateContent, validateImageUrl, validateText } from '../../domain/publication.js';
import type { Publication, PublicationContent, PublicationFilter } from '../../domain/publication.js';
import type { PublicationActor, Publications, PublicationView } from '../ports/in/publications.js';
import type { PublicationRepository } from '../ports/out/publication-repository.js';
import type { ImageStoragePort } from '../ports/out/image-storage-port.js';

function validateActor(actor: PublicationActor): void {
  if (!actor || typeof actor !== 'object' || Array.isArray(actor)) invalid('Invalid actor');
  validateText(actor.userId, 'userId', 64, true);
  if (!actor.seller || !Number.isSafeInteger(actor.seller.id) || typeof actor.seller.verificado !== 'boolean') invalid('Invalid seller snapshot');
  validateText(actor.seller.nombre, 'nombre', 160, true);
  validateText(actor.seller.carrera, 'carrera', 160);
}

function copyContent(content: PublicationContent): PublicationContent {
  validateContent(content);
  // Explicit allowlist: owner, IDs, timestamps and profile fields cannot be mass assigned.
  return { categoria: content.categoria, subcategoria: content.subcategoria, titulo: content.titulo,
    descripcion: content.descripcion, precio: content.precio, condicion: content.condicion,
    ubicacion: content.ubicacion, imagenes: [...content.imagenes] };
}

function view(publication: Publication, placeholderImageUrl: string): PublicationView {
  return { ...copyContent(publication), id: publication.id,
    fechaPublicacion: publication.createdAt.toISOString(), createdAt: Math.floor(publication.createdAt.getTime() / 1000),
    estado: 'activo', imagen: publication.imagenes[0] ?? placeholderImageUrl,
    vendedor: { ...publication.seller, userId: publication.ownerId } };
}

export class PublicationService implements Publications {
  constructor(private readonly repository: PublicationRepository, private readonly images: ImageStoragePort,
    private readonly nextId: () => string, private readonly now: () => Date,
    private readonly placeholderImageUrl: string) {
    validateImageUrl(placeholderImageUrl);
  }

  async create(actor: PublicationActor, content: PublicationContent): Promise<PublicationView> {
    validateActor(actor);
    const data = copyContent(content);
    const ownerId = actor.userId;
    const seller = { id: actor.seller.id, nombre: actor.seller.nombre, carrera: actor.seller.carrera, verificado: actor.seller.verificado };
    const id = this.nextId();
    validateText(id, 'publicationId', 128, true);
    const createdAt = new Date(this.now().getTime());
    if (!Number.isFinite(createdAt.getTime()) || createdAt.getTime() < 0 || createdAt.getTime() >= 10000000000000) invalid('Invalid creation time');
    await this.images.assertUsableBy(ownerId, data.imagenes);
    const publication: Publication = { ...data, id, ownerId, seller, createdAt, revision: 1 };
    await this.repository.insert(publication);
    return view(publication, this.placeholderImageUrl);
  }

  private async find(id: string): Promise<Publication> {
    validateText(id, 'publicationId', 128, true);
    const publication = await this.repository.findById(id);
    if (!publication) throw new PublicationError('PUBLICATION_NOT_FOUND', 'Publication not found');
    return publication;
  }

  async get(id: string): Promise<PublicationView> { return view(await this.find(id), this.placeholderImageUrl); }

  async update(actor: PublicationActor, id: string, content: PublicationContent): Promise<PublicationView> {
    validateActor(actor);
    const ownerId = actor.userId;
    const current = await this.find(id);
    if (current.ownerId !== ownerId) throw new PublicationError('PUBLICATION_FORBIDDEN', 'Only the owner can update this publication');
    const data = copyContent(content);
    await this.images.assertUsableBy(ownerId, data.imagenes);
    const updated: Publication = { ...current, ...data, revision: current.revision + 1 };
    await this.repository.replace(updated, current.revision);
    return view(updated, this.placeholderImageUrl);
  }

  async list(filter: PublicationFilter = {}) { return this.search(filter); }

  async listOwned(actor: PublicationActor, filter: PublicationFilter = {}) {
    validateActor(actor);
    return this.search(filter, actor.userId);
  }

  private async search(filter: PublicationFilter, ownerId?: string) {
    const query = normalizeQuery(filter, ownerId);
    const result = await this.repository.search(query);
    const items = result.items.map(publication => {
      const { imagenes: _images, ...item } = view(publication, this.placeholderImageUrl);
      return item;
    });
    return { items, totalRecords: result.totalRecords, page: query.page, pageSize: query.pageSize };
  }
}
