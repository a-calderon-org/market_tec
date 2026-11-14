import { apiRelativePath } from './api-url';
import { catalogApiBase } from './catalog-api';

/**
 * Destino del historial de notificaciones (ms-notifications, MTEC-25): el proxy same-origin `/api/notifications/v1`
 * de las Functions del Static Web App, que reenvía el JWT interno de ms-users como `Authorization`.
 *
 * Solo existe junto al ms-catalog propio (`catalogInternalJwt`): se deriva del mismo origen que el proxy
 * `/api/catalog-v2/v1` configurado en el build, de modo que no requiere una variable de despliegue adicional. Con el
 * catálogo heredado (ID Token de Google) no hay JWT interno que enviar y la base es null.
 */
const CATALOG_V2_PROXY_PATH = '/api/catalog-v2/v1';
const NOTIFICATIONS_PROXY_PATH = '/api/notifications/v1';

export function notificationsApiBase(catalogBase: string | null = catalogApiBase()): string | null {
  if (!catalogBase) return null;
  try {
    const url = new URL(catalogBase);
    return url.pathname.replace(/\/+$/, '') === CATALOG_V2_PROXY_PATH
      ? `${url.origin}${NOTIFICATIONS_PROXY_PATH}`
      : null;
  } catch {
    return null;
  }
}

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
/** Operaciones exactas que la SPA usa (rutas relativas a la base). El stream SSE no pasa por el proxy. */
const NOTIFICATION_OPERATIONS: readonly { readonly method: string; readonly route: RegExp }[] = [
  { method: 'GET', route: /^\/notifications$/ },
  { method: 'PATCH', route: new RegExp(`^/notifications/${UUID}/read$`) },
];

/** ¿Es la petición una operación de notificaciones autorizada hacia la base de notificaciones? */
export function isNotificationsOperation(
  requestUrl: string,
  method: string,
  notificationsBase: string | null,
): boolean {
  if (!notificationsBase) return false;

  const route = apiRelativePath(requestUrl, notificationsBase);
  const upper = method.toUpperCase();

  return route !== null && NOTIFICATION_OPERATIONS.some((op) => op.method === upper && op.route.test(route));
}
