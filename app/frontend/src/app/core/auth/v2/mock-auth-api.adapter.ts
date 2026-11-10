import { AuthApiPort } from './auth-api.port';
import {
  ABORTED_ERROR_CODE,
  AuthApiError,
  AuthenticatedUser,
  AuthResponse,
  EmailLinkProof,
  EmailLinkRequested,
  GoogleAttemptPurpose,
  GoogleExchangeRequest,
  GoogleLoginAttempt,
  NETWORK_ERROR_CODE,
  SessionResponse,
  SessionSnapshot,
} from './auth-contract';

/**
 * ============================================================================
 *  PROVISIONAL — SIMULACIÓN LOCAL, NO ES UN CONTRATO APROBADO NI UN SERVIDOR
 * ============================================================================
 * Simula, en memoria, la parte de ms-users que el núcleo v2 necesita para
 * probar arquitectura e integración. Los comportamientos marcados
 * `[PROVISIONAL]` NO están aprobados por B07 y no deben leerse como contrato:
 *
 * - [PROVISIONAL] Los códigos de error del mock son los del OpenAPI Draft 0.3
 *   (`REFRESH_INVALID`, `AUTH_REQUIRED`); el catálogo de D-11 sigue pendiente.
 * - [PROVISIONAL] Un CSRF de una generación anterior se rechaza con
 *   `401 REFRESH_INVALID` sin revocar la generación ganadora (política C).
 *   El código HTTP real para esa prueba inválida no está fijado.
 * - [PROVISIONAL] El mock acepta cualquier credential no vacío; no valida firma,
 *   `aud`, `iss` ni nonce de Google.
 * - [PROVISIONAL] Los valores de tiempo (ventana de 240 s) son ilustrativos.
 *
 * Un "backend" compartido entre dos adaptadores modela dos pestañas contra la
 * misma cookie. Eso NO equivale a una carrera real de navegador: las carreras
 * multi-tab con Web Locks reales requieren Playwright u otra prueba en navegador.
 */

export type RefreshBehavior =
  | 'ok'
  /** El servidor consume la generación pero el cliente nunca recibe la respuesta. */
  | 'lost-response'
  /** El servidor no responde hasta que el cliente aborta. */
  | 'hang'
  /** El servidor rechaza con 401 REFRESH_INVALID sin rotar. */
  | 'refresh-invalid'
  | 'unavailable';

export const MOCK_USER: AuthenticatedUser = {
  userId: 'usr_mock_0001',
  email: 'mock.student@estudiantec.cr',
  nombre: 'Mock Student',
};

const ACCESS_WINDOW_SECONDS = 240;
const SESSION_WINDOW_SECONDS = 3600;

export class MockAuthBackend {
  private generation = 0;
  private cookieValid = false;
  private tokenCounter = 0;
  private readonly refreshScript: RefreshBehavior[] = [];
  private nextSessionGetFailure: AuthApiError | null = null;

  readonly stats = { sessionGets: 0, refreshPosts: 0, logoutPosts: 0, exchanges: 0 };

  get hasSession(): boolean {
    return this.cookieValid;
  }

  /** Programa el comportamiento de los próximos refresh (por defecto 'ok'). */
  scriptRefresh(...behaviors: RefreshBehavior[]): void {
    this.refreshScript.push(...behaviors);
  }

  failNextSessionGet(error: AuthApiError): void {
    this.nextSessionGetFailure = error;
  }

  expireCookie(): void {
    this.cookieValid = false;
  }

  startSession(): AuthResponse {
    this.stats.exchanges++;
    this.cookieValid = true;
    this.generation++;

    return this.issue();
  }

  getSession(): SessionResponse {
    this.stats.sessionGets++;

    if (this.nextSessionGetFailure) {
      const failure = this.nextSessionGetFailure;
      this.nextSessionGetFailure = null;
      throw failure;
    }

    if (!this.cookieValid) {
      throw new AuthApiError(401, 'AUTH_REQUIRED');
    }

    return {
      session: this.snapshot(),
      user: MOCK_USER,
      csrfToken: this.csrf(this.generation),
    };
  }

  /** Devuelve la respuesta y el comportamiento que el adaptador debe aplicar. */
  refresh(csrfToken: string): { behavior: RefreshBehavior; response?: AuthResponse } {
    this.stats.refreshPosts++;

    const behavior = this.refreshScript.shift() ?? 'ok';

    if (!this.cookieValid || csrfToken !== this.csrf(this.generation)) {
      return { behavior: 'refresh-invalid' };
    }

    if (behavior === 'ok' || behavior === 'lost-response') {
      this.generation++;
      return { behavior, response: this.issue() };
    }

    return { behavior };
  }

  logout(): void {
    this.stats.logoutPosts++;
    this.cookieValid = false;
  }

