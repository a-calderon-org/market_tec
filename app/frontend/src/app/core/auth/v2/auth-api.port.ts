import {
  AuthResponse,
  EmailLinkProof,
  EmailLinkRequested,
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

  /** `POST /v1/auth/email/requests`: envía el Magic Link institucional y fija la cookie de intento. */
  abstract requestEmailLink(email: string, signal?: AbortSignal): Promise<EmailLinkRequested>;

  /** `POST /v1/auth/email/confirm` con la cookie de intento y su CSRF: sesión nueva o del mismo userId. */
  abstract confirmEmailLink(
    proof: EmailLinkProof,
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
