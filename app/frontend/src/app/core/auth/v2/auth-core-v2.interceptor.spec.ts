import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { apiKeyInterceptor } from '../../api/api-key.interceptor';
import { FEATURE_FLAGS } from '../../feature-flags';
import { AuthApiPort } from './auth-api.port';
import { AuthApiError, AuthRequiredError } from './auth-contract';
import { AUTH_V2_BUSINESS_TRANSPORT } from './business-transport';
import { AuthSessionService } from './auth-session.service';
import { AuthSessionStore } from './auth-session.store';
import { ResultHoldingLock, SignalHub } from './auth-v2.testing';
import { MockAuthApiAdapter, MockAuthBackend } from './mock-auth-api.adapter';
import { SessionLock } from './session-lock';
import { SessionSignalChannel } from './session-signal-channel';

const API = 'https://api.example.test/v1';
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

describe('authCoreV2Interceptor (D-11) vía apiKeyInterceptor con authCoreV2=true', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let backend: MockAuthBackend;
  let session: AuthSessionService;
  let lock: ResultHoldingLock;
  let hub: SignalHub;
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  const originalApiBaseUrl = environment.apiBaseUrl;

  beforeEach(async () => {
    environment.apiBaseUrl = API;
    router.navigate.mockClear();
    backend = new MockAuthBackend();
    hub = new SignalHub();
    lock = new ResultHoldingLock();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiKeyInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: FEATURE_FLAGS, useValue: { authCoreV2: true } },
        // Habilitado SOLO para ejercitar el interceptor contra HttpTestingController;
        // por defecto (y con el mock real) el transporte de negocio está bloqueado.
        { provide: AUTH_V2_BUSINESS_TRANSPORT, useValue: 'enabled' },
        { provide: AuthApiPort, useValue: new MockAuthApiAdapter(backend) },
        { provide: SessionLock, useValue: lock },
        { provide: SessionSignalChannel, useValue: hub.channelFor({}) },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    session = TestBed.inject(AuthSessionService);
  });

  afterEach(() => {
    try {
      httpTesting.verify();
    } finally {
      environment.apiBaseUrl = originalApiBaseUrl;
    }
  });

  async function signIn(): Promise<void> {
    const attempt = await session.startGoogleAttempt();
    await session.signInWithGoogle('google-id-token-placeholder', attempt);
  }

  /** Hace que el mock emita el `userId` indicado (permite dos identidades internas distintas). */
  function useIdentities(initial: string): { set: (userId: string) => void } {
    const port = TestBed.inject(AuthApiPort) as MockAuthApiAdapter;
    let identity = initial;
    const withIdentity = <T extends { user: { userId: string } }>(response: T): T => ({
      ...response,
      user: { ...response.user, userId: identity },
    });
    const exchange = port.exchangeGoogle.bind(port);
    const getSession = port.getSession.bind(port);
    const refresh = port.refresh.bind(port);
    port.exchangeGoogle = async (request) => withIdentity(await exchange(request));
    port.getSession = async (signal) => withIdentity(await getSession(signal));
    port.refresh = async (csrf, signal) => withIdentity(await refresh(csrf, signal));

    return { set: (userId) => (identity = userId) };
  }

  function send(method: Method, url: string): { errors: unknown[]; done: () => boolean } {
    const errors: unknown[] = [];
    let finished = false;

    http
      .request(method, url, method === 'GET' || method === 'DELETE' ? {} : { body: { x: 1 } })
      .subscribe({
        error: (error: unknown) => {
          errors.push(error);
          finished = true;
        },
        complete: () => (finished = true),
      });

    return { errors, done: () => finished };
  }

  describe('401 de negocio: cero reejecuciones automáticas', () => {
    for (const method of METHODS) {
      it(`${method}: una sola petición, el error se propaga y no hay replay`, async () => {
        await signIn();
        const result = send(method, `${API}/publicaciones/PUB-1`);
        await settle();

        const request = httpTesting.expectOne(`${API}/publicaciones/PUB-1`);
        expect(request.request.method).toBe(method);
        expect(request.request.headers.get('Authorization')).toMatch(/^Bearer mock-access-/);
        request.flush(
          {
            error: {
              code: 'AUTH_REQUIRED',
              message: 'x',
              details: [],
              correlationId: 'c',
              timestamp: 1,
            },
          },
          { status: 401, statusText: 'Unauthorized' },
        );
        await settle();

        expect(result.errors).toHaveLength(1);
        expect((result.errors[0] as HttpErrorResponse).status).toBe(401);
        // Ninguna petición de negocio adicional: ni GET ni mutaciones se reejecutan.
        expect(httpTesting.match(() => true)).toHaveLength(0);
      });
    }

    it('la recuperación de sesión usa como máximo un POST de refresh, sin reenviar la petición', async () => {
      await signIn();
      const refreshesBefore = backend.stats.refreshPosts;
      const result = send('PUT', `${API}/usuarios/usr_mock_0001`);
      await settle();

      httpTesting
        .expectOne(`${API}/usuarios/usr_mock_0001`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      await settle();

      expect(backend.stats.refreshPosts - refreshesBefore).toBeLessThanOrEqual(1);
      expect(httpTesting.match(() => true)).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it('varios 401 con el mismo JWT provocan una única recuperación', async () => {
      await signIn();
      const refreshesBefore = backend.stats.refreshPosts;
      send('GET', `${API}/publicaciones`);
      send('GET', `${API}/chats`);
      await settle();

      for (const request of httpTesting.match(() => true)) {
        request.flush(null, { status: 401, statusText: 'Unauthorized' });
      }
      await settle();

      expect(backend.stats.refreshPosts - refreshesBefore).toBe(1);
    });

    it('un 401 de un JWT ya reemplazado no inicia otra recuperación', async () => {
      await signIn();
      send('GET', `${API}/publicaciones`);
      await settle();
      const request = httpTesting.expectOne(`${API}/publicaciones`);
      const staleToken = request.request.headers.get('Authorization')!.replace('Bearer ', '');

      // Otro flujo reemplaza el JWT (nueva demanda) antes de que llegue el 401 del anterior.
      TestBed.inject(AuthSessionStore).dropAccessToken(staleToken);
      expect(await session.getAccessToken()).not.toBe(staleToken);
      const refreshesBefore = backend.stats.refreshPosts;

      request.flush(null, { status: 401, statusText: 'Unauthorized' });
      await settle();

      expect(backend.stats.refreshPosts).toBe(refreshesBefore);
    });

    it('si la recuperación exige autenticar de nuevo, navega a /login (sin reenviar)', async () => {
      await signIn();
      send('DELETE', `${API}/publicaciones/PUB-1`);
      await settle();
      backend.expireCookie();

      httpTesting
        .expectOne(`${API}/publicaciones/PUB-1`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      await settle();

      expect(router.navigate).toHaveBeenCalledWith(['/login']);
      expect(httpTesting.match(() => true)).toHaveLength(0);
    });
  });

  describe('403 es una denegación, no un candidato a reintento', () => {
    for (const method of METHODS) {
      it(`${method}: se propaga tal cual, sin refresh ni reenvío`, async () => {
        await signIn();
        const before = { ...backend.stats };
        const result = send(method, `${API}/publicaciones/PUB-1`);
        await settle();

        httpTesting.expectOne(`${API}/publicaciones/PUB-1`).flush(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'x',
              details: [],
              correlationId: 'c',
              timestamp: 1,
            },
          },
          { status: 403, statusText: 'Forbidden' },
        );
        await settle();

        expect((result.errors[0] as HttpErrorResponse).status).toBe(403);
        expect(backend.stats).toEqual(before);
        expect(httpTesting.match(() => true)).toHaveLength(0);
        expect(router.navigate).not.toHaveBeenCalled();
      });
    }

    it('tras un 403 el JWT sigue vigente', async () => {
      await signIn();
      send('GET', `${API}/publicaciones/PUB-1`);
      await settle();
      httpTesting
        .expectOne(`${API}/publicaciones/PUB-1`)
        .flush(null, { status: 403, statusText: 'Forbidden' });
      await settle();

      expect(await session.getAccessToken()).toMatch(/^mock-access-/);
    });
  });

  describe('credenciales de las peticiones', () => {
    it('no envía nunca Ocp-Apim-Subscription-Key', async () => {
      await signIn();
      send('GET', `${API}/publicaciones`);
      await settle();

      const request = httpTesting.expectOne(`${API}/publicaciones`);
      expect(request.request.headers.has('Ocp-Apim-Subscription-Key')).toBe(false);
      request.flush([]);
    });

    it('el bearer es el JWT interno, no el ID Token de Google', async () => {
      await signIn();
      send('GET', `${API}/publicaciones`);
      await settle();

      const request = httpTesting.expectOne(`${API}/publicaciones`);
      const authorization = request.request.headers.get('Authorization') ?? '';
      expect(authorization).toMatch(/^Bearer mock-access-/);
      expect(authorization).not.toContain('google-id-token-placeholder');
      request.flush([]);
    });

    it('no adjunta bearer a rutas de cookie ni a metadatos', async () => {
      await signIn();
      for (const path of [
        '/auth/session',
        '/auth/refresh',
        '/auth/logout',
        '/.well-known/jwks.json',
      ]) {
        send('GET', `${API}${path}`);
      }
      await settle();

      for (const request of httpTesting.match(() => true)) {
        expect(request.request.headers.has('Authorization')).toBe(false);
        request.flush({});
      }
    });

    it('no adjunta credenciales a otros orígenes', async () => {
      await signIn();
      send('GET', 'https://other.example.test/v1/publicaciones');
      await settle();

      const request = httpTesting.expectOne('https://other.example.test/v1/publicaciones');
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush([]);
    });
  });

  describe('sin sesión utilizable', () => {
    it('no envía la petición y falla con AuthRequiredError', async () => {
      const result = send('GET', `${API}/publicaciones`);
      await settle();

      expect(httpTesting.match(() => true)).toHaveLength(0);
      expect(result.errors[0]).toBeInstanceOf(AuthRequiredError);
      expect((result.errors[0] as AuthRequiredError).reason).toBe('reauthentication-required');
    });

    it('tras un logout no restaura ni envía', async () => {
      await signIn();
      await session.logout();
      const result = send('POST', `${API}/publicaciones`);
      await settle();

      expect(httpTesting.match(() => true)).toHaveLength(0);
      expect((result.errors[0] as AuthRequiredError).reason).toBe('cancelled');
    });
  });

  describe('P1-01: demanda pendiente de lock que sobrevive a logout + nuevo login', () => {
    it('lock retenido → petición pendiente → logout → login nuevo → liberar: no hay GET ni POST ni petición HTTP', async () => {
      backend.startSession(); // cookie de la sesión anterior
      let release!: () => void;
      const holder = lock.run(
        'markettec.auth.session',
        () => new Promise<void>((resolve) => (release = resolve)),
      );
      await tick();

      // La petición necesita un JWT, queda esperando el lock retenido por otra operación.
      const result = send('GET', `${API}/publicaciones`);
      await settle();
      expect(backend.stats.sessionGets).toBe(0);

      await session.logout();
      await signIn();
      const tokenAfterLogin = TestBed.inject(AuthSessionStore).accessToken(Date.now());
      const before = { ...backend.stats };
      expect(tokenAfterLogin).toMatch(/^mock-access-/);

      release();
      await holder;
      await settle();

      // La demanda de la sesión anterior no actúa sobre la nueva.
      expect(backend.stats).toEqual(before);
      expect(httpTesting.match(() => true)).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      // Con una sesión nueva ya activa el motivo no es 'cancelled', pero nada se envió.
      expect(result.errors[0]).toBeInstanceOf(AuthRequiredError);
      expect((result.errors[0] as AuthRequiredError).reason).toBe('token-unavailable');
      expect(lock.abortedWaits).toBe(1);
      // La sesión nueva queda intacta: mismo JWT, sin restauraciones.
      const store = TestBed.inject(AuthSessionStore);
      expect(store.status()).toBe('active');
      expect(store.accessToken(Date.now())).toBe(tokenAfterLogin);
    });
  });

  describe('P1-01 (auditoría Codex): éxito del lock que sobrevive a logout + login nuevo', () => {
    /**
     * Secuencia exacta reproducida por Codex:
     * refresh de la sesión antigua completado → resolución de lock.run() retenida →
     * logout → sesión nueva → liberar → la petición antigua NO puede salir con el JWT nuevo.
     */
    async function runStaleDemandSequence(): Promise<{
      result: ReturnType<typeof send>;
      newToken: string | null;
      refreshPostsBeforeRelease: number;
    }> {
      backend.startSession(); // cookie de la sesión A; sin JWT en memoria
      const release = lock.holdNextResult();

      const result = send('POST', `${API}/publicaciones`);
      await settle();

      // El refresh de la sesión antigua ya terminó y la resolución del lock está retenida.
      expect(lock.heldResults).toBe(1);
      expect(backend.stats.refreshPosts).toBe(1);
      expect(httpTesting.match(() => true)).toHaveLength(0);

      await session.logout();
      await signIn(); // sesión B
      const newToken = TestBed.inject(AuthSessionStore).accessToken(Date.now());
      const refreshPostsBeforeRelease = backend.stats.refreshPosts;

      release();
      await settle();

      return { result, newToken, refreshPostsBeforeRelease };
    }

    it('cero POST de negocio de la demanda antigua, cero uso del JWT nuevo, sesión nueva intacta', async () => {
      const { result, newToken, refreshPostsBeforeRelease } = await runStaleDemandSequence();
      expect(newToken).toMatch(/^mock-access-/);

      const dispatched = httpTesting.match(() => true);
      expect(dispatched.map((r) => `${r.request.method} ${r.request.url}`)).toEqual([]);
      expect(dispatched.filter((r) => r.request.headers.has('Authorization'))).toHaveLength(0);

      // Error controlado de la operación obsoleta.
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBeInstanceOf(AuthRequiredError);

      // Sin segundo POST de refresh (ni de la demanda antigua ni por limpieza).
      expect(backend.stats.refreshPosts).toBe(1);
      expect(backend.stats.refreshPosts).toBe(refreshPostsBeforeRelease);

      // La sesión B no se limpió, invalidó ni modificó por el trabajo antiguo de A.
      const store = TestBed.inject(AuthSessionStore);
      expect(store.status()).toBe('active');
      expect(store.accessToken(Date.now())).toBe(newToken);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('la sesión nueva sigue sirviendo sus propias peticiones con su propio JWT', async () => {
      const { newToken } = await runStaleDemandSequence();

      const fresh = send('GET', `${API}/publicaciones`);
      await settle();

      const request = httpTesting.expectOne(`${API}/publicaciones`);
      expect(request.request.headers.get('Authorization')).toBe(`Bearer ${newToken}`);
      request.flush([]);
      await settle();
      expect(fresh.errors).toHaveLength(0);
    });

    it('dos identidades internas distintas: el trabajo de A no obtiene el token de B', async () => {
      const identity = useIdentities('usr_mock_A');

      backend.startSession();
      const release = lock.holdNextResult();
      const result = send('POST', `${API}/publicaciones`); // demanda creada en la identidad A
      await settle();

      const store = TestBed.inject(AuthSessionStore);
      expect(lock.heldResults).toBe(1);
      expect(store.user()?.userId).toBe('usr_mock_A');
      const tokenOfA = store.accessToken(Date.now());
      expect(tokenOfA).not.toBeNull();

      await session.logout();
      identity.set('usr_mock_B');
      await signIn();
      const tokenOfB = store.accessToken(Date.now());
      expect(store.user()?.userId).toBe('usr_mock_B');
      expect(tokenOfB).not.toBeNull();
      expect(tokenOfB).not.toBe(tokenOfA);

      release();
      await settle();

      // Nada del trabajo de A salió, y menos con el token de B.
      expect(httpTesting.match(() => true)).toHaveLength(0);
      expect(result.errors[0]).toBeInstanceOf(AuthRequiredError);
      expect(store.user()?.userId).toBe('usr_mock_B');
      expect(store.accessToken(Date.now())).toBe(tokenOfB);

      // B solo usa el token de B.
      send('POST', `${API}/publicaciones`);
      await settle();
      const own = httpTesting.expectOne(`${API}/publicaciones`);
      expect(own.request.headers.get('Authorization')).toBe(`Bearer ${tokenOfB}`);
      expect(own.request.headers.get('Authorization')).not.toContain(tokenOfA!);
      own.flush({});
    });
  });

  describe('P1 (QA): recuperación 401 de una sesión antigua no navega durante otra sesión', () => {
    const unauthorized = { status: 401, statusText: 'Unauthorized' };

    /** A ejecuta un PUT de negocio; el 401 inicia la recuperación y su resultado queda retenido. */
    async function staleRecoveryHeld(): Promise<{ release: () => void; tokenOfA: string }> {
      const identity = useIdentities('usr_mock_A');
      await signIn();
      const store = TestBed.inject(AuthSessionStore);
      const tokenOfA = store.accessToken(Date.now())!;
      expect(store.user()?.userId).toBe('usr_mock_A');
      identity.set('usr_mock_B'); // lo que emita el servidor desde ahora es de B

      send('PUT', `${API}/usuarios/usr_mock_A`);
      await settle();
      backend.expireCookie(); // la recuperación terminará en 'reauthentication-required'
      const release = lock.holdNextResult();

      httpTesting.expectOne(`${API}/usuarios/usr_mock_A`).flush(null, unauthorized);
      await settle();

      expect(lock.heldResults).toBe(1); // resultado de la recuperación retenido
      expect(router.navigate).not.toHaveBeenCalled();
      expect(TestBed.inject(AuthSessionStore).status()).toBe('reauthentication-required');

      return { release, tokenOfA };
    }

    it('A → 401 → resultado retenido → logout → login B → liberar: cero navegaciones, B intacta', async () => {
      const { release, tokenOfA } = await staleRecoveryHeld();
      const store = TestBed.inject(AuthSessionStore);
      const refreshesBefore = backend.stats.refreshPosts;

      await session.logout();
      await signIn(); // sesión B (otra identidad y otro JWT)
      const tokenOfB = store.accessToken(Date.now());
      const epochOfB = store.epoch;
      expect(store.user()?.userId).toBe('usr_mock_B');
      expect(tokenOfB).not.toBe(tokenOfA);
      const afterLogin = { ...backend.stats };

      release();
      await settle();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(store.status()).toBe('active');
      expect(store.user()?.userId).toBe('usr_mock_B');
      expect(store.accessToken(Date.now())).toBe(tokenOfB);
      expect(store.epoch).toBe(epochOfB);
      expect(httpTesting.match(() => true)).toHaveLength(0); // cero replay
      expect(backend.stats.refreshPosts).toBe(refreshesBefore); // cero refresh adicional
      expect(backend.stats).toEqual(afterLogin); // el trabajo antiguo no tocó el servidor
    });

    it('sin login posterior: el resultado tardío tras el logout tampoco navega', async () => {
      const { release } = await staleRecoveryHeld();

      await session.logout();
      release();
      await settle();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(TestBed.inject(AuthSessionStore).status()).toBe('closed');
    });

    it('logout originado en OTRA pestaña (BroadcastChannel) y login posterior: no navega', async () => {
      const { release } = await staleRecoveryHeld();
      const store = TestBed.inject(AuthSessionStore);

      hub.channelFor({}).post({ type: 'logout' }); // otra pestaña cierra la sesión
      expect(store.status()).toBe('closed');
      await signIn();
      const tokenOfB = store.accessToken(Date.now());

      release();
      await settle();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(store.status()).toBe('active');
      expect(store.accessToken(Date.now())).toBe(tokenOfB);
    });

    it('resultado tardío de CANCELACIÓN (espera del lock abortada por el logout): no navega a B', async () => {
      await signIn();
      send('PUT', `${API}/usuarios/usr_mock_0001`);
      await settle();

      // Otra operación retiene el lock: la recuperación del 401 queda esperándolo.
      let releaseHolder!: () => void;
      const holder = lock.run(
        'markettec.auth.session',
        () => new Promise<void>((resolve) => (releaseHolder = resolve)),
      );
      await tick();
      httpTesting.expectOne(`${API}/usuarios/usr_mock_0001`).flush(null, unauthorized);
      await settle();

      await session.logout();
      await signIn(); // sesión B
      const store = TestBed.inject(AuthSessionStore);
      const tokenOfB = store.accessToken(Date.now());

      releaseHolder();
      await holder;
      await settle();

      expect(lock.abortedWaits).toBe(1);
      expect(router.navigate).not.toHaveBeenCalled();
      expect(store.accessToken(Date.now())).toBe(tokenOfB);
    });

    it('resultado tardío de ERROR del refresh (refresh-unrecoverable) sobrevive a logout + login B: no navega', async () => {
      await signIn();
      const port = TestBed.inject(AuthApiPort) as MockAuthApiAdapter;
      const getSession = port.getSession.bind(port);
      let calls = 0;
      // bootstrap correcto, refresh inválido y reconciliación fallida ⇒ 'refresh-unrecoverable'
      port.getSession = (signal) =>
        ++calls >= 2 ? Promise.reject(new AuthApiError(503, 'AUTH_TEMPORARILY_UNAVAILABLE')) : getSession(signal);
      backend.scriptRefresh('refresh-invalid');

      send('PUT', `${API}/usuarios/usr_mock_0001`);
      await settle();
      const release = lock.holdNextResult();
      httpTesting.expectOne(`${API}/usuarios/usr_mock_0001`).flush(null, unauthorized);
      await settle();
      expect(lock.heldResults).toBe(1);
      expect(TestBed.inject(AuthSessionStore).reauthenticationReason()).toBe('refresh-unrecoverable');

      port.getSession = getSession; // restablece el servidor para el login de B
      await session.logout();
      await signIn();
      const store = TestBed.inject(AuthSessionStore);
      const tokenOfB = store.accessToken(Date.now());

      release();
      await settle();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(store.status()).toBe('active');
      expect(store.accessToken(Date.now())).toBe(tokenOfB);
    });

    it('reautenticación LEGÍTIMA sin cambio de sesión: sigue navegando a /login (aun con el resultado retenido)', async () => {
      const { release } = await staleRecoveryHeld();

      release();
      await settle();

      expect(router.navigate).toHaveBeenCalledTimes(1);
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
      expect(TestBed.inject(AuthSessionStore).status()).toBe('reauthentication-required');
      expect(httpTesting.match(() => true)).toHaveLength(0);
    });
  });

  describe('P1-01: logout entre la lectura del bearer y el despacho HTTP', () => {
    it('no despacha la petición con el bearer obsoleto', async () => {
      await signIn();
      const original = session.acquireAccessCredential.bind(session);
      vi.spyOn(session, 'acquireAccessCredential').mockImplementation(async () => {
        const credential = await original();
        // El logout ocurre tras leer el bearer y ANTES de la continuación que despacha.
        queueMicrotask(() => void session.logout());
        return credential;
      });

      const result = send('GET', `${API}/publicaciones`);
      await settle();

      expect(httpTesting.match(() => true)).toHaveLength(0);
      expect(result.errors[0]).toBeInstanceOf(AuthRequiredError);
      expect((result.errors[0] as AuthRequiredError).reason).toBe('cancelled');
    });

    it('revalidate rechaza una credencial leída antes de un logout aunque ya exista un login nuevo', async () => {
      await signIn();
      const stale = await session.acquireAccessCredential();
      expect(stale).not.toBeNull();
      expect(session.revalidate(stale!)).toBe(stale!.token);

      await session.logout();
      expect(session.revalidate(stale!)).toBeNull();

      await signIn();
      expect(await session.getAccessToken()).toMatch(/^mock-access-/);
      // Hay un JWT vigente de la sesión nueva, pero la credencial vieja es de otra generación.
      expect(session.revalidate(stale!)).toBeNull();
    });
  });
});
