import { createEnvironmentInjector, EnvironmentInjector, Provider } from '@angular/core';
import { AuthApiPort } from './auth-api.port';
import { AuthSessionService } from './auth-session.service';
import { AuthSessionStore } from './auth-session.store';
import { MockAuthApiAdapter, MockAuthBackend } from './mock-auth-api.adapter';
import { LockResult, SessionLock } from './session-lock';
import { SessionCoordinator } from './session-coordinator';
import { SessionSignal, SessionSignalChannel } from './session-signal-channel';

/*
 * Ayudas SOLO para pruebas del núcleo v2 (no se importan desde código de aplicación).
 * Todo aquí SIMULA el navegador en proceso: no equivale a una carrera real entre pestañas.
 */

/**
 * Exclusión mutua en proceso (cola de promesas) compartida entre "pestañas" simuladas.
 * Respeta `signal` como Web Locks: abortar una espera pendiente no ejecuta la tarea y
 * no rompe el orden de los demás solicitantes.
 */
export class InMemoryLock extends SessionLock {
  private tail: Promise<void> = Promise.resolve();
  private active = 0;
  maxConcurrent = 0;
  /** Esperas canceladas por `signal` antes de entrar (la tarea nunca corrió). */
  abortedWaits = 0;

  async run<T>(
    _name: string,
    task: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<LockResult<T>> {
    if (signal?.aborted) {
      this.abortedWaits++;
      return { kind: 'aborted' };
    }

    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => (release = resolve));

    const cancelled = new Promise<'aborted'>((resolve) =>
      signal?.addEventListener('abort', () => resolve('aborted'), { once: true }),
    );

    if ((await Promise.race([previous.then(() => 'granted' as const), cancelled])) === 'aborted') {
      this.abortedWaits++;
      // El hueco en la cola se libera solo cuando le toque, para no adelantar a otros.
      void previous.then(release);
      return { kind: 'aborted' };
    }

    this.active++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.active);

    try {
      return { kind: 'acquired', value: await task() };
    } finally {
      this.active--;
      release();
    }
  }
}

/**
 * Retiene la RESOLUCIÓN de `run()` DESPUÉS de que la tarea terminó y soltó el lock.
 * Modela la brecha entre "la sección crítica aplicó su resultado" y "quien esperó el
 * lock reanuda": un logout + login nuevo puede ocurrir justo ahí (P1-01 de la auditoría).
 */
export class ResultHoldingLock extends InMemoryLock {
  private gate: Promise<void> | null = null;
  /** Resoluciones que quedaron retenidas (la tarea ya había terminado). */
  heldResults = 0;

  /** Retiene la resolución del PRÓXIMO `run()`. Devuelve la función que la libera. */
  holdNextResult(): () => void {
    let release!: () => void;
    this.gate = new Promise<void>((resolve) => (release = resolve));

    return release;
  }

  override async run<T>(
    name: string,
    task: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<LockResult<T>> {
    const gate = this.gate;
    this.gate = null;

    const result = await super.run(name, task, signal);

    if (gate) {
      this.heldResults++;
      await gate;
    }

    return result;
  }
}

/** Control negativo: dice "adquirido" pero NO serializa; permite ver qué pasaría sin mutex. */
export class NonExclusiveLock extends SessionLock {
  async run<T>(_name: string, task: () => Promise<T>): Promise<LockResult<T>> {
    return { kind: 'acquired', value: await task() };
  }
}

/** Equivale a un navegador sin Web Locks. */
export class UnavailableLock extends SessionLock {
  async run<T>(): Promise<LockResult<T>> {
    return { kind: 'unavailable' };
  }
}

/** Bus de señales en proceso: registra todo lo que "viaja" entre pestañas. */
export class SignalHub {
  readonly messages: unknown[] = [];
  private readonly listeners = new Set<{ owner: object; listener: (s: SessionSignal) => void }>();

  channelFor(owner: object): SessionSignalChannel {
    const hub = this;

    return new (class extends SessionSignalChannel {
      post(signal: SessionSignal): void {
        hub.messages.push(JSON.parse(JSON.stringify(signal)));
        for (const entry of hub.listeners) {
          if (entry.owner !== owner) entry.listener(signal);
        }
      }

      subscribe(listener: (s: SessionSignal) => void): () => void {
        const entry = { owner, listener };
        hub.listeners.add(entry);

        return () => hub.listeners.delete(entry);
      }
    })();
  }
}

export interface Tab {
  readonly injector: EnvironmentInjector;
  readonly adapter: MockAuthApiAdapter;
  readonly store: AuthSessionStore;
  readonly coordinator: SessionCoordinator;
  readonly session: AuthSessionService;
  /** Orden de llamadas de ESTA pestaña al servidor mock: 'get' | 'refresh' | 'logout'. */
  readonly calls: string[];
}

/** Crea una "pestaña": store, coordinador y adaptador propios sobre el backend/lock/hub compartidos. */
export function createTab(
  parent: EnvironmentInjector,
  shared: {
    backend: MockAuthBackend;
    lock: SessionLock;
    hub: SignalHub;
    log?: string[];
    name: string;
  },
  extraProviders: Provider[] = [],
): Tab {
  const adapter = new MockAuthApiAdapter(shared.backend);
  const calls: string[] = [];
  const record = (op: string) => {
    calls.push(op);
    shared.log?.push(`${shared.name}:${op}`);
  };

  const getSession = adapter.getSession.bind(adapter);
  const refresh = adapter.refresh.bind(adapter);
  const logout = adapter.logout.bind(adapter);
  adapter.getSession = (signal) => (record('get'), getSession(signal));
  adapter.refresh = (csrf, signal) => (record('refresh'), refresh(csrf, signal));
  adapter.logout = (csrf, signal) => (record('logout'), logout(csrf, signal));

  const owner = {};
  const injector = createEnvironmentInjector(
    [
      { provide: AuthApiPort, useValue: adapter },
      { provide: SessionLock, useValue: shared.lock },
      { provide: AuthSessionStore, useClass: AuthSessionStore },
      { provide: SessionSignalChannel, useValue: shared.hub.channelFor(owner) },
      { provide: SessionCoordinator, useClass: SessionCoordinator },
      { provide: AuthSessionService, useClass: AuthSessionService },
      ...extraProviders,
    ],
    parent,
  );

  return {
    injector,
    adapter,
    store: injector.get(AuthSessionStore),
    coordinator: injector.get(SessionCoordinator),
    session: injector.get(AuthSessionService),
    calls,
  };
}
