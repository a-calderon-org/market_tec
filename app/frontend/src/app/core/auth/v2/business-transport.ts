import { InjectionToken } from '@angular/core';

/**
 * Estado del transporte HTTP de NEGOCIO bajo `authCoreV2`.
 *
 * - `blocked` (por defecto): no existe adaptador HTTP real de autenticación (B07
 *   no está aprobado), así que la sesión es simulada. Una sesión simulada no
 *   puede producir ninguna petición hacia APIM ni hacia el backend configurado:
 *   las operaciones de negocio fallan cerrado ANTES de llegar a `HttpClient`.
 * - `enabled`: reservado para cuando exista un adaptador HTTP real. Debe
 *   declararlo explícitamente quien lo provea; las pruebas lo usan para ejercitar
 *   el interceptor contra `HttpTestingController`.
 */
export type BusinessTransportMode = 'blocked' | 'enabled';

export const AUTH_V2_BUSINESS_TRANSPORT = new InjectionToken<BusinessTransportMode>(
  'AUTH_V2_BUSINESS_TRANSPORT',
  { providedIn: 'root', factory: () => 'blocked' },
);

/** La operación de negocio no se envió porque el núcleo v2 solo tiene sesión simulada. */
export class BusinessTransportBlockedError extends Error {
  constructor(readonly target: string) {
    super('Operación de negocio bloqueada: authCoreV2 usa una sesión simulada.');
    this.name = 'BusinessTransportBlockedError';
  }
}
