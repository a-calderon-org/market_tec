import {
  AuthResponse,
  GoogleExchangeRequest,
  GoogleLoginAttempt,
  SessionResponse,
} from './auth-contract';

/**
 * Puerto hacia ms-users para el núcleo v2. Hoy solo existe un adaptador mock
 * (`MockAuthApiAdapter`); el adaptador HTTP real queda pendiente de B07 y de la
 * topología same-site HTTPS (D-04). Un adaptador HTTP deberá usar `HttpBackend`
 * (no el interceptor de negocio) y `withCredentials` solo en las cinco rutas de cookie.
 *
 * Todas las operaciones rechazan con `AuthApiError`. `status === 0` es red,
 * timeout, abort o respuesta perdida.
 */
export abstract class AuthApiPort {
  abstract createGoogleAttempt(signal?: AbortSignal): Promise<GoogleLoginAttempt>;

  abstract exchangeGoogle(
    request: GoogleExchangeRequest,
    attemptCsrfToken: string,
    signal?: AbortSignal,
  ): Promise<AuthResponse>;

  /** `GET /v1/auth/session`: reconcilia; no entrega JWT. */
  abstract getSession(signal?: AbortSignal): Promise<SessionResponse>;

  /** `POST /v1/auth/refresh` con `{mode:"rotate"}` y el CSRF vigente. */
  abstract refresh(csrfToken: string, signal?: AbortSignal): Promise<AuthResponse>;

  /** `POST /v1/auth/logout` con `{scope:"current"}`. */
  abstract logout(csrfToken: string | null, signal?: AbortSignal): Promise<void>;
}
