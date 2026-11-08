import { InjectionToken } from '@angular/core';

export interface FeatureFlags {
  /**
   * Núcleo de autenticación v2 (B07, incremento 1): sesión interna en memoria,
   * coordinador D-07 e interceptor D-11. Apagado por defecto; con `false` el
   * cliente conserva el flujo legado (ID Token de Google en sessionStorage),
   * con sus riesgos conocidos. El flag no certifica la seguridad del frontend.
   */
  readonly authCoreV2: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = Object.freeze({
  authCoreV2: false,
});

export const FEATURE_FLAGS = new InjectionToken<FeatureFlags>('FEATURE_FLAGS', {
  providedIn: 'root',
  factory: () => DEFAULT_FEATURE_FLAGS,
});
