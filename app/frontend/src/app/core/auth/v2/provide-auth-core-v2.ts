import { Provider } from '@angular/core';
import { AuthApiPort } from './auth-api.port';
import { AUTH_V2_BUSINESS_TRANSPORT } from './business-transport';
import { MockAuthApiAdapter } from './mock-auth-api.adapter';
import { SessionLock, WebLocksSessionLock } from './session-lock';
import { BroadcastSessionSignalChannel, SessionSignalChannel } from './session-signal-channel';

declare const ngDevMode: unknown;

/**
 * Proveedores del núcleo v2. Son inertes mientras `FEATURE_FLAGS.authCoreV2`
 * sea `false` (nada los inyecta).
 *
 * El único `AuthApiPort` disponible es un MOCK PROVISIONAL (B07 no está
 * aprobado y no existe adaptador HTTP). Falla cerrado: en un build de
 * producción `ngDevMode` es `false`, el bundler elimina la rama del mock y el
 * puerto lanza al inyectarse, de modo que activar el flag por error nunca deja
 * un login simulado en un entorno real. Además, mientras solo exista el mock, el
 * transporte de negocio queda bloqueado: un usuario simulado no emite peticiones
 * hacia APIM ni hacia el backend configurado.
 */
export function failClosedAuthApiPort(): never {
  throw new Error(
    'authCoreV2 solo dispone de un adaptador mock provisional; no está disponible en builds de producción.',
  );
}

export function provideAuthCoreV2(): Provider[] {
  return [
    {
      provide: AuthApiPort,
      useFactory: () =>
        typeof ngDevMode !== 'undefined' && ngDevMode
          ? new MockAuthApiAdapter()
          : failClosedAuthApiPort(),
    },
    // Sesión simulada: el transporte HTTP de negocio permanece cerrado. Un futuro
    // adaptador HTTP real (B07) deberá declararlo 'enabled' de forma explícita.
    { provide: AUTH_V2_BUSINESS_TRANSPORT, useValue: 'blocked' },
    { provide: SessionLock, useClass: WebLocksSessionLock },
    { provide: SessionSignalChannel, useClass: BroadcastSessionSignalChannel },
  ];
}
