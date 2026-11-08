import { Injectable } from '@angular/core';

export type LockResult<T> =
  | { readonly kind: 'acquired'; readonly value: T }
  /** No hay exclusión mutua confiable: el llamador NO debe rotar credenciales. */
  | { readonly kind: 'unavailable' }
  /** La espera del lock se canceló (`signal`) antes de entrar: la tarea NO se ejecutó. */
  | { readonly kind: 'aborted' };

/**
 * Exclusión mutua entre pestañas (D-07). La única implementación aprobada es
 * Web Locks. `BroadcastChannel` no es sustituto y no se ofrece como alternativa.
 *
 * `signal` cancela únicamente la ESPERA del lock (semántica de Web Locks): si la
 * tarea ya entró, el abort no la interrumpe y debe cancelarse por su propia vía.
 */
export abstract class SessionLock {
  abstract run<T>(
    name: string,
    task: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<LockResult<T>>;
}

export const SESSION_LOCK_NAME = 'markettec.auth.session';

@Injectable()
export class WebLocksSessionLock extends SessionLock {
  run<T>(name: string, task: () => Promise<T>, signal?: AbortSignal): Promise<LockResult<T>> {
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;

    if (!locks || typeof locks.request !== 'function') {
      return Promise.resolve({ kind: 'unavailable' });
    }

    // Web Locks rechaza con AbortError si el signal ya está abortado; se evita la llamada.
    if (signal?.aborted) {
      return Promise.resolve({ kind: 'aborted' });
    }

    let entered = false;

    return locks
      .request(name, signal ? { mode: 'exclusive', signal } : { mode: 'exclusive' }, async () => {
        entered = true;
        return task();
      })
      .then(
        (value): LockResult<T> => ({ kind: 'acquired', value: value as T }),
        (error: unknown): LockResult<T> => {
          // Si el callback ya corrió, el error es de la tarea y se propaga.
          if (entered) throw error;

          // Cancelada la espera por el signal: la solicitud nunca obtuvo el lock.
          if (signal?.aborted) return { kind: 'aborted' };

          // Sin entrar al lock (p. ej. SecurityError en un origen opaco) no hay exclusión.
          return { kind: 'unavailable' };
        },
      );
  }
}
