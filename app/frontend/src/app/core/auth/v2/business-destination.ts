/**
 * Clasificación de destinos para el bloqueo del transporte de negocio mientras la
 * sesión es simulada (sin adaptador HTTP real).
 *
 * Complementa a `apiVersionlessPath`, que solo reconoce lo que cuelga de la base
 * configurada (y falla si la base está vacía o la petición usa otro prefijo). Aquí se
 * aplica el criterio contrario: fallar cerrado ante todo lo que sea del mismo origen
 * (el del documento o el de la API configurada) y no se pueda descartar con seguridad.
 *
 * Decisión, de mayor a menor prioridad. `original` es la ruta normalizada TAL COMO
 * se pidió; `versionless` es la misma sin prefijos `/v1` ni `/api`:
 * 1. Otro origen (ni el del documento ni el de la API configurada) → no bloquea.
 * 2. Raíces de negocio (`/usuarios`, `/me`, `/publicaciones`, `/chats`,
 *    `/notificaciones`, a cualquier profundidad) en `versionless` → BLOQUEA.
 * 3. `/auth/*` y `/.well-known/*` → no bloquea (sesión y metadatos; nunca llevan bearer).
 * 4. Estático explícito (ver `isExplicitStaticRead`) → no bloquea, solo GET/HEAD.
 * 5. Cualquier otra cosa → BLOQUEA. Incluye los prefijos de API solos (`/api`, `/v1/`,
 *    `/api/v1`): quitar el prefijo deja `/`, y esa raíz NO es una excepción estática,
 *    porque el mismo origen configurado podría atender ahí la API.
 *
 * Los segmentos `.`/`..`, `%2e`, `\`, las barras repetidas, el query y el hash los
 * resuelve `URL` o se normalizan antes de decidir, de modo que no sirven para eludir.
 *
 * No es un contrato de rutas: la reconciliación definitiva corresponde a B07.
 */
const BUSINESS_ROOTS = /^\/(?:usuarios|me|publicaciones|chats|notificaciones)(?:\/|$)/i;
const AUTH_OR_METADATA = /^\/(?:auth|\.well-known)(?:\/|$)/i;
const API_PREFIXES = /^(?:\/(?:api|v1))+(?=\/|$)/i;

/**
 * Únicos estáticos reconocidos del frontend (`public/`): el favicon y lo que cuelga de
 * `/assets/`. No se admite "cualquier ruta con extensión": una API también puede usarlas.
 */
const STATIC_PATHS = /^(?:\/favicon\.ico|\/assets\/.+)$/;
const STATIC_METHODS = new Set(['GET', 'HEAD']);

/** URL absoluta del destino y los orígenes propios; null si no se puede analizar. */
function analyse(
  requestUrl: string,
  configuredBaseUrl: unknown,
): { destination: URL; documentOrigin: string; ownOrigins: Set<string> } | null {
  try {
    const documentBase = new URL(document.baseURI);
    const destination = new URL(requestUrl, documentBase);
    const ownOrigins = new Set([documentBase.origin]);

    if (typeof configuredBaseUrl === 'string' && configuredBaseUrl.trim()) {
      ownOrigins.add(new URL(configuredBaseUrl, documentBase).origin);
    }

    return { destination, documentOrigin: documentBase.origin, ownOrigins };
  } catch {
    return null;
  }
}

/** Ruta tal como se pidió, con barras repetidas colapsadas (el resto lo normaliza `URL`). */
function originalPath(destination: URL): string {
  return destination.pathname.replace(/\/{2,}/g, '/');
}

/**
 * ¿Es una lectura (GET/HEAD) de un estático explícito del PROPIO frontend? Solo el origen
 * del documento puede servirlos, y se evalúa sobre la ruta original, nunca sobre la que
 * queda tras quitar prefijos de API (`/api/favicon.ico` no es el favicon).
 */
export function isExplicitStaticRead(requestUrl: string, method: string): boolean {
  const analysis = analyse(requestUrl, null);

  if (!analysis || !STATIC_METHODS.has(method.toUpperCase())) return false;

  const { destination, documentOrigin } = analysis;

  return (
    ['http:', 'https:'].includes(destination.protocol) &&
    destination.origin === documentOrigin &&
    STATIC_PATHS.test(originalPath(destination))
  );
}

/**
 * Devuelve la ruta normalizada (sin query ni hash) si la petición, que NO cuelga de la
 * base configurada, debe bloquearse; o null si puede continuar. Los estáticos
 * explícitos los resuelve `isExplicitStaticRead`, que el llamador consulta antes.
 */
export function blockedOwnOriginPath(requestUrl: string, configuredBaseUrl: unknown): string | null {
  const analysis = analyse(requestUrl, configuredBaseUrl);

  // Ni el destino ni la configuración se pueden analizar: no se puede descartar nada.
  if (!analysis) return '(unparseable)';

  const { destination, ownOrigins } = analysis;

  if (!['http:', 'https:'].includes(destination.protocol) || !ownOrigins.has(destination.origin)) {
    return null;
  }

  const path = originalPath(destination);
  const versionless = path.replace(API_PREFIXES, '') || '/';

  if (BUSINESS_ROOTS.test(versionless)) return versionless;
  if (AUTH_OR_METADATA.test(versionless)) return null;

  // Rutas desconocidas y prefijos de API solos: se bloquea la ruta ORIGINAL.
  return path;
}