  private issue(): AuthResponse {
    const snapshot = this.snapshot();

    return {
      token: `mock-access-${++this.tokenCounter}`,
      tokenType: 'Bearer',
      expiresAt: snapshot.serverTime + ACCESS_WINDOW_SECONDS,
      user: MOCK_USER,
      session: snapshot,
      csrfToken: this.csrf(this.generation),
    };
  }

  private snapshot(): SessionSnapshot {
    const now = Math.floor(Date.now() / 1000);

    return {
      sessionId: 'mock-session',
      status: 'active',
      serverTime: now,
      authenticatedAt: now,
      renewedAt: now,
      lastActivityAt: now,
      windowExpiresAt: now + SESSION_WINDOW_SECONDS,
      inactivityExpiresAt: now + SESSION_WINDOW_SECONDS,
      absoluteExpiresAt: now + SESSION_WINDOW_SECONDS * 8,
      expiresAt: now + SESSION_WINDOW_SECONDS,
      warningAt: now + SESSION_WINDOW_SECONDS - 300,
    };
  }

  private csrf(generation: number): string {
    return `mock-csrf-gen-${generation}`;
  }
}

/**
 * Adaptador mock: se comporta como el puerto; toda la lógica vive en `MockAuthBackend`.
 * Sin `@Injectable` a propósito: se construye con `new` solo en dev/pruebas, y así el
 * bundler de producción puede descartarlo junto con la rama `ngDevMode`.
 */
export class MockAuthApiAdapter extends AuthApiPort {
  constructor(readonly backend: MockAuthBackend = new MockAuthBackend()) {
    super();
  }

  createGoogleAttempt(purpose: GoogleAttemptPurpose = 'login'): Promise<GoogleLoginAttempt> {
    return Promise.resolve({
      attemptId: 'mock-attempt',
      purpose,
      nonce: 'mock-nonce',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      csrfToken: 'mock-attempt-csrf',
    });
  }

  exchangeGoogle(request: GoogleExchangeRequest): Promise<AuthResponse> {
    if (!request.credential) {
      return Promise.reject(new AuthApiError(401, 'AUTH_REQUIRED'));
    }

    return Promise.resolve(this.backend.startSession());
  }

  requestEmailLink(email: string): Promise<EmailLinkRequested> {
    return email.includes('@')
      ? Promise.resolve({ csrfToken: 'mock-email-attempt-csrf' })
      : Promise.reject(new AuthApiError(400, 'INVALID_REQUEST'));
  }

  /** La contraseña no se simula: sin ms-users real no hay credenciales que verificar. */
  loginWithPassword(): Promise<AuthResponse> {
    return Promise.reject(new AuthApiError(503, 'AUTH_TEMPORARILY_UNAVAILABLE'));
  }

  requestPasswordRecovery(): Promise<EmailLinkRequested> {
    return Promise.reject(new AuthApiError(503, 'AUTH_TEMPORARILY_UNAVAILABLE'));
  }

  confirmEmailLink(proof: EmailLinkProof, attemptCsrfToken: string): Promise<AuthResponse> {
    if (!proof.token || attemptCsrfToken !== 'mock-email-attempt-csrf') {
      return Promise.reject(new AuthApiError(403, 'CSRF_INVALID'));
    }

    return Promise.resolve(this.backend.startSession());
  }

  getSession(signal?: AbortSignal): Promise<SessionResponse> {
    return this.settle(signal, () => this.backend.getSession());
  }

  refresh(csrfToken: string, signal?: AbortSignal): Promise<AuthResponse> {
    return this.settle(signal, () => {
      const outcome = this.backend.refresh(csrfToken);

      switch (outcome.behavior) {
        case 'ok':
          return outcome.response as AuthResponse;
        case 'lost-response':
          throw new AuthApiError(0, NETWORK_ERROR_CODE);
        case 'hang':
          return HANG;
        case 'unavailable':
          throw new AuthApiError(503, 'AUTH_TEMPORARILY_UNAVAILABLE');
        case 'refresh-invalid':
          throw new AuthApiError(401, 'REFRESH_INVALID');
      }
    });
  }

  logout(_csrfToken: string | null, signal?: AbortSignal): Promise<void> {
    return this.settle(signal, () => this.backend.logout());
  }

  private settle<T>(signal: AbortSignal | undefined, action: () => T | typeof HANG): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new AuthApiError(0, ABORTED_ERROR_CODE));
        return;
      }

      let result: T | typeof HANG;
      try {
        result = action();
      } catch (error) {
        reject(error);
        return;
      }

      if (result === HANG) {
        signal?.addEventListener('abort', () => reject(new AuthApiError(0, ABORTED_ERROR_CODE)));
        return;
      }

      resolve(result);
    });
  }
}

const HANG = Symbol('mock-hang');
