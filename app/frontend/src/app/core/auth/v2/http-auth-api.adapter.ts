import { inject, Injectable } from '@angular/core';
import {
  HttpBackend,
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
  HttpResponse,
} from '@angular/common/http';
import { Observable, throwError, timeout } from 'rxjs';
import { versionedApiUrl } from '../../api/api-url';
import { AuthApiPort } from './auth-api.port';
import {
  ABORTED_ERROR_CODE,
  AuthApiError,
  AuthenticatedUser,
  AuthResponse,
  GoogleAttemptPurpose,
  GoogleExchangeRequest,
  GoogleLoginAttempt,
  INVALID_RESPONSE_CODE,
  NETWORK_ERROR_CODE,
  readEnvelopeCode,
  SessionResponse,
  SessionSnapshot,
  TIMEOUT_ERROR_CODE,
  BACKEND_WARMING_ERROR_CODE,
} from './auth-contract';
import { AUTH_V2_HTTP_API_BASE, AUTH_V2_HTTP_TIMEOUT_MS, AUTH_V2_WARMING_RETRY_MS } from './auth-v2-config';
import { SESSION_LOCK_NAME, SessionLock } from './session-lock';

/** Marca de cuerpo inutilizable devuelta por los validadores. */
const INVALID = Symbol('invalid');
type Parsed<T> = T | typeof INVALID;

const HEX_32 = /^[0-9a-f]{32}$/;
const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * Adaptador HTTP real de `AuthApiPort` contra ms-users (`main@08ccf05`).
 *
 * Verificado contra `GoogleAuthController`, `SessionBootstrapController`,
 * `SessionRefreshController` y `SessionLogoutController` (ver
 * `docs/MTEC10_AUTH_V2_HTTP_INTEROPERABILITY.md`):
 *
 * - Usa `HttpBackend`: estas peticiones NO pasan por los interceptores de negocio
 *   y jamás llevan `Authorization`.
 * - `withCredentials: true` en las cinco operaciones, porque las cinco dependen
 *   de cookies `__Host-` HttpOnly (`mtec-attempt` o `mtec-refresh`) que el
 *   navegador envía/recibe. El cliente nunca lee ni escribe esas cookies.
 * - `X-MTEC-Client: web` en todas; `X-CSRF-Token` en intercambio Google (CSRF del
 *   intento), refresh y logout (CSRF de sesión, si existe). `Origin` lo pone el
 *   navegador; no se fija a mano.
 * - Sin reintentos: cada llamada emite como máximo una petición.
 * - Errores: `AuthApiError(status, code)` con el `error.code` del sobre Java;
 *   `status 0` con `NETWORK`, `TIMEOUT`, `ABORTED` o `INVALID_RESPONSE`.
 */
@Injectable()
export class HttpAuthApiAdapter extends AuthApiPort {
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly baseUrl: string;
  private readonly timeoutMs = inject(AUTH_V2_HTTP_TIMEOUT_MS);
  private readonly warmingRetryMs = inject(AUTH_V2_WARMING_RETRY_MS);
  private readonly lock = inject(SessionLock);

  constructor() {
    super();
    const base = inject(AUTH_V2_HTTP_API_BASE);

    if (!base) {
      throw new Error('HttpAuthApiAdapter requiere una API base HTTPS autorizada.');
    }

    this.baseUrl = base;
  }

  createGoogleAttempt(
    purpose: GoogleAttemptPurpose,
    signal?: AbortSignal,
  ): Promise<GoogleLoginAttempt> {
    return this.send(
      'POST',
      '/auth/attempts',
      { body: { method: 'google', purpose } },
      (body) => parseAttempt(body, purpose),
      signal,
    );
  }

  exchangeGoogle(
    request: GoogleExchangeRequest,
    attemptCsrfToken: string,
    signal?: AbortSignal,
  ): Promise<AuthResponse> {
    // Registro y login tienen ruta propia en Java; el propósito lo fijó el intento.
    const path = request.purpose === 'register' ? '/auth/google/registrations' : '/auth/google';

    return this.send(
      'POST',
      path,
      {
        // Solo los dos campos que Java acepta: cualquier otro produce 400.
        body: { attemptId: request.attemptId, credential: request.credential },
        csrfToken: attemptCsrfToken,
      },
      parseAuthResponse,
      signal,
    );
  }

