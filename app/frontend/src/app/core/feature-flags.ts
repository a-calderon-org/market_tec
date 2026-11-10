import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';

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
  /**
   * Publicaciones con el JWT interno de ms-users hacia el ms-catalog propio (`catalogApiBaseUrl` apuntando al proxy
   * `/api/catalog-v2/v1`), válido para sesiones Google y Magic Link. Apagado por defecto: se conserva el camino
   * heredado (ID Token de Google hacia `markettec-api-v1`). Solo tiene efecto con `authCoreV2`.
   */
  readonly catalogInternalJwt?: boolean;
  /**
   * Inicio de sesión con correo institucional y contraseña, configuración de la primera contraseña y recuperación
   * (ms-users `users.password.enabled`). Apagado por defecto: sin él la pantalla solo ofrece Google y el enlace por
   * correo, y no existe ningún formulario de contraseña. Solo tiene efecto con `authCoreV2` y el adaptador `http`.
   */
  readonly passwordAuth?: boolean;
  /**
   * Opción «Continuar con correo institucional» (Magic Link de acceso y registro). Activa por defecto bajo `authCoreV2`;
   * un build la apaga con `false` cuando ms-users no puede entregar correo (`USERS_EMAIL_ENABLED=false`), para no ofrecer
   * un formulario que no puede completar el envío.
   */
  readonly emailLinkAuth?: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = Object.freeze({
  authCoreV2: false,
  authCoreV2Adapter: 'mock',
  authCoreV2HttpTopologyVerified: false,
  catalogInternalJwt: false,
  passwordAuth: false,
  emailLinkAuth: true,
});

/**
 * Flags del build. Solo un build cuyo `environment.ts` declare `featureFlags` (p. ej. el preview de staging
 * `d04`) cambia los valores; producción y CI no lo declaran y conservan `DEFAULT_FEATURE_FLAGS`. Solo se
 * aceptan valores del tipo exacto: cualquier otro se ignora y queda el valor por defecto.
 */
export function resolveFeatureFlags(source: unknown): FeatureFlags {
  if (typeof source !== 'object' || source === null) return DEFAULT_FEATURE_FLAGS;
  const raw = source as Record<string, unknown>;
  return Object.freeze({
    authCoreV2: typeof raw['authCoreV2'] === 'boolean' ? raw['authCoreV2'] : DEFAULT_FEATURE_FLAGS.authCoreV2,
    authCoreV2Adapter:
      raw['authCoreV2Adapter'] === 'http' || raw['authCoreV2Adapter'] === 'mock'
        ? raw['authCoreV2Adapter']
        : DEFAULT_FEATURE_FLAGS.authCoreV2Adapter,
    authCoreV2HttpTopologyVerified:
      typeof raw['authCoreV2HttpTopologyVerified'] === 'boolean'
        ? raw['authCoreV2HttpTopologyVerified']
        : DEFAULT_FEATURE_FLAGS.authCoreV2HttpTopologyVerified,
    catalogInternalJwt:
      typeof raw['catalogInternalJwt'] === 'boolean'
        ? raw['catalogInternalJwt']
        : DEFAULT_FEATURE_FLAGS.catalogInternalJwt,
    passwordAuth:
      typeof raw['passwordAuth'] === 'boolean' ? raw['passwordAuth'] : DEFAULT_FEATURE_FLAGS.passwordAuth,
    emailLinkAuth:
      typeof raw['emailLinkAuth'] === 'boolean' ? raw['emailLinkAuth'] : DEFAULT_FEATURE_FLAGS.emailLinkAuth,
  });
}

export const FEATURE_FLAGS = new InjectionToken<FeatureFlags>('FEATURE_FLAGS', {
  providedIn: 'root',
  factory: () => resolveFeatureFlags((environment as { featureFlags?: unknown }).featureFlags),
});
