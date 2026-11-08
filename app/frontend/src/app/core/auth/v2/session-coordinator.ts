import { DestroyRef, inject, Injectable, InjectionToken } from '@angular/core';
import { AuthApiPort } from './auth-api.port';
import {
  ABORTED_ERROR_CODE,
  AuthApiError,
  AuthResponse,
  SessionResponse,
  TIMEOUT_ERROR_CODE,
} from './auth-contract';
import { AuthSessionStore, ReauthenticationReason } from './auth-session.store';
import { SESSION_LOCK_NAME, SessionLock } from './session-lock';
import { SessionSignalChannel } from './session-signal-channel';

export interface SessionCoordinatorConfig {
  /** Tope por petición de sesión (GET /session y POST /refresh). */
  readonly requestTimeoutMs: number;
}

export const SESSION_COORDINATOR_CONFIG = new InjectionToken<SessionCoordinatorConfig>(
  'SESSION_COORDINATOR_CONFIG',
  { providedIn: 'root', factory: () => ({ requestTimeoutMs: 10_000 }) },
);

export type SessionOutcome =
  /** Hay access JWT vigente en memoria. */
  | { readonly kind: 'authenticated' }
  /**
   * Hay que autenticar de nuevo con Google. No se encadenó ningún POST. `epoch` es
   * la generación RESULTANTE de la transición que produjo este estado (la propia
   * transición incrementa el epoch): solo mientras siga siendo la generación actual
   * y el estado siga siendo 'reauthentication-required' el resultado es vigente.
   */
  | {
      readonly kind: 'reauthentication-required';
      readonly reason: ReauthenticationReason;
      readonly epoch: number;
    }
  /**
   * El refresh falló pero `GET /session` confirmó que la cookie sigue vigente.
   * No prueba una rotación ni entrega JWT: el siguiente refresh solo ocurre ante
   * una NUEVA demanda de token.
   */
  | { readonly kind: 'session-valid-without-token' }
  /** `GET /session` no pudo responder (red, 403, 429, 5xx). No se emitió POST. */
  | { readonly kind: 'unavailable'; readonly status: number }
  /** Un logout (o pérdida de sesión) invalidó la operación; no se aplicó nada. */
  | { readonly kind: 'cancelled' };

const CANCELLED: SessionOutcome = { kind: 'cancelled' };

/**
 * Coordinador de sesión y refresh (ADR-004, D-07; política C).
 *
 * Reglas implementadas:
 * - Un único flujo en vuelo por pestaña; las demandas concurrentes comparten la promesa.
 * - Sección crítica entre pestañas con Web Locks que abarca `GET /session`, la
 *   toma del CSRF vigente, `POST /refresh` y la aplicación del resultado.
 * - Como máximo UN `POST /refresh` por demanda; nunca se encadena otro tras un fallo.
 * - Sin Web Locks no se rota: se pide reautenticación.
 * - Tras un fallo del refresh solo se reconcilia con `GET /session`.
 * - `BroadcastChannel` solo transporta señales; nada de credenciales.
 * - Un logout invalida restauraciones tardías (epoch del store). El epoch se
 *   captura al CREAR la demanda (no al adquirir el lock) y se revalida al entrar
 *   al lock, antes de cualquier HTTP y tras cada operación asíncrona. La espera
 *   del lock se cancela con `AbortSignal` al invalidar la sesión.
 */
@Injectable({ providedIn: 'root' })
export class SessionCoordinator {
  private readonly api = inject(AuthApiPort);
  private readonly store = inject(AuthSessionStore);
  private readonly lock = inject(SessionLock);
  private readonly channel = inject(SessionSignalChannel);
  private readonly config = inject(SESSION_COORDINATOR_CONFIG);

  private inFlight: Promise<SessionOutcome> | null = null;
  private inFlightEpoch: number | null = null;
  private readonly controllers = new Set<AbortController>();

  constructor() {
    const unsubscribe = this.channel.subscribe((signal) => {
      // 'session-rotated' es informativa: cada pestaña conserva su propio JWT y
      // obtiene el CSRF vigente dentro del lock cuando lo necesita.
      if (signal.type === 'logout') {
        this.store.close();
        this.abortPending();
      }
    });

    inject(DestroyRef).onDestroy(unsubscribe);
  }