  getSession(signal?: AbortSignal): Promise<SessionResponse> {
    return this.send('GET', '/auth/session', {}, parseSessionResponse, signal);
  }

  refresh(csrfToken: string, signal?: AbortSignal): Promise<AuthResponse> {
    return this.send(
      'POST',
      '/auth/refresh',
      { body: { mode: 'rotate' }, csrfToken },
      parseAuthResponse,
      signal,
    );
  }

  async logout(csrfToken: string | null, signal?: AbortSignal, sessionId?: string): Promise<void> {
    if (!sessionId) return;

    const result = await this.lock.run(SESSION_LOCK_NAME, async () => {
      // El CSRF de memoria puede corresponder a una generación anterior de la cookie.
      const current = await this.getSession(signal);
      if (current.session.sessionId === sessionId) {
        await this.postLogout(current.csrfToken, signal);
      }
    }, signal);

    // Sin Web Locks no se rota. El servidor solo acepta el par cookie/CSRF exacto.
    if (result.kind === 'unavailable' && csrfToken) {
      await this.postLogout(csrfToken, signal);
    }
  }

  private postLogout(csrfToken: string, signal?: AbortSignal): Promise<void> {
    return this.send(
      'POST',
      '/auth/logout',
      { body: { scope: 'current' }, csrfToken },
      () => undefined,
      signal,
    );
  }

  /**
   * Una petición con el tope total `timeoutMs`. Solo `503 BACKEND_WARMING` se repite (el proxy garantiza que no se
   * reenvió nada no idempotente); TIMEOUT, red, 504 y el resto de errores se propagan sin reintento.
   */
  private async send<T>(
    method: 'GET' | 'POST',
    versionlessPath: string,
    options: { body?: object; csrfToken?: string | null },
    parse: (body: unknown) => Parsed<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const deadline = Date.now() + this.timeoutMs;

    for (;;) {
      try {
        return await this.sendOnce(method, versionlessPath, options, parse, deadline - Date.now(), signal);
      } catch (error) {
        const warming =
          error instanceof AuthApiError && error.status === 503 && error.code === BACKEND_WARMING_ERROR_CODE;
        if (!warming || deadline - Date.now() <= this.warmingRetryMs) throw error;
        await waitOrAbort(this.warmingRetryMs, signal);
      }
    }
  }

  private sendOnce<T>(
    method: 'GET' | 'POST',
    versionlessPath: string,
    options: { body?: object; csrfToken?: string | null },
    parse: (body: unknown) => Parsed<T>,
    budgetMs: number,
    signal?: AbortSignal,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new AuthApiError(0, ABORTED_ERROR_CODE));
        return;
      }

      let headers = new HttpHeaders({ 'X-MTEC-Client': 'web' });
      if (options.body !== undefined) headers = headers.set('Content-Type', 'application/json');
      if (options.csrfToken) headers = headers.set('X-CSRF-Token', options.csrfToken);

      const request$: Observable<HttpResponse<unknown>> = this.http
        .request<unknown>(method, versionedApiUrl(this.baseUrl, versionlessPath), {
          body: options.body,
          headers,
          withCredentials: true,
          observe: 'response',
          responseType: 'json',
        })
        .pipe(
          timeout({
            first: Math.max(1, budgetMs),
            with: () => throwError(() => new AuthApiError(0, TIMEOUT_ERROR_CODE)),
          }),
        );

      const onAbort = () => {
        subscription.unsubscribe();
        reject(new AuthApiError(0, ABORTED_ERROR_CODE));
      };
      const cleanup = () => signal?.removeEventListener('abort', onAbort);

      const subscription = request$.subscribe({
        next: (response) => {
          cleanup();
          const value = parse(response.body);

          if (value === INVALID) {
            reject(new AuthApiError(0, INVALID_RESPONSE_CODE));
          } else {
            resolve(value);
          }
        },
        error: (error: unknown) => {
          cleanup();
          reject(toAuthApiError(error));
        },
      });

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

function waitOrAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AuthApiError(0, ABORTED_ERROR_CODE));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AuthApiError(0, ABORTED_ERROR_CODE));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function toAuthApiError(error: unknown): AuthApiError {
  if (error instanceof AuthApiError) return error;

  if (error instanceof HttpErrorResponse) {
    // status 0: red, CORS rechazado o respuesta perdida; el navegador no distingue.
    return error.status === 0
      ? new AuthApiError(0, NETWORK_ERROR_CODE)
      : new AuthApiError(error.status, readEnvelopeCode(error.error));
  }

  return new AuthApiError(0, NETWORK_ERROR_CODE);
}

// ---------------------------------------------------------------------------
// Validación de respuestas (formas observadas en los records Java).
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isEpoch(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parseAttempt(body: unknown, purpose: GoogleAttemptPurpose): Parsed<GoogleLoginAttempt> {
  if (
    !isObject(body) ||
    typeof body['attemptId'] !== 'string' ||
    !HEX_32.test(body['attemptId']) ||
    body['method'] !== 'google' ||
    body['purpose'] !== purpose ||
    !isEpoch(body['expiresAt']) ||
    typeof body['csrfToken'] !== 'string' ||
    !HEX_64.test(body['csrfToken']) ||
    !isText(body['nonce'])
  ) {
    return INVALID;
  }

  return {
    attemptId: body['attemptId'],
    purpose,
    nonce: body['nonce'],
    expiresAt: body['expiresAt'],
    csrfToken: body['csrfToken'],
  };
}

function parseUser(value: unknown): AuthenticatedUser | null {
  if (
    !isObject(value) ||
    !isText(value['userId']) ||
    typeof value['email'] !== 'string' ||
    typeof value['nombre'] !== 'string' ||
    (value['fotoPerfil'] !== undefined &&
      value['fotoPerfil'] !== null &&
      typeof value['fotoPerfil'] !== 'string')
  ) {
    return null;
  }

  const foto = value['fotoPerfil'];

  return {
    userId: value['userId'],
    email: value['email'],
    nombre: value['nombre'],
    ...(isText(foto) ? { fotoPerfil: foto } : {}),
  };
}

const SNAPSHOT_TIMES = [
  'serverTime',
  'authenticatedAt',
  'renewedAt',
  'lastActivityAt',
  'windowExpiresAt',
  'inactivityExpiresAt',
  'absoluteExpiresAt',
  'expiresAt',
  'warningAt',
] as const;

function parseSnapshot(value: unknown): SessionSnapshot | null {
  if (!isObject(value) || !isText(value['sessionId']) || value['status'] !== 'active') return null;
  if (!SNAPSHOT_TIMES.every((key) => isEpoch(value[key]))) return null;

  const times = Object.fromEntries(SNAPSHOT_TIMES.map((key) => [key, value[key] as number]));

  return { sessionId: value['sessionId'], status: 'active', ...times } as SessionSnapshot;
}

function parseAuthResponse(body: unknown): Parsed<AuthResponse> {
  if (!isObject(body)) return INVALID;

  const user = parseUser(body['user']);
  const session = parseSnapshot(body['session']);

  if (
    !user ||
    !session ||
    !isText(body['token']) ||
    body['tokenType'] !== 'Bearer' ||
    !isEpoch(body['expiresAt']) ||
    typeof body['csrfToken'] !== 'string' ||
    !HEX_64.test(body['csrfToken'])
  ) {
    return INVALID;
  }

  return {
    token: body['token'],
    tokenType: 'Bearer',
    expiresAt: body['expiresAt'],
    user,
    session,
    csrfToken: body['csrfToken'],
  };
}

function parseSessionResponse(body: unknown): Parsed<SessionResponse> {
  if (!isObject(body)) return INVALID;

  const user = parseUser(body['user']);
  const session = parseSnapshot(body['session']);

  if (!user || !session || typeof body['csrfToken'] !== 'string' || !HEX_64.test(body['csrfToken'])) {
    return INVALID;
  }

  // GET /session no entrega JWT: si viniera un `token`, se ignora.
  return { user, session, csrfToken: body['csrfToken'] };
}
