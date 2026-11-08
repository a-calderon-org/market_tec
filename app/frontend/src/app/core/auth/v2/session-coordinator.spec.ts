import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthApiError, AuthResponse, SessionResponse } from './auth-contract';
import {
  createTab,
  InMemoryLock,
  NonExclusiveLock,
  ResultHoldingLock,
  SignalHub,
  Tab,
  UnavailableLock,
} from './auth-v2.testing';
import { MOCK_USER, MockAuthBackend } from './mock-auth-api.adapter';
import { SESSION_COORDINATOR_CONFIG, SessionCoordinator } from './session-coordinator';
import { SessionLock } from './session-lock';

/*
 * Estas pruebas SIMULAN pestañas con instancias independientes sobre un backend
 * mock y un lock en proceso. Demuestran la lógica del coordinador (orden de
 * llamadas, un POST por demanda, CSRF tomado dentro de la sección crítica,
 * reconciliación, logout). NO equivalen a una carrera real de navegador: las
 * pestañas reales con `navigator.locks` y `BroadcastChannel` requieren
 * Playwright u otra prueba multi-tab en navegador.
 */

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('SessionCoordinator (D-07, política C) — pestañas simuladas', () => {
  let parent: EnvironmentInjector;
  let backend: MockAuthBackend;
  let hub: SignalHub;
  let log: string[];

  function tab(
    name: string,
    lock: SessionLock,
    extra = [] as Parameters<typeof createTab>[2],
  ): Tab {
    return createTab(parent, { backend, lock, hub, log, name }, extra);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    parent = TestBed.inject(EnvironmentInjector);
    backend = new MockAuthBackend();
    hub = new SignalHub();
    log = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('inicio y sesión', () => {
    it('inicio sin sesión: GET /session responde 401, pide reautenticar y no emite POST', async () => {
      const a = tab('A', new InMemoryLock());

      const outcome = await a.coordinator.ensureAccessToken();

      expect(outcome).toEqual({
        kind: 'reauthentication-required',
        reason: 'session-invalid',
        epoch: a.store.epoch,
      });
      expect(a.store.status()).toBe('reauthentication-required');
      expect(backend.stats).toMatchObject({ sessionGets: 1, refreshPosts: 0 });
    });

    it('sesión válida tras recargar: un GET y un único POST; el JWT queda solo en memoria', async () => {
      backend.startSession();
      const a = tab('A', new InMemoryLock());

      const outcome = await a.coordinator.ensureAccessToken();

      expect(outcome).toEqual({ kind: 'authenticated' });
      expect(a.store.accessToken(Date.now())).toMatch(/^mock-access-/);
      expect(a.store.user()?.userId).toBe(MOCK_USER.userId);
      expect(a.calls).toEqual(['get', 'refresh']);
      expect(backend.stats).toMatchObject({ sessionGets: 1, refreshPosts: 1 });
    });

    it('con JWT y sesión vigentes no hace red', async () => {
      backend.startSession();
      const a = tab('A', new InMemoryLock());
      await a.coordinator.ensureAccessToken();

      await a.coordinator.ensureAccessToken();

      expect(backend.stats).toMatchObject({ sessionGets: 1, refreshPosts: 1 });
    });

    it('JWT vencido con cookie vigente: nueva demanda, un GET y un POST más', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
      backend.startSession();
      const a = tab('A', new InMemoryLock());
      await a.coordinator.ensureAccessToken();

      vi.setSystemTime(new Date('2026-11-08T12:05:00Z')); // > 240 s de ventana del JWT
      const outcome = await a.coordinator.ensureAccessToken();

      expect(outcome).toEqual({ kind: 'authenticated' });
      expect(backend.stats).toMatchObject({ sessionGets: 2, refreshPosts: 2 });
    });

    it('sesión expirada (cookie ya inválida): 401 en GET, reautenticar sin POST y credenciales limpias', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
      backend.startSession();
      const a = tab('A', new InMemoryLock());
      await a.coordinator.ensureAccessToken();
      backend.expireCookie();

      vi.setSystemTime(new Date('2026-11-08T14:00:00Z')); // > ventana de sesión de 3600 s
      const outcome = await a.coordinator.ensureAccessToken();

      expect(outcome).toEqual({
        kind: 'reauthentication-required',
        reason: 'session-invalid',
        epoch: a.store.epoch,
      });
      expect(a.store.accessToken(Date.now())).toBeNull();
      expect(a.store.csrfToken()).toBeNull();
      expect(a.store.user()).toBeNull();
      expect(backend.stats.refreshPosts).toBe(1); // solo el de la primera demanda
    });

    it('demandas concurrentes de la misma pestaña comparten un único flujo y un POST', async () => {
      backend.startSession();
      const a = tab('A', new InMemoryLock());

      const outcomes = await Promise.all([
        a.coordinator.ensureAccessToken(),
        a.coordinator.ensureAccessToken(),
        a.coordinator.ensureAccessToken(),
      ]);

      expect(outcomes.every((o) => o.kind === 'authenticated')).toBe(true);
      expect(backend.stats).toMatchObject({ sessionGets: 1, refreshPosts: 1 });
    });
  });

  describe('dos pestañas compiten por refresh', () => {
    it('con exclusión mutua: cada pestaña hace GET→POST completo en bloque, sin entrelazarse', async () => {
      backend.startSession();
      const lock = new InMemoryLock();
      const a = tab('A', lock);
      const b = tab('B', lock);

      const [outcomeA, outcomeB] = await Promise.all([
        a.coordinator.ensureAccessToken(),
        b.coordinator.ensureAccessToken(),
      ]);

      expect(outcomeA).toEqual({ kind: 'authenticated' });
      expect(outcomeB).toEqual({ kind: 'authenticated' });
      expect(lock.maxConcurrent).toBe(1);
      // Cada sección crítica es contigua: GET y POST de una pestaña antes de que entre la otra.
      expect(log).toEqual(['A:get', 'A:refresh', 'B:get', 'B:refresh']);
      expect(backend.stats).toMatchObject({ sessionGets: 2, refreshPosts: 2 });
      // Cada pestaña conserva su propio JWT; no se comparten credenciales.
      expect(a.store.accessToken(Date.now())).not.toBe(b.store.accessToken(Date.now()));
    });

    it('el CSRF de la pestaña que espera se obtiene dentro del lock (generación vigente)', async () => {
      backend.startSession();
      const lock = new InMemoryLock();
      const a = tab('A', lock);
      const b = tab('B', lock);

      await Promise.all([a.coordinator.ensureAccessToken(), b.coordinator.ensureAccessToken()]);

      // B no recibió REFRESH_INVALID: su CSRF era el de la generación creada por A.
      expect(b.store.status()).toBe('active');
      expect(b.store.accessToken(Date.now())).not.toBeNull();
    });

    it('control negativo: sin exclusión real, B usa el CSRF anterior y el servidor lo rechaza (sin gracia)', async () => {
      backend.startSession();
      const lock = new NonExclusiveLock();
      const a = tab('A', lock);
      const b = tab('B', lock);

      const [outcomeA, outcomeB] = await Promise.all([
        a.coordinator.ensureAccessToken(),
        b.coordinator.ensureAccessToken(),
      ]);

      expect(log.slice(0, 2)).toEqual(['A:get', 'B:get']); // ambos toman el mismo CSRF
      expect(outcomeA).toEqual({ kind: 'authenticated' });
      expect(outcomeB).toEqual({ kind: 'session-valid-without-token' });
      expect(backend.stats.refreshPosts).toBe(2); // y B NO encadenó un tercero
    });
  });

  describe('fallos del refresh: un POST por demanda, solo reconciliación', () => {
    it('401 REFRESH_INVALID: un único POST, GET /session reconcilia y no se encadena otro POST', async () => {
      backend.startSession();
      backend.scriptRefresh('refresh-invalid');
      const a = tab('A', new InMemoryLock());

      const outcome = await a.coordinator.ensureAccessToken();

      expect(outcome).toEqual({ kind: 'session-valid-without-token' });
      expect(a.calls).toEqual(['get', 'refresh', 'get']);
      expect(backend.stats.refreshPosts).toBe(1);
      expect(a.store.accessToken(Date.now())).toBeNull();
      expect(a.store.status()).toBe('active'); // no se descarta el estado
    });

    it('el siguiente refresh ocurre solo ante una NUEVA demanda y converge', async () => {
      backend.startSession();
      backend.scriptRefresh('refresh-invalid');
      const a = tab('A', new InMemoryLock());
      await a.coordinator.ensureAccessToken();

      const second = await a.coordinator.ensureAccessToken();

      expect(second).toEqual({ kind: 'authenticated' });
      expect(backend.stats.refreshPosts).toBe(2);
    });

    it('respuesta perdida: el servidor consumió la generación; solo GET /session y sin gracia', async () => {
      backend.startSession();
      backend.scriptRefresh('lost-response');
      const a = tab('A', new InMemoryLock());

      const outcome = await a.coordinator.ensureAccessToken();

      expect(outcome).toEqual({ kind: 'session-valid-without-token' });
      expect(a.calls).toEqual(['get', 'refresh', 'get']);
      expect(backend.stats.refreshPosts).toBe(1);

      // Una demanda nueva toma el CSRF de la generación vigente dentro del lock y converge.
      const next = await a.coordinator.ensureAccessToken();
      expect(next).toEqual({ kind: 'authenticated' });
      expect(backend.stats.refreshPosts).toBe(2);
    });

    it('timeout del POST: aborta, reconcilia con GET y no encadena otro POST', async () => {
      vi.useFakeTimers();
      backend.startSession();
      backend.scriptRefresh('hang');
      const a = tab('A', new InMemoryLock(), [
        { provide: SESSION_COORDINATOR_CONFIG, useValue: { requestTimeoutMs: 1000 } },
      ]);

      const pending = a.coordinator.ensureAccessToken();
      await vi.advanceTimersByTimeAsync(1000);
      const outcome = await pending;

      expect(outcome).toEqual({ kind: 'session-valid-without-token' });
      expect(a.calls).toEqual(['get', 'refresh', 'get']);
      expect(backend.stats.refreshPosts).toBe(1);
    });

    it('si el GET de reconciliación también falla: reautenticar y todavía un solo POST', async () => {
      backend.startSession();
      backend.scriptRefresh('refresh-invalid');
      const a = tab('A', new InMemoryLock());
      const realGet = a.adapter.getSession.bind(a.adapter);
      let gets = 0;
      a.adapter.getSession = (signal) =>
        ++gets === 2 ? Promise.reject(new AuthApiError(401, 'AUTH_REQUIRED')) : realGet(signal);

      const outcome = await a.coordinator.ensureAccessToken();

      expect(outcome).toEqual({
        kind: 'reauthentication-required',
        reason: 'refresh-unrecoverable',
        epoch: a.store.epoch,
      });
      expect(a.store.status()).toBe('reauthentication-required');
      expect(a.store.csrfToken()).toBeNull();
      expect(backend.stats.refreshPosts).toBe(1);
    });

    it('GET /session no disponible (5xx): no hay POST ni se descarta nada', async () => {
      backend.startSession();
      backend.failNextSessionGet(new AuthApiError(503, 'AUTH_TEMPORARILY_UNAVAILABLE'));
      const a = tab('A', new InMemoryLock());

      const outcome = await a.coordinator.ensureAccessToken();

      expect(outcome).toEqual({ kind: 'unavailable', status: 503 });
      expect(backend.stats.refreshPosts).toBe(0);
    });
  });

  describe('Web Locks no disponible', () => {
    it('no rota: ni GET ni POST; pide reautenticación segura', async () => {
      backend.startSession();
      const a = tab('A', new UnavailableLock());

      const outcome = await a.coordinator.ensureAccessToken();

      expect(outcome).toEqual({
        kind: 'reauthentication-required',
        reason: 'mutual-exclusion-unavailable',
        epoch: a.store.epoch,
      });
      expect(a.store.status()).toBe('reauthentication-required');
      expect(backend.stats).toMatchObject({ sessionGets: 0, refreshPosts: 0 });
    });

    it('BroadcastChannel no sustituye al mutex aunque existan otras pestañas', async () => {
      backend.startSession();
      const a = tab('A', new UnavailableLock());
      tab('B', new UnavailableLock());

      await a.coordinator.ensureAccessToken();

      expect(backend.stats.refreshPosts).toBe(0);
      expect(hub.messages).toEqual([]);
    });
  });

  describe('señales entre pestañas', () => {
    it('solo viajan señales con {type}; ningún JWT, CSRF ni dato de sesión', async () => {
      backend.startSession();
      const lock = new InMemoryLock();
      const a = tab('A', lock);
      const b = tab('B', lock);
      await Promise.all([a.coordinator.ensureAccessToken(), b.coordinator.ensureAccessToken()]);
      await a.coordinator.logout();

      expect(hub.messages.length).toBeGreaterThan(0);
      for (const message of hub.messages) {
        expect(Object.keys(message as object)).toEqual(['type']);
      }

      const wire = JSON.stringify(hub.messages);
      for (const secret of [
        a.store.csrfToken() ?? 'x',
        'mock-access',
        'mock-csrf',
        MOCK_USER.userId,
        MOCK_USER.email,
      ]) {
        expect(wire).not.toContain(secret);
      }
    });

    it('un logout en otra pestaña cierra esta sesión y cancela restauraciones', async () => {
      backend.startSession();
      const lock = new InMemoryLock();
      const a = tab('A', lock);
      const b = tab('B', lock);
      await b.coordinator.ensureAccessToken();

      await a.coordinator.logout();

      expect(b.store.status()).toBe('closed');
      expect(b.store.accessToken(Date.now())).toBeNull();
      expect(b.store.user()).toBeNull();
      expect(await b.coordinator.ensureAccessToken()).toEqual({ kind: 'cancelled' });
    });

    it('una señal de rotación no copia credenciales a otra pestaña', async () => {
      backend.startSession();
      const lock = new InMemoryLock();
      const a = tab('A', lock);
      const b = tab('B', lock);

      await a.coordinator.ensureAccessToken();

      expect(b.store.accessToken(Date.now())).toBeNull();
      expect(b.store.csrfToken()).toBeNull();
    });
  });

  describe('logout invalida restauraciones tardías', () => {
    const fixture: { auth: AuthResponse; session: SessionResponse } = (() => {
      const other = new MockAuthBackend();
      const auth = other.startSession();
      return { auth, session: other.getSession() };
    })();

    it('un GET /session que responde después del logout no repone credenciales', async () => {
      backend.startSession();
      const a = tab('A', new InMemoryLock());
      let resolveGet!: (r: SessionResponse) => void;
      a.adapter.getSession = () =>
        new Promise<SessionResponse>((resolve) => (resolveGet = resolve));

      const pending = a.coordinator.ensureAccessToken();
      await tick();
      await a.coordinator.logout();
      resolveGet(fixture.session);

      expect(await pending).toEqual({ kind: 'cancelled' });
      expect(a.store.status()).toBe('closed');
      expect(a.store.user()).toBeNull();
      expect(a.store.csrfToken()).toBeNull();
      expect(a.store.accessToken(Date.now())).toBeNull();
      expect(backend.stats.refreshPosts).toBe(0);
    });

    it('un POST /refresh que responde después del logout no aplica el JWT', async () => {
      backend.startSession();
      const a = tab('A', new InMemoryLock());
      let resolveRefresh!: (r: AuthResponse) => void;
      a.adapter.refresh = () => new Promise<AuthResponse>((resolve) => (resolveRefresh = resolve));

      const pending = a.coordinator.ensureAccessToken();
      await tick();
      await a.coordinator.logout();
      resolveRefresh(fixture.auth);

      expect(await pending).toEqual({ kind: 'cancelled' });
      expect(a.store.accessToken(Date.now())).toBeNull();
      expect(a.store.user()).toBeNull();
      expect(a.store.status()).toBe('closed');
    });

    it('tras el logout no se restaura nada hasta un login nuevo', async () => {
      backend.startSession();
      const a = tab('A', new InMemoryLock());
      await a.coordinator.ensureAccessToken();

      await a.coordinator.logout();
      const gets = backend.stats.sessionGets;

      expect(await a.coordinator.ensureAccessToken()).toEqual({ kind: 'cancelled' });
      expect(backend.stats.sessionGets).toBe(gets);
      expect(backend.hasSession).toBe(false);
    });

    it('logout con el servidor caído igualmente deja la sesión local cerrada', async () => {
      backend.startSession();
      const a = tab('A', new InMemoryLock());
      await a.coordinator.ensureAccessToken();
      a.adapter.logout = () => Promise.reject(new AuthApiError(0, 'NETWORK'));

      await expect(a.coordinator.logout()).resolves.toBeUndefined();

      expect(a.store.status()).toBe('closed');
      expect(a.store.accessToken(Date.now())).toBeNull();
    });
  });

  describe('P1-01: lock retenido → demanda pendiente → logout → login nuevo → liberación', () => {
    const LOCK = 'markettec.auth.session';

    /** Lock que NO respeta `signal`: la defensa de epoch debe bastar sin la cancelación. */
    class SignalIgnoringLock extends InMemoryLock {
      override run<T>(name: string, task: () => Promise<T>) {
        return super.run(name, task);
      }
    }

    async function holdLock(
      lock: SessionLock,
    ): Promise<{ release: () => void; done: Promise<unknown> }> {
      let release!: () => void;
      const done = lock.run(LOCK, () => new Promise<void>((resolve) => (release = resolve)));
      await tick();

      return { release, done };
    }

    async function relogin(a: Tab): Promise<void> {
      const attempt = await a.session.startGoogleAttempt();
      await a.session.signInWithGoogle('google-id-token-placeholder', attempt);
    }

    for (const [label, makeLock] of [
      ['con cancelación por AbortSignal', () => new InMemoryLock()],
      ['aunque el lock ignore el AbortSignal (solo epoch)', () => new SignalIgnoringLock()],
    ] as const) {
      it(`la demanda antigua no ejecuta GET ni POST sobre la sesión nueva ${label}`, async () => {
        backend.startSession();
        const lock = makeLock();
        const a = tab('A', lock);
        const holder = await holdLock(lock);

        const stale = a.coordinator.ensureAccessToken();
        await tick();
        expect(a.calls).toEqual([]);

        await a.session.logout();
        await relogin(a);
        const tokenAfterLogin = a.store.accessToken(Date.now());
        const csrfAfterLogin = a.store.csrfToken();
        const callsAfterLogin = [...a.calls];
        const stats = { ...backend.stats };

        holder.release();
        await holder.done;

        expect(await stale).toEqual({ kind: 'cancelled' });
        expect(a.calls).toEqual(callsAfterLogin); // solo 'logout': ni 'get' ni 'refresh'
        expect(backend.stats).toEqual(stats);
        expect(a.store.status()).toBe('active');
        expect(a.store.accessToken(Date.now())).toBe(tokenAfterLogin);
        expect(a.store.csrfToken()).toBe(csrfAfterLogin);
      });
    }

    it('la espera cancelada libera su lugar: otras operaciones adquieren el lock en orden', async () => {
      backend.startSession();
      const lock = new InMemoryLock();
      const a = tab('A', lock);
      const holder = await holdLock(lock);
      const stale = a.coordinator.ensureAccessToken();
      await tick();
      await a.session.logout();

      const order: string[] = [];
      const next = lock.run(LOCK, async () => void order.push('next'));
      holder.release();
      await holder.done;

      expect(await next).toEqual({ kind: 'acquired', value: undefined });
      expect(order).toEqual(['next']);
      expect(await stale).toEqual({ kind: 'cancelled' });
      expect(lock.abortedWaits).toBe(1);
    });

    it('una demanda nueva de la sesión nueva no se adhiere a la antigua y hace un único GET y POST', async () => {
      backend.startSession();
      const lock = new InMemoryLock();
      const a = tab('A', lock);
      const holder = await holdLock(lock);
      const stale = a.coordinator.ensureAccessToken();
      await tick();

      await a.session.logout();
      await relogin(a);
      a.store.dropAccessToken(a.store.accessToken(Date.now())!);
      const fresh = a.coordinator.ensureAccessToken();
      expect(fresh).not.toBe(stale);

      holder.release();
      await holder.done;

      expect(await stale).toEqual({ kind: 'cancelled' });
      expect(await fresh).toEqual({ kind: 'authenticated' });
      expect(a.calls.filter((call) => call === 'get')).toHaveLength(1);
      expect(a.calls.filter((call) => call === 'refresh')).toHaveLength(1);
      expect(a.store.status()).toBe('active');
    });

    it('un logout recibido de otra pestaña cancela la espera y no restaura nada', async () => {
      backend.startSession();
      const lock = new InMemoryLock();
      const a = tab('A', lock);
      const b = tab('B', new InMemoryLock());
      const holder = await holdLock(lock);
      const stale = a.coordinator.ensureAccessToken();
      await tick();

      await b.session.logout();
      holder.release();
      await holder.done;

      expect(await stale).toEqual({ kind: 'cancelled' });
      expect(a.calls).toEqual([]);
      expect(a.store.status()).toBe('closed');
      expect(a.store.accessToken(Date.now())).toBeNull();
      expect(lock.abortedWaits).toBe(1);
    });

    it('un logout con la sección crítica en vuelo libera el lock aunque el puerto ignore el abort', async () => {
      backend.startSession();
      const lock = new InMemoryLock();
      const a = tab('A', lock);
      a.adapter.getSession = () => new Promise<SessionResponse>(() => undefined); // nunca responde

      const pending = a.coordinator.ensureAccessToken();
      await tick();
      await a.session.logout();

      expect(await pending).toEqual({ kind: 'cancelled' });
      expect(await lock.run(LOCK, async () => 'free')).toEqual({ kind: 'acquired', value: 'free' });
    });

    it('la cancelación no entra en bucle ni invalida una sesión posterior', async () => {
      backend.startSession();
      const lock = new InMemoryLock();
      const a = tab('A', lock);
      const holder = await holdLock(lock);
      const stale = a.coordinator.ensureAccessToken();
      await tick();
      await a.session.logout();
      holder.release();
      await holder.done;
      await stale;

      await relogin(a);
      const epoch = a.store.epoch;

      expect(await a.coordinator.ensureAccessToken()).toEqual({ kind: 'authenticated' });
      expect(a.store.epoch).toBe(epoch);
      expect(a.store.status()).toBe('active');
      expect(backend.stats.refreshPosts).toBe(0);
    });
  });

  describe('P1-01 (auditoría Codex): éxito tardío del lock tras logout + login nuevo', () => {
    async function relogin(a: Tab): Promise<void> {
      const attempt = await a.session.startGoogleAttempt();
      await a.session.signInWithGoogle('google-id-token-placeholder', attempt);
    }

    it('el refresh de la sesión antigua terminó, pero el éxito no se entrega a la sesión nueva', async () => {
      backend.startSession();
      const lock = new ResultHoldingLock();
      const a = tab('A', lock);
      const release = lock.holdNextResult();

      const stale = a.coordinator.ensureAccessToken();
      await tick();
      expect(a.calls).toEqual(['get', 'refresh']); // la sección crítica ya aplicó su resultado
      expect(lock.heldResults).toBe(1);

      await a.session.logout();
      await relogin(a);
      const tokenOfNewSession = a.store.accessToken(Date.now());
      const sessionAfterRelogin = { epoch: a.store.epoch, calls: [...a.calls] };

      release();

      expect(await stale).toEqual({ kind: 'cancelled' });
      // La sesión nueva queda intacta y no hubo otro HTTP de la demanda antigua.
      expect(a.store.epoch).toBe(sessionAfterRelogin.epoch);
      expect(a.store.status()).toBe('active');
      expect(a.store.accessToken(Date.now())).toBe(tokenOfNewSession);
      expect(a.calls).toEqual(sessionAfterRelogin.calls);
      expect(backend.stats.refreshPosts).toBe(1);
    });

    it('P1 (QA): un "reauthentication-required" retenido no sobrevive a logout + login nuevo', async () => {
      // Sin cookie: GET /session responde 401 y la propia transición incrementa el epoch.
      const lock = new ResultHoldingLock();
      const a = tab('A', lock);
      const release = lock.holdNextResult();
      const epochBefore = a.store.epoch;

      const stale = a.coordinator.ensureAccessToken();
      await tick();
      expect(a.store.status()).toBe('reauthentication-required');
      expect(a.store.epoch).toBe(epochBefore + 1); // el epoch resultante NO es el de la demanda

      await a.session.logout();
      await relogin(a);
      const tokenOfNewSession = a.store.accessToken(Date.now());
      const calls = [...a.calls];

      release();

      expect(await stale).toEqual({ kind: 'cancelled' });
      expect(a.store.status()).toBe('active');
      expect(a.store.accessToken(Date.now())).toBe(tokenOfNewSession);
      expect(a.calls).toEqual(calls);
    });

    it('P1 (QA): la reautenticación vigente conserva su resultado aunque el epoch haya subido', async () => {
      const lock = new ResultHoldingLock();
      const a = tab('A', lock);
      const release = lock.holdNextResult();

      const pending = a.coordinator.ensureAccessToken();
      await tick();
      release();

      expect(await pending).toEqual({
        kind: 'reauthentication-required',
        reason: 'session-invalid',
        epoch: a.store.epoch,
      });
    });

    it('una demanda con epoch ya obsoleto nace cancelada: no consulta lock ni red', async () => {
      backend.startSession();
      const lock = new InMemoryLock();
      const a = tab('A', lock);
      const staleEpoch = a.store.epoch;

      await a.session.logout();
      await relogin(a);
      const callsBefore = [...a.calls];

      expect(await a.coordinator.ensureAccessToken(staleEpoch)).toEqual({ kind: 'cancelled' });
      expect(a.calls).toEqual(callsBefore);
      expect(a.store.status()).toBe('active');
    });
  });

  it('SessionCoordinator es inyectable con la configuración por defecto', () => {
    backend.startSession();
    const a = tab('A', new InMemoryLock());

    expect(a.injector.get(SessionCoordinator)).toBe(a.coordinator);
  });
});
