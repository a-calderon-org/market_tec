import { computed, Injectable, signal } from '@angular/core';
import { AuthenticatedUser, AuthResponse, SessionResponse, SessionSnapshot } from './auth-contract';

export type AuthSessionStatus =
  /** Sin sesión conocida en esta pestaña (memoria vacía). */
  | 'anonymous'
  /** Hay sesión reconocida; el access JWT puede estar presente o no. */
  | 'active'
  /** Se perdió la sesión: hay que volver a autenticar con Google. */
  | 'reauthentication-required'
  /** Logout explícito (propio o de otra pestaña). No se restaura hasta un login nuevo. */
  | 'closed';

export type ReauthenticationReason =
  | 'mutual-exclusion-unavailable'
  | 'session-invalid'
  | 'session-changed'
  | 'refresh-unrecoverable'
  | 'session-expired';

/**
 * Estado de sesión interno, SOLO en memoria (D-01): access JWT, CSRF, usuario y
 * snapshot. No escribe en localStorage, sessionStorage ni IndexedDB.
 *
 * `epoch` sube con cada transición que invalida credenciales (logout, pérdida
 * de sesión). Quien inicia una operación asíncrona captura el epoch y descarta
 * su resultado si cambió: así una respuesta tardía no repone credenciales.
 */
@Injectable({ providedIn: 'root' })
export class AuthSessionStore {
  private readonly accessTokenState = signal<{ token: string; expiresAt: number } | null>(null);
  private readonly csrfTokenState = signal<string | null>(null);
  private readonly userState = signal<AuthenticatedUser | null>(null);
  private readonly sessionState = signal<SessionSnapshot | null>(null);
  private readonly statusState = signal<AuthSessionStatus>('anonymous');
  private readonly reasonState = signal<ReauthenticationReason | null>(null);
  private currentEpoch = 0;

  readonly user = computed(() => this.userState());
  readonly session = computed(() => this.sessionState());
  readonly status = computed(() => this.statusState());
  readonly reauthenticationReason = computed(() => this.reasonState());

  get epoch(): number {
    return this.currentEpoch;
  }

  /** Access JWT solo si sigue vigente según el `expiresAt` que informó el servidor. */
  accessToken(nowMs: number): string | null {
    const current = this.accessTokenState();

    return current && current.expiresAt * 1000 > nowMs ? current.token : null;
  }

  /** CSRF en memoria. No registrar ni persistir. */
  csrfToken(): string | null {
    return this.csrfTokenState();
  }

  isSessionExpired(nowMs: number): boolean {
    const session = this.sessionState();

    return session !== null && session.expiresAt * 1000 <= nowMs;
  }

  /** Aplica login/refresh. Devuelve false (sin cambios) si el epoch ya no es el esperado. */
  applyAuthResponse(response: AuthResponse, expectedEpoch: number): boolean {
    if (expectedEpoch !== this.currentEpoch || this.statusState() === 'closed') {
      return false;
    }

    this.accessTokenState.set({ token: response.token, expiresAt: response.expiresAt });
    this.csrfTokenState.set(response.csrfToken);
    this.userState.set(response.user);
    this.sessionState.set(response.session);
    this.reasonState.set(null);
    this.statusState.set('active');

    return true;
  }

  /**
   * Aplica el resultado de `GET /session`: usuario, snapshot y CSRF. No toca el
   * access JWT, porque esa respuesta no lo entrega.
   */
  applySessionResponse(response: SessionResponse, expectedEpoch: number): boolean {
    if (expectedEpoch !== this.currentEpoch || this.statusState() === 'closed') {
      return false;
    }

    this.csrfTokenState.set(response.csrfToken);
    this.userState.set(response.user);
    this.sessionState.set(response.session);
    this.reasonState.set(null);
    this.statusState.set('active');

    return true;
  }

  /** Descarta el access JWT rechazado, solo si sigue siendo ese. */
  dropAccessToken(rejectedToken: string): boolean {
    if (this.accessTokenState()?.token !== rejectedToken) {
      return false;
    }

    this.accessTokenState.set(null);
    return true;
  }

  /** Pérdida de sesión: limpia credenciales y exige autenticar de nuevo. */
  requireReauthentication(reason: ReauthenticationReason): void {
    if (this.statusState() === 'closed') return;

    this.clearCredentials();
    this.reasonState.set(reason);
    this.statusState.set('reauthentication-required');
    this.currentEpoch++;
  }

  /** Logout: limpia todo e invalida cualquier operación pendiente. */
  close(): void {
    this.clearCredentials();
    this.reasonState.set(null);
    this.statusState.set('closed');
    this.currentEpoch++;
  }

  /** Permite un login nuevo tras un logout o una pérdida de sesión. Devuelve el epoch vigente. */
  beginLogin(): number {
    if (this.statusState() === 'closed' || this.statusState() === 'reauthentication-required') {
      this.reasonState.set(null);
      this.statusState.set('anonymous');
    }

    return this.currentEpoch;
  }

  private clearCredentials(): void {
    this.accessTokenState.set(null);
    this.csrfTokenState.set(null);
    this.userState.set(null);
    this.sessionState.set(null);
  }
}
