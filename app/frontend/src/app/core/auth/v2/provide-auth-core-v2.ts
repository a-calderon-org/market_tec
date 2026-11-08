import { inject, Provider } from '@angular/core';
import { FEATURE_FLAGS } from '../../feature-flags';
import { AuthApiPort } from './auth-api.port';
import { AUTH_V2_HTTP_API_BASE, requestsHttpAdapter } from './auth-v2-config';
import { AUTH_V2_BUSINESS_TRANSPORT, BusinessTransportMode } from './business-transport';
import { HttpAuthApiAdapter } from './http-auth-api.adapter';
import { MockAuthApiAdapter } from './mock-auth-api.adapter';
import { SessionLock, WebLocksSessionLock } from './session-lock';
import { BroadcastSessionSignalChannel, SessionSignalChannel } from './session-signal-channel';

declare const ngDevMode: unknown;

/**
 * Proveedores del núcleo v2. Son inertes mientras `FEATURE_FLAGS.authCoreV2`
 * sea `false` (nada los inyecta).
 *
 * Selección explícita del adaptador (`FEATURE_FLAGS.authCoreV2Adapter`):
 * - `mock` (por defecto): simulación solo en builds de desarrollo. En producción
 *   `ngDevMode` es `false`, el bundler elimina la rama y el puerto lanza al
 *   inyectarse: activar el flag por error nunca deja un login simulado. El
 *   transporte de negocio queda `blocked`.
 * - `http`: `HttpAuthApiAdapter` contra ms-users. Exige además
 *   `authCoreV2HttpTopologyVerified=true` y una API base HTTPS válida
 *   (`AUTH_V2_HTTP_API_BASE`). Si falta algo, falla cerrado: no hay sesión real
 *   ni simulada. El transporte de negocio queda `restricted` (solo perfil propio).
 */
export function failClosedAuthApiPort(): never {
  throw new Error(
    'authCoreV2 no tiene un adaptador disponible: el mock no existe en builds de producción y el adaptador HTTP requiere configuración verificada.',
  );
}

export function selectAuthApiPort(): AuthApiPort {
  const flags = inject(FEATURE_FLAGS);

  if (flags.authCoreV2Adapter === 'http') {
    return requestsHttpAdapter(flags) && inject(AUTH_V2_HTTP_API_BASE)
      ? new HttpAuthApiAdapter()
      : failClosedAuthApiPort();
  }

  return typeof ngDevMode !== 'undefined' && ngDevMode
    ? new MockAuthApiAdapter()
    : failClosedAuthApiPort();
}

export function selectBusinessTransport(): BusinessTransportMode {
  return requestsHttpAdapter(inject(FEATURE_FLAGS)) && inject(AUTH_V2_HTTP_API_BASE)
    ? 'restricted'
    : 'blocked';
}

export function provideAuthCoreV2(): Provider[] {
  return [
    { provide: AuthApiPort, useFactory: selectAuthApiPort },
    { provide: AUTH_V2_BUSINESS_TRANSPORT, useFactory: selectBusinessTransport },
    { provide: SessionLock, useClass: WebLocksSessionLock },
    { provide: SessionSignalChannel, useClass: BroadcastSessionSignalChannel },
  ];
}