  /**
   * Garantiza un access JWT vigente, o informa por qué no es posible. Cada
   * llamada sin JWT vigente constituye una demanda y consume como máximo un POST.
   */
  ensureAccessToken(demandEpoch?: number): Promise<SessionOutcome> {
    // La generación se fija AQUÍ, al nacer la demanda, y no al obtener el lock. Quien
    // ya capturó la suya (la fachada, antes de cualquier espera) la pasa: esa es la
    // identidad de la demanda y, si la sesión ya cambió, la demanda nace cancelada.
    const epoch = demandEpoch ?? this.store.epoch;

    if (epoch !== this.store.epoch || this.store.reauthenticationReason() === 'session-changed') {
      return Promise.resolve(CANCELLED);
    }

    if (this.inFlight && this.inFlightEpoch === epoch) return this.inFlight;

    const run = this.acquire(epoch).finally(() => {
      if (this.inFlight === run) {
        this.inFlight = null;
        this.inFlightEpoch = null;
      }
    });
    this.inFlight = run;
    this.inFlightEpoch = epoch;

    return run;
  }

  /** Logout `current`: invalida primero lo local y luego avisa (mejor esfuerzo). */
  async logout(): Promise<void> {
    const csrfToken = this.store.csrfToken();
    const sessionId = this.store.session()?.sessionId;

    // Todo lo local es síncrono: JWT/CSRF caen y las esperas de lock se cancelan ya.
    this.store.close();
    this.abortPending();
    this.channel.post({ type: 'logout' });

    try {
      await this.call((signal) => this.api.logout(csrfToken, signal, sessionId));
    } catch {
      // La sesión local ya está cerrada; un fallo remoto no la reabre ni se reintenta.
    }
  }

  private async acquire(epoch: number): Promise<SessionOutcome> {
    const now = Date.now();

    if (this.store.epoch !== epoch || this.store.status() === 'closed') return CANCELLED;

    if (this.store.accessToken(now) && !this.store.isSessionExpired(now)) {
      return { kind: 'authenticated' };
    }

    // La espera del lock es cancelable: un logout la aborta y la tarea nunca corre.
    const waiting = new AbortController();
    this.controllers.add(waiting);

    let locked;
    try {
      locked = await this.lock.run(
        SESSION_LOCK_NAME,
        () => this.criticalSection(epoch),
        waiting.signal,
      );
    } finally {
      this.controllers.delete(waiting);
    }

    if (locked.kind === 'aborted') return CANCELLED;

    if (locked.kind === 'unavailable') {
      // Sin exclusión mutua confiable no se rota: BroadcastChannel no la sustituye.
      if (this.store.epoch !== epoch || this.store.status() === 'closed') return CANCELLED;

      return this.reauthenticationRequired('mutual-exclusion-unavailable');
    }

    // Revalidación INMEDIATA tras reanudar: entre que la sección crítica terminó y
    // esta continuación corre pudo haber un logout (y hasta un login nuevo). Un
    // resultado de la generación anterior no se entrega: quien lo recibiría leería la
    // credencial de la sesión que esté activa ahora, o navegaría a /login durante ella.
    if (!this.isCurrent(locked.value, epoch)) return CANCELLED;

    return locked.value;
  }

  /**
   * Pasa la sesión a 'reauthentication-required' y devuelve el resultado con la
   * generación resultante, para poder distinguirlo de una sesión posterior.
   */
  private reauthenticationRequired(reason: ReauthenticationReason): SessionOutcome {
    this.store.requireReauthentication(reason);

    return { kind: 'reauthentication-required', reason, epoch: this.store.epoch };
  }

  /**
   * ¿Sigue vigente este resultado? Los éxitos pertenecen a la generación de la
   * demanda (`demandEpoch`); 'reauthentication-required' a la generación que su
   * propia transición creó, y además el estado debe seguir siendo ese.
   */
  private isCurrent(outcome: SessionOutcome, demandEpoch: number): boolean {
    if (outcome.kind === 'reauthentication-required') {
      return (
        outcome.epoch === this.store.epoch && this.store.status() === 'reauthentication-required'
      );
    }

    return this.store.epoch === demandEpoch;
  }

