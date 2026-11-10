/**
 * Tipos del núcleo de autenticación v2 (flag `authCoreV2`).
 *
 * ESTADO: derivados de `contracts/openapi/users.json` 0.3.0-draft y verificados
 * contra los controladores Java de ms-users (`main@08ccf05`); ver
 * `docs/MTEC10_AUTH_V2_HTTP_INTEROPERABILITY.md`. B07 NO está aprobado: ninguna
 * forma de este archivo es un contrato vigente.
 */

export type EpochSeconds = number;

/** Usuario interno. `userId` es opaco y es la única identidad autorizada (D-08). */
export interface AuthenticatedUser {
  readonly userId: string;
  readonly email: string;
  readonly nombre: string;
  readonly fotoPerfil?: string;
}

export interface SessionSnapshot {
  readonly sessionId: string;
  readonly status: 'active';
  readonly serverTime: EpochSeconds;
  readonly authenticatedAt: EpochSeconds;
  readonly renewedAt: EpochSeconds;
  readonly lastActivityAt: EpochSeconds;
  readonly windowExpiresAt: EpochSeconds;
  readonly inactivityExpiresAt: EpochSeconds;
  readonly absoluteExpiresAt: EpochSeconds;
  readonly expiresAt: EpochSeconds;
  readonly warningAt: EpochSeconds;
}

/** Respuesta de login/refresh: la única que entrega el JWT interno. */
export interface AuthResponse {
  readonly token: string;
  readonly tokenType: 'Bearer';
  readonly expiresAt: EpochSeconds;
  readonly user: AuthenticatedUser;
  readonly session: SessionSnapshot;
  readonly csrfToken: string;
}

/** Respuesta de `GET /v1/auth/session`: reconcilia estado; NO entrega JWT. */
export interface SessionResponse {
  readonly session: SessionSnapshot;
  readonly user: AuthenticatedUser;
  readonly csrfToken: string;
}

/**
 * Propósito del intento Google. Java acepta ambos; `register` responde 503
 * `AUTH_TEMPORARILY_UNAVAILABLE` mientras `users.google.registration.enabled=false`.
 * La semántica contractual de D-06 sigue pendiente: Angular nunca convierte un
 * login fallido en registro.
 */
export type GoogleAttemptPurpose = 'login' | 'register';

/** Intento de login con Google (nonce que debe pasar a `initialize` de GIS). */
export interface GoogleLoginAttempt {
  readonly attemptId: string;
  readonly purpose: GoogleAttemptPurpose;
  readonly nonce: string;
  readonly expiresAt: EpochSeconds;
  /** Solo memoria; no registrar. */
  readonly csrfToken: string;
}

/**
 * ID Token de Google. Es una prueba transitoria que se intercambia una vez; no
 * es sesión de API, no se guarda y nunca se envía como bearer.
 */
export type GoogleCredential = string;

export interface GoogleExchangeRequest {
  readonly attemptId: string;
  readonly credential: GoogleCredential;
  /** Selecciona la ruta de intercambio; NO viaja en el cuerpo (Java rechaza campos extra). */
  readonly purpose: GoogleAttemptPurpose;
}

/** `202` de `POST /v1/auth/email/requests`: el CSRF deriva de la cookie HttpOnly `__Host-mtec-email-attempt`. */
export interface EmailLinkRequested {
  readonly csrfToken: string;
}

/** Datos del fragmento del Magic Link (`#attempt=…&token=…`). Solo en memoria; nunca se persisten ni registran. */
export interface EmailLinkProof {
  readonly attemptId: string;
  readonly token: string;
}

/** `status === 0` representa red/CORS, timeout o respuesta perdida. */
export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message = `Auth API error ${status}${code ? ` ${code}` : ''}`,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

export const NETWORK_ERROR_CODE = 'NETWORK';
export const TIMEOUT_ERROR_CODE = 'TIMEOUT';
export const ABORTED_ERROR_CODE = 'ABORTED';
/**
 * 503 del proxy same-origin de Static Web Apps (MTEC-12/D04) mientras ms-users arranca desde cero. Garantiza que la
 * petición NO se reenvió (o era una lectura), así que repetirla es seguro. Cualquier otro error no se reintenta.
 */
export const BACKEND_WARMING_ERROR_CODE = 'BACKEND_WARMING';
/** 2xx con un cuerpo que no cumple la forma esperada: se trata como respuesta inutilizable. */
export const INVALID_RESPONSE_CODE = 'INVALID_RESPONSE';

/**
 * Lee `error.error.code` del sobre `{error:{code,...}}` (A-07). Un cuerpo
 * ausente, no objeto o con `code` no textual devuelve null (D-11: error genérico).
 */
export function readEnvelopeCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;

  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** La petición no se envió porque no hay sesión utilizable (no es un 401 del servidor). */
export class AuthRequiredError extends Error {
  constructor(readonly reason: 'reauthentication-required' | 'token-unavailable' | 'cancelled') {
    super(`Authentication required: ${reason}`);
    this.name = 'AuthRequiredError';
  }
}
