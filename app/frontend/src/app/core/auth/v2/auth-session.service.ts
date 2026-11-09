import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AuthApiPort } from './auth-api.port';
import {
  AuthenticatedUser,
  AuthRequiredError,
  GoogleAttemptPurpose,
  GoogleCredential,
  GoogleLoginAttempt,
} from './auth-contract';
import { AuthSessionStore } from './auth-session.store';
import { SessionCoordinator } from './session-coordinator';

const LEGACY_GOOGLE_TOKEN_KEY = 'google_token';

/** Access JWT junto con la generación de sesión (epoch) en la que se leyó. */
export interface AccessCredential {
  readonly token: string;
  readonly epoch: number;
}

/**
 * Identidad interna y generación de sesión en el instante en que se inició una
 * operación. Sirve para descartar respuestas que llegan después de un logout o
 * de un cambio de usuario.
 */
export interface SessionIdentity {
  readonly userId: string;
  readonly epoch: number;
}

/** Fachada del núcleo v2 para guards, interceptor y UI. */
@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly api = inject(AuthApiPort);
  private readonly store = inject(AuthSessionStore);
  private readonly coordinator = inject(SessionCoordinator);
  private readonly router = inject(Router, { optional: true });

  /** Usuario interno (userId opaco). Nunca el `sub` de Google, el correo ni `USR-001`. */
  readonly user = this.store.user;
  readonly status = this.store.status;

  constructor() {
    // D-01: el ID Token de Google ya no es sesión. Se elimina el rastro del flujo legado.
    try {
      globalThis.sessionStorage?.removeItem(LEGACY_GOOGLE_TOKEN_KEY);
    } catch {
      // El almacenamiento puede estar bloqueado; no hay nada que limpiar.
    }
  }

  /** Crea el intento cuyo `nonce` debe pasarse a `google.accounts.id.initialize`. */
  startGoogleAttempt(purpose: GoogleAttemptPurpose = 'login'): Promise<GoogleLoginAttempt> {
    return this.api.createGoogleAttempt(purpose);
  }

  /** Identidad interna vigente, o null si no hay sesión activa con usuario. */
  currentIdentity(): SessionIdentity | null {
    const user: AuthenticatedUser | null = this.store.user();

    return this.store.status() === 'active' && user
      ? { userId: user.userId, epoch: this.store.epoch }
      : null;
  }

  /** ¿Sigue vigente la identidad capturada (misma generación y mismo usuario)? */
  isCurrentIdentity(identity: SessionIdentity): boolean {
    const current = this.currentIdentity();

    return current !== null && current.epoch === identity.epoch && current.userId === identity.userId;
  }

  /**
   * Intercambia el ID Token de Google por la sesión interna. El credential se usa
   * una sola vez y no se almacena: la sesión posterior solo tiene JWT/CSRF internos.
   */
  async signInWithGoogle(credential: GoogleCredential, attempt: GoogleLoginAttempt): Promise<void> {
    if (attempt.expiresAt * 1000 <= Date.now()) {
      throw new AuthRequiredError('reauthentication-required');
    }

    const epoch = this.store.beginLogin();
    const response = await this.api.exchangeGoogle(
      { attemptId: attempt.attemptId, credential, purpose: attempt.purpose },
      attempt.csrfToken,
    );

    if (!this.store.applyAuthResponse(response, epoch)) {
      // Hubo un logout mientras el intercambio estaba en vuelo: no se repone la sesión.
      throw new AuthRequiredError('cancelled');
    }
  }

  /** Bootstrap + refresh dentro de la sección crítica; true si hay JWT interno vigente. */
  async restoreSession(): Promise<boolean> {
    const outcome = await this.coordinator.ensureAccessToken();

    return outcome.kind === 'authenticated';
  }

  /** Access JWT vigente para una petición de negocio, o null si no se pudo obtener. */
  async getAccessToken(): Promise<string | null> {
    return (await this.acquireAccessCredential())?.token ?? null;
  }

  /**
   * Como `getAccessToken`, pero devuelve también el epoch de la sesión en el que
   * se leyó el JWT (ambos en el mismo tramo síncrono), para revalidarlo con
   * `revalidate` justo antes del despacho.
   */
  async acquireAccessCredential(): Promise<AccessCredential | null> {
    // La generación de sesión es la identidad de ESTA demanda: se fija antes de
    // cualquier espera y se exige en cada lectura posterior. Leer "el token más
    // reciente" tras el `await` entregaría a una demanda de la sesión A el JWT de B.
    const epoch = this.store.epoch;

    const current = this.readCredential(epoch);
    if (current) return current;

    const outcome = await this.coordinator.ensureAccessToken(epoch);

    return outcome.kind === 'authenticated' ? this.readCredential(epoch) : null;
  }

  /**
   * Comprobación SÍNCRONA del JWT leído antes: devuelve el token solo si la
   * sesión sigue en la misma generación (sin logout intermedio, aunque haya un
   * login posterior) y el JWT sigue siendo el vigente. Debe llamarse en el mismo
   * tramo síncrono que despacha la petición.
   */
  revalidate(credential: AccessCredential): string | null {
    const current = this.readCredential();

    return current && current.epoch === credential.epoch && current.token === credential.token
      ? current.token
      : null;
  }

  /**
   * Con `expectedEpoch`, solo devuelve la credencial si la sesión sigue en esa
   * generación; si cambió, devuelve null sin tocar la sesión actual.
   */
  private readCredential(expectedEpoch?: number): AccessCredential | null {
    if (this.store.status() === 'closed') return null;
    if (expectedEpoch !== undefined && this.store.epoch !== expectedEpoch) return null;

    const token = this.store.accessToken(Date.now());

    return token ? { token, epoch: this.store.epoch } : null;
  }

  /**
   * D-11: un 401 de negocio NO reejecuta la petición. Se descarta el JWT
   * rechazado (si sigue siendo el vigente) y se recupera la sesión como mucho una
   * vez por demanda; si hace falta autenticar de nuevo, se envía a `/login`.
   */
  handleBusinessUnauthorized(rejectedToken: string): void {
    if (!this.store.dropAccessToken(rejectedToken)) return;

    void this.coordinator.ensureAccessToken().then((outcome) => {
      // Sin esperas entre la comprobación y la navegación: un resultado de una sesión
      // anterior (hubo logout y quizá un login nuevo) jamás navega ni toca la actual.
      if (
        outcome.kind === 'reauthentication-required' &&
        this.store.status() === 'reauthentication-required' &&
        this.store.epoch === outcome.epoch
      ) {
        void this.router?.navigate(['/login']);
      }
    });
  }

  async logout(): Promise<void> {
    await this.coordinator.logout();
  }
}
