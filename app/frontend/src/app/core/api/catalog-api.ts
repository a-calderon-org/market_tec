import { environment } from '../../../environments/environment';
import { resolveHttpApiBase } from '../auth/v2/auth-v2-config';
import { apiRelativePath } from './api-url';

/**
 * Destino de publicaciones bajo `authCoreV2`: el proxy same-origin `/api/catalog/v1`, que añade en el servidor
 * la clave de APIM y entrega a `markettec-api-v1` el ID Token de Google. ms-users (`apiBaseUrl`) no atiende
 * publicaciones y el negocio no valida el JWT interno, así que nunca se mezclan los destinos.
 *
 * Static Web Apps sustituye `Authorization` antes de la Function: el token viaja en esta cabecera propia.
 */
export const CATALOG_GOOGLE_AUTHORIZATION_HEADER = 'X-MTEC-Google-Authorization';

declare const ngDevMode: unknown;

/** Base del catálogo configurada en el build (`environment.catalogApiBaseUrl`), validada; null si falta. */
export function catalogApiBase(): string | null {
  return resolveHttpApiBase(
    (environment as { catalogApiBaseUrl?: unknown }).catalogApiBaseUrl,
    typeof ngDevMode !== 'undefined' && !!ngDevMode,
  );
}

const SEGMENT = '[A-Za-z0-9_-]{1,64}';
/** Operaciones exactas de publicaciones que la SPA usa (rutas relativas a la base del catálogo). */
const CATALOG_OPERATIONS: readonly { readonly method: string; readonly route: RegExp }[] = [
  { method: 'GET', route: /^\/publicaciones$/ },
  { method: 'GET', route: new RegExp(`^/publicaciones/${SEGMENT}$`) },
  { method: 'POST', route: /^\/publicaciones$/ },
];

/** ¿Es la petición una operación de publicaciones autorizada hacia la base del catálogo? */
export function isCatalogOperation(requestUrl: string, method: string, catalogBase: string | null): boolean {
  if (!catalogBase) return false;

  const route = apiRelativePath(requestUrl, catalogBase);
  const upper = method.toUpperCase();

  return route !== null && CATALOG_OPERATIONS.some((op) => op.method === upper && op.route.test(route));
}
