/**
 * Rutas de negocio que pueden llevar el JWT interno (lista explícita, sin
 * prefijos amplios). Las rutas se evalúan SIN el prefijo `/v1` (ver
 * `apiVersionlessPath`), de modo que el resultado no depende de si la API base
 * lo incluye.
 *
 * Fuente: `credentialsPolicy.bearerRoutes` de `contracts/examples/auth/proposed-core-flow.json`
 * (`/me/profile`, `/usuarios/{userId}`) más las rutas de negocio que ya consume la
 * SPA. NO es un contrato aprobado: la reconciliación final de rutas corresponde a B07.
 */
const SEGMENT = '[^/?#]+';

const BEARER_ROUTES: readonly RegExp[] = [
  /^\/me\/profile$/,
  /^\/me\/auth-methods$/,
  new RegExp(`^/usuarios/${SEGMENT}$`),
  new RegExp(`^/usuarios/${SEGMENT}/publicaciones$`),
  /^\/publicaciones$/,
  new RegExp(`^/publicaciones/${SEGMENT}$`),
  /^\/chats$/,
  new RegExp(`^/chats/${SEGMENT}/mensajes$`),
  /^\/notificaciones$/,
];

/**
 * Rutas basadas en cookie, de sesión o de metadatos: jamás llevan bearer, aunque
 * una regla futura de la lista anterior las abarcara por error (la exclusión gana).
 * `credentialsPolicy.neverSendBearerTo`: attempts, google, session, refresh, logout,
 * `/.well-known/*`; se excluye todo `/auth` por prudencia (proofs, email, activity).
 */
const COOKIE_OR_METADATA = /^\/(?:auth|\.well-known)(?:\/|$)/i;

/** `route` es la ruta sin prefijo `/v1`, relativa a la API (ver `apiVersionlessPath`). */
export function isBearerRoute(route: string): boolean {
  if (COOKIE_OR_METADATA.test(route)) {
    return false;
  }

  return BEARER_ROUTES.some((pattern) => pattern.test(route));
}
