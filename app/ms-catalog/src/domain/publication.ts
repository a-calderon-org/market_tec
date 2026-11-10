export class PublicationError extends Error {
  constructor(readonly code: 'INVALID_PUBLICATION' | 'PUBLICATION_NOT_FOUND' | 'PUBLICATION_FORBIDDEN' | 'PUBLICATION_CONFLICT', message: string) {
    super(message);
  }
}

export interface PublicationContent {
  readonly categoria: string;
  readonly subcategoria: string;
  readonly titulo: string;
  readonly descripcion: string;
  readonly precio: number;
  readonly condicion: string | null;
  readonly ubicacion: string;
  readonly imagenes: readonly string[];
}

// Presentation snapshot supplied by a trusted adapter; never authoritative profile data.
export interface SellerSnapshot {
  // Legacy numeric seller id; null when the identity provider (ms-users) has none.
  readonly id: number | null;
  readonly nombre: string;
  readonly carrera: string;
  readonly verificado: boolean;
}

export interface Publication extends PublicationContent {
  readonly id: string;
  readonly ownerId: string;
  readonly seller: SellerSnapshot;
  readonly createdAt: Date;
  readonly revision: number;
}

export function invalid(message: string): never {
  throw new PublicationError('INVALID_PUBLICATION', message);
}

export function validateText(value: unknown, name: string, max: number, required = false): asserts value is string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) invalid(`Invalid ${name}`);
}

export function validateImageUrl(image: unknown): asserts image is string {
  if (typeof image !== 'string') invalid('Invalid image URL');
  try {
    const url = new URL(image);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) invalid('Invalid image URL');
  } catch { invalid('Invalid image URL'); }
}

export function validateContent(content: PublicationContent): void {
  if (!content || typeof content !== 'object' || Array.isArray(content)) invalid('Invalid publication content');
  validateText(content.categoria, 'categoria', 100, true);
  validateText(content.subcategoria, 'subcategoria', 100);
  validateText(content.titulo, 'titulo', 200, true);
  validateText(content.descripcion, 'descripcion', 5000);
  validateText(content.ubicacion, 'ubicacion', 200);
  if (typeof content.precio !== 'number' || !Number.isFinite(content.precio) || content.precio < 0) invalid('Invalid precio');
  if (content.condicion !== null && typeof content.condicion !== 'string') invalid('Invalid condicion');
  if (!Array.isArray(content.imagenes)) invalid('Invalid imagenes');
  for (const image of content.imagenes) validateImageUrl(image);
}

export interface PublicationFilter {
  readonly page?: number;
  readonly pageSize?: number;
  readonly q?: string;
  readonly categoria?: string;
  readonly sortBy?: 'precio' | 'fecha';
  readonly sortDirection?: 'asc' | 'desc';
  readonly precioMin?: number;
  readonly precioMax?: number;
}

export interface PublicationQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly q: string;
  readonly categoria: string;
  readonly sortBy: 'precio' | 'fecha';
  readonly sortDirection: 'asc' | 'desc';
  readonly precioMin: number;
  readonly precioMax: number;
  readonly ownerId?: string;
}

export function normalizeQuery(filter: PublicationFilter, ownerId?: string): PublicationQuery {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) invalid('Invalid publication filter');
  const { page = 1, pageSize = 12, q = '', categoria = '', sortBy = 'fecha', sortDirection = 'desc', precioMin = 0, precioMax = Number.MAX_VALUE } = filter;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isSafeInteger((page - 1) * pageSize)) invalid('Invalid pagination');
  validateText(q, 'q', 200);
  validateText(categoria, 'categoria', 100);
  if (!['precio', 'fecha'].includes(sortBy) || !['asc', 'desc'].includes(sortDirection)) invalid('Invalid sorting');
  if (![precioMin, precioMax].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0) || precioMin > precioMax) invalid('Invalid price range');
  return { page, pageSize, q, categoria, sortBy, sortDirection, precioMin, precioMax, ...(ownerId === undefined ? {} : { ownerId }) };
}
