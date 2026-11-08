import { inject, InjectionToken } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { FEATURE_FLAGS, FeatureFlags } from '../../feature-flags';

declare const ngDevMode: unknown;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Valida la API base para el adaptador HTTP real y devuelve su forma normalizada
 * (origen + ruta, sin barra final), o null si no es un destino autorizable.
 *
 * - URL absoluta: una ruta relativa o vacía es ambigua (dependería del host del
 *   documento) y no se acepta como "la API".
 * - `https:` obligatorio. `http:` solo hacia loopback y solo si `allowLoopbackHttp`
 *   (pruebas locales en build de desarrollo).
 * - Sin credenciales en la URL, sin query y sin fragmento.
 *
 * No decide hosts definitivos (D-04): solo rechaza configuraciones inseguras.
 */
export function resolveHttpApiBase(value: unknown, allowLoopbackHttp: boolean): string | null {
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw || raw.includes('?') || raw.includes('#') || raw.includes('\\')) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const secure = url.protocol === 'https:';
  const loopbackHttp =
    allowLoopbackHttp && url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);

  if ((!secure && !loopbackHttp) || url.username || url.password || url.search || url.hash) {
    return null;
  }

  const path = url.pathname.replace(/\/+$/, '');

  return `${url.origin}${path}`;
}

/**
 * ¿La configuración pide explícitamente el adaptador HTTP real? Exige las tres
 * condiciones: `authCoreV2`, `authCoreV2Adapter === 'http'` y la declaración de
 * topología HTTPS/CORS/cookies verificada (paralela a los flags de ms-users).
 */
export function requestsHttpAdapter(flags: Partial<FeatureFlags>): boolean {
  return (
    flags.authCoreV2 === true &&
    flags.authCoreV2Adapter === 'http' &&
    flags.authCoreV2HttpTopologyVerified === true
  );
}

/**
 * API base autorizada para el adaptador HTTP real, o null si el modo HTTP no
 * está pedido o la configuración no es segura. Con null el núcleo v2 falla
 * cerrado: no hay sesión real ni simulada y el transporte de negocio sigue bloqueado.
 */
export const AUTH_V2_HTTP_API_BASE = new InjectionToken<string | null>('AUTH_V2_HTTP_API_BASE', {
  providedIn: 'root',
  factory: () =>
    requestsHttpAdapter(inject(FEATURE_FLAGS))
      ? resolveHttpApiBase(
          environment.apiBaseUrl,
          typeof ngDevMode !== 'undefined' && !!ngDevMode,
        )
      : null,
});

/** Tope por petición del adaptador HTTP (las de sesión tienen además el del coordinador). */
export const AUTH_V2_HTTP_TIMEOUT_MS = new InjectionToken<number>('AUTH_V2_HTTP_TIMEOUT_MS', {
  providedIn: 'root',
  factory: () => 15_000,
});
