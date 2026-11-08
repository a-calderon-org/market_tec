import { InjectionToken } from '@angular/core';

/** Adaptador de `AuthApiPort` bajo `authCoreV2`. */
export type AuthCoreV2Adapter =
  /** Simulación en memoria: solo builds de desarrollo; en producción falla cerrado. */
  | 'mock'
  /** ms-users por HTTP: exige además `authCoreV2HttpTopologyVerified` y una API base HTTPS. */
  | 'http';

export interface FeatureFlags {
  /**
   * Núcleo de autenticación v2 (B07, incremento 1): sesión interna en memoria,
   * coordinador D-07 e interceptor D-11. Apagado por defecto; con `false` el
   * cliente conserva el flujo legado (ID Token de Google en sessionStorage),
   * con sus riesgos conocidos. El flag no certifica la seguridad del frontend.
   */
  readonly authCoreV2: boolean;
  /** Adaptador seleccionado bajo `authCoreV2`. Por defecto `mock` (nunca HTTP real). */
  readonly authCoreV2Adapter?: AuthCoreV2Adapter;
  /**
   * Declaración explícita de que la topología HTTPS same-site, CORS y cookies
   * `__Host-` está verificada para el destino configurado (D-04, pendiente). Sin
   * ella el adaptador HTTP no se construye. No sustituye a los flags de ms-users.
   */
  readonly authCoreV2HttpTopologyVerified?: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = Object.freeze({
  authCoreV2: false,
  authCoreV2Adapter: 'mock',
  authCoreV2HttpTopologyVerified: false,
});

export const FEATURE_FLAGS = new InjectionToken<FeatureFlags>('FEATURE_FLAGS', {
  providedIn: 'root',
  factory: () => DEFAULT_FEATURE_FLAGS,
});
