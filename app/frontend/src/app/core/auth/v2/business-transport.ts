import { InjectionToken } from '@angular/core';

/**
 * Estado del transporte HTTP de NEGOCIO bajo `authCoreV2`.
 *
 * - `blocked` (por defecto): no existe adaptador HTTP real de autenticación (B07
 *   no está aprobado), así que la sesión es simulada. Una sesión simulada no
 *   puede producir ninguna petición hacia APIM ni hacia el backend configurado:
 *   las operaciones de negocio fallan cerrado ANTES de llegar a `HttpClient`.
 * - `restricted`: adaptador HTTP real configurado. Solo salen hacia la API las
 *   operaciones de `V2_HTTP_BUSINESS_ROUTES` (perfil propio); el resto de rutas de
 *   negocio sigue bloqueado hasta que su microservicio valide el JWT interno.
 * - `enabled`: sin restricción de rutas. No lo selecciona `provideAuthCoreV2`; las
 *   pruebas lo usan para ejercitar el interceptor contra `HttpTestingController`.
 */
export type BusinessTransportMode = 'blocked' | 'restricted' | 'enabled';

/**
 * Operaciones de negocio autorizadas con el adaptador HTTP real (rutas SIN `/v1`).
 * Solo ms-users valida hoy el JWT interno (`UserProfileController`). Lista exacta:
 * método y ruta deben coincidir.
 */
const V2_HTTP_BUSINESS_ROUTES: readonly { readonly method: string; readonly route: string }[] = [
  { method: 'GET', route: '/me/profile' },
  { method: 'PUT', route: '/me/profile' },
  // Contraseña propia (ms-users, solo con `passwordAuth`): estado y primera contraseña. El cambio (PUT) existe en
  // ms-users pero esta SPA aún no lo usa, así que no sale.
  { method: 'GET', route: '/me/password' },
  { method: 'POST', route: '/me/password' },
];

/** ¿Puede salir esta operación en modo `restricted`? `route` es la ruta sin `/v1`. */
export function isRestrictedBusinessOperation(method: string, route: string): boolean {
  const upper = method.toUpperCase();

  return V2_HTTP_BUSINESS_ROUTES.some((entry) => entry.method === upper && entry.route === route);
}

export const AUTH_V2_BUSINESS_TRANSPORT = new InjectionToken<BusinessTransportMode>(
  'AUTH_V2_BUSINESS_TRANSPORT',
  { providedIn: 'root', factory: () => 'blocked' },
);

/**
 * La operación de negocio no se envió: sesión simulada (`blocked`) o ruta aún no
 * autorizada con el adaptador HTTP real (`restricted`).
 */
export class BusinessTransportBlockedError extends Error {
  constructor(readonly target: string) {
    super('Operación de negocio bloqueada por authCoreV2.');
    this.name = 'BusinessTransportBlockedError';
  }
}
