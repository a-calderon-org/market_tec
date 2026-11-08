import {
  AuthResponse,
  GoogleAttemptPurpose,
  GoogleExchangeRequest,
  GoogleLoginAttempt,
  SessionResponse,
} from './auth-contract';

/**
 * Puerto hacia ms-users para el núcleo v2. Adaptadores: `MockAuthApiAdapter`
 * (solo desarrollo/pruebas) y `HttpAuthApiAdapter` (HTTP real, usa `HttpBackend`
 * y `withCredentials` solo en las rutas de cookie). La selección está en
 * `provideAuthCoreV2`.
 *
 * Todas las operaciones rechazan con `AuthApiError`. `status === 0` es red,
 * timeout, abort o respuesta perdida.
 */
export abstract class AuthApiPort {
  abstract createGoogleAttempt(
    purpose: GoogleAttemptPurpose,
    signal?: AbortSignal,
  ): Promise<GoogleLoginAttempt>;

  abstract exchangeGoogle(
    request: GoogleExchangeRequest,
    attemptCsrfToken: string,
    signal?: AbortSignal,
  ): Promise<AuthResponse>;

  /** `GET /v1/auth/session`: reconcilia; no entrega JWT. */
  abstract getSession(signal?: AbortSignal): Promise<SessionResponse>;

  /** `POST /v1/auth/refresh` con `{mode:"rotate"}` y el CSRF vigente. */
  abstract refresh(csrfToken: string, signal?: AbortSignal): Promise<AuthResponse>;

  /** Logout de la sesión local indicada. HTTP obtiene el CSRF vigente dentro del lock. */
  abstract logout(csrfToken: string | null, signal?: AbortSignal, sessionId?: string): Promise<void>;
}