  private async criticalSection(epoch: number): Promise<SessionOutcome> {
    // Revalidación al adquirir el lock y ANTES de cualquier HTTP: si hubo logout
    // (aunque luego haya un login nuevo) esta demanda pertenece a otra sesión.
    if (this.store.epoch !== epoch || this.store.status() === 'closed') return CANCELLED;

    // 1. Bootstrap. El CSRF se toma AQUÍ, dentro del lock, nunca antes de adquirirlo.
    let bootstrap: SessionResponse;
    try {
      bootstrap = await this.call((signal) => this.api.getSession(signal));
    } catch (error) {
      if (this.store.epoch !== epoch) return CANCELLED;

      if (error instanceof AuthApiError && error.status === 401) {
        return this.reauthenticationRequired('session-invalid');
      }

      return { kind: 'unavailable', status: error instanceof AuthApiError ? error.status : 0 };
    }

    if (this.store.epoch !== epoch) return CANCELLED;
    if (this.sessionChanged(bootstrap)) return this.reauthenticationRequired('session-changed');
    if (!this.store.applySessionResponse(bootstrap, epoch)) return CANCELLED;

    // 2. Como máximo un POST de refresh para esta demanda.
    let rotated: AuthResponse;
    try {
      rotated = await this.call((signal) => this.api.refresh(bootstrap.csrfToken, signal));
    } catch {
      // 401 REFRESH_INVALID, timeout, respuesta perdida o cualquier otro error.
      return this.reconcileAfterFailedRefresh(epoch);
    }

    // 3. Aplicar el resultado antes de salir de la sección crítica.
    if (this.store.epoch !== epoch) return CANCELLED;
    if (this.sessionChanged(rotated)) return this.reauthenticationRequired('session-changed');
    if (!this.store.applyAuthResponse(rotated, epoch)) return CANCELLED;

    this.channel.post({ type: 'session-rotated' });
    return { kind: 'authenticated' };
  }

  /** Solo `GET /session`: reconcilia el estado y jamás emite otro POST. */
  private async reconcileAfterFailedRefresh(epoch: number): Promise<SessionOutcome> {
    if (this.store.epoch !== epoch) return CANCELLED;

    try {
      const snapshot = await this.call((signal) => this.api.getSession(signal));

      if (this.store.epoch !== epoch) return CANCELLED;
      if (this.sessionChanged(snapshot)) return this.reauthenticationRequired('session-changed');
      if (!this.store.applySessionResponse(snapshot, epoch)) return CANCELLED;

      return { kind: 'session-valid-without-token' };
    } catch {
      if (this.store.epoch !== epoch) return CANCELLED;

      return this.reauthenticationRequired('refresh-unrecoverable');
    }
  }

  /** Una cookie compartida puede apuntar a otra cuenta o a otro login de la misma cuenta. */
  private sessionChanged(response: SessionResponse): boolean {
    const session = this.store.session();
    return session !== null && (
      session.sessionId !== response.session.sessionId ||
      this.store.user()?.userId !== response.user.userId
    );
  }

  private async call<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    this.controllers.add(controller);

    try {
      return await Promise.race([
        operation(controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new AuthApiError(0, TIMEOUT_ERROR_CODE));
          }, this.config.requestTimeoutMs);

          // Un abort (logout) libera la sección crítica y el lock sin esperar a un
          // puerto que no respete el signal; el resultado tardío se descarta.
          controller.signal.addEventListener(
            'abort',
            () => reject(new AuthApiError(0, ABORTED_ERROR_CODE)),
            { once: true },
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      this.controllers.delete(controller);
    }
  }

  /**
   * Invalida el trabajo pendiente: cancela esperas de lock y peticiones HTTP, y
   * suelta la demanda compartida para que una demanda posterior (nueva sesión)
   * no se adhiera a una operación de la sesión anterior.
   */
  private abortPending(): void {
    this.inFlight = null;
    this.inFlightEpoch = null;

    for (const controller of [...this.controllers]) {
      controller.abort();
    }
  }
}
