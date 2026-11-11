import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { GoogleAuthService } from '../../../features/auth/services/google-auth.service';
import { Profile } from '../../../features/profile/profile';
import { UserService } from '../../../features/profile/services/user.service';
import { ApiClientService } from '../../api/api-client.service';
import { apiKeyInterceptor } from '../../api/api-key.interceptor';
import { FEATURE_FLAGS } from '../../feature-flags';
import { AuthApiPort } from './auth-api.port';
import { AuthSessionService } from './auth-session.service';
import { InMemoryLock, SignalHub } from './auth-v2.testing';
import { AUTH_V2_BUSINESS_TRANSPORT, BusinessTransportBlockedError } from './business-transport';
import { MockAuthApiAdapter, MockAuthBackend } from './mock-auth-api.adapter';
import { provideAuthCoreV2 } from './provide-auth-core-v2';
import { SessionLock } from './session-lock';
import { SessionSignalChannel } from './session-signal-channel';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

/** Base que representa un backend REAL: cualquier petición hacia aquí sería una fuga. */
const REAL_BACKEND = 'https://backend.real.example.test/v1';

function configure(flag: boolean, extra: object[] = []): void {
  const backend = new MockAuthBackend();

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([apiKeyInterceptor])),
      provideHttpClientTesting(),
      { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
      { provide: FEATURE_FLAGS, useValue: { authCoreV2: flag } },
      { provide: AuthApiPort, useValue: new MockAuthApiAdapter(backend) },
      { provide: SessionLock, useValue: new InMemoryLock() },
      { provide: SessionSignalChannel, useValue: new SignalHub().channelFor({}) },
      ...extra,
    ],
  });
}

async function mockSignIn(): Promise<void> {
  const session = TestBed.inject(AuthSessionService);
  const attempt = await session.startGoogleAttempt();
  await session.signInWithGoogle('google-id-token-placeholder', attempt);
}

describe('P1-03: sesión simulada authCoreV2 ⇒ cero HTTP de negocio', () => {
  const originalApiBaseUrl = environment.apiBaseUrl;
  let httpTesting: HttpTestingController;

  afterEach(() => {
    try {
      httpTesting.verify();
    } finally {
      environment.apiBaseUrl = originalApiBaseUrl;
    }
  });

  describe('con authCoreV2=true y el mock provisional (transporte bloqueado por defecto)', () => {
    beforeEach(async () => {
      environment.apiBaseUrl = REAL_BACKEND;
      configure(true);
      httpTesting = TestBed.inject(HttpTestingController);
      await mockSignIn();
    });

    it('el usuario simulado puede iniciar sesión (sin tocar el transporte configurado)', () => {
      expect(TestBed.inject(AuthSessionService).user()?.userId).toBe('usr_mock_0001');
      expect(httpTesting.match(() => true)).toHaveLength(0);
    });

    it('UserService.getUser falla cerrado y no emite ninguna petición', async () => {
      const id = TestBed.inject(GoogleAuthService).user()!.id;

      await expect(firstValueFrom(TestBed.inject(UserService).getUser(id))).rejects.toBeInstanceOf(
        BusinessTransportBlockedError,
      );
      expect(httpTesting.match(() => true)).toHaveLength(0);
    });

    it('UserService.updateUser falla cerrado y no envía el cuerpo a ningún destino', async () => {
      await expect(
        firstValueFrom(
          TestBed.inject(UserService).updateUser('usr_mock_0001', {
            nombre: 'N',
            apellidos: 'A',
            nombreUsuario: 'nu',
          }),
        ),
      ).rejects.toBeInstanceOf(BusinessTransportBlockedError);
      expect(httpTesting.match(() => true)).toHaveLength(0);
    });

    it('la pantalla de Perfil muestra el error y no emite ninguna petición', async () => {
      const fixture = TestBed.createComponent(Profile);
      fixture.detectChanges();
      await settle();

      expect(fixture.componentInstance.currentUserId).toBe('usr_mock_0001');
      expect(fixture.componentInstance.error()).toBe(true);
      expect(fixture.componentInstance.user()).toBeNull();

      fixture.componentInstance.profileForm.setValue({
        nombre: 'Nombre',
        apellidos: 'Apellidos',
      });
      fixture.componentInstance.saveProfile();
      await settle();

      expect(fixture.componentInstance.saveError()).toBe(true);
      expect(httpTesting.match(() => true)).toHaveLength(0);
    });

    it('ApiClientService (get/post/put/delete) no llega al transporte HTTP', async () => {
      const client = TestBed.inject(ApiClientService);

      for (const call of [
        () => client.get('/publicaciones'),
        () => client.post('/publicaciones', { x: 1 }),
        () => client.put('/usuarios/usr_mock_0001', { x: 1 }),
        () => client.delete('/publicaciones/PUB-1'),
      ]) {
        await expect(firstValueFrom(call())).rejects.toBeInstanceOf(BusinessTransportBlockedError);
      }

      expect(httpTesting.match(() => true)).toHaveLength(0);
    });

    it('ruta alternativa: HttpClient directo hacia la API configurada tampoco sale (ni con ni sin bearer)', async () => {
      const http = TestBed.inject(HttpClient);

      for (const url of [
        `${REAL_BACKEND}/usuarios/usr_mock_0001`,
        `${REAL_BACKEND}/publicaciones`,
        `${REAL_BACKEND}/auth/session`,
        `${REAL_BACKEND}/auth/refresh`,
      ]) {
        await expect(firstValueFrom(http.get(url))).rejects.toBeInstanceOf(
          BusinessTransportBlockedError,
        );
      }

      expect(httpTesting.match(() => true)).toHaveLength(0);
    });

    it('un origen ajeno a la API no se bloquea y jamás recibe credenciales simuladas', async () => {
      TestBed.inject(HttpClient).get('https://cdn.example.test/logo.png').subscribe();
      await settle();

      const request = httpTesting.expectOne('https://cdn.example.test/logo.png');
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush('');
    });
  });

  it('con la API base vacía (entorno de desarrollo) el servicio de negocio sigue sin emitir peticiones', async () => {
    environment.apiBaseUrl = '';
    configure(true);
    httpTesting = TestBed.inject(HttpTestingController);
    await mockSignIn();

    await expect(
      firstValueFrom(TestBed.inject(UserService).getUser('usr_mock_0001')),
    ).rejects.toBeInstanceOf(BusinessTransportBlockedError);
    expect(httpTesting.match(() => true)).toHaveLength(0);
  });

  it('provideAuthCoreV2 declara el transporte de negocio bloqueado mientras solo exista el mock', () => {
    configure(true);
    httpTesting = TestBed.inject(HttpTestingController);
    const injector = createEnvironmentInjector(
      provideAuthCoreV2(),
      TestBed.inject(EnvironmentInjector),
    );

    expect(injector.get(AUTH_V2_BUSINESS_TRANSPORT)).toBe('blocked');
    expect(TestBed.inject(AUTH_V2_BUSINESS_TRANSPORT)).toBe('blocked'); // fail-closed por defecto
  });

  /**
   * P1-02 (auditoría Codex): con la API base vacía (u otra base) `apiVersionlessPath`
   * devolvía null y el interceptor ejecutaba `next(req)` ANTES de consultar el bloqueo.
   * `HttpClient` directo enviaba `PUT /usuarios/usr_mock_0001` con el ID y el cuerpo.
   */
  describe('P1-02: HttpClient directo no elude el bloqueo del mock (API base vacía, /v1, /api)', () => {
    const SAME_ORIGIN = new URL('/', document.baseURI).origin;

    const BUSINESS_PATHS = [
      '/usuarios/usr_mock_0001',
      '/usuarios/usr_mock_0001/publicaciones',
      '/me/profile',
      '/me/auth-methods',
      '/me/anything-else',
      '/publicaciones',
      '/publicaciones/PUB-1',
      '/chats',
      '/chats/CH-1/mensajes',
      '/notificaciones',
    ];

    async function signedInHttp(base: string): Promise<HttpClient> {
      environment.apiBaseUrl = base;
      configure(true);
      httpTesting = TestBed.inject(HttpTestingController);
      await mockSignIn();

      return TestBed.inject(HttpClient);
    }

    /**
     * Cada variante de método debe fallar con BusinessTransportBlockedError y NO llegar
     * al transporte. Se inspecciona lo despachado (sin esperar respuesta) para que una
     * fuga falle rápido y sin dejar peticiones abiertas que contaminen otras pruebas.
     */
    async function expectBlocked(http: HttpClient, url: string): Promise<void> {
      const body = { dato: 'sensible' };

      for (const [verb, call] of [
        ['GET', () => http.get(url)],
        ['POST', () => http.post(url, body)],
        ['PUT', () => http.put(url, body)],
        ['PATCH', () => http.patch(url, body)],
        ['DELETE', () => http.delete(url)],
      ] as const) {
        const errors: unknown[] = [];
        call().subscribe({ error: (error: unknown) => errors.push(error) });
        await tick();

        const leaked = httpTesting.match(() => true);
        expect(leaked.map((r) => `${r.request.method} ${r.request.url}`)).toEqual([]);
        expect(errors, `${verb} ${url}`).toHaveLength(1);
        expect(errors[0], `${verb} ${url}`).toBeInstanceOf(BusinessTransportBlockedError);
      }
    }

    it('reproducción exacta: PUT /usuarios/usr_mock_0001 con API base vacía no sale', async () => {
      const http = await signedInHttp('');
      const errors: unknown[] = [];

      http
        .put('/usuarios/usr_mock_0001', { nombre: 'N' })
        .subscribe({ error: (error: unknown) => errors.push(error) });
      await tick();

      const leaked = httpTesting.match(() => true);
      expect(leaked.map((r) => `${r.request.method} ${r.request.url}`)).toEqual([]);
      expect(errors[0]).toBeInstanceOf(BusinessTransportBlockedError);
    });

    for (const base of ['', '/', '/v1', '/api']) {
      describe(`API base ${JSON.stringify(base)}`, () => {
        // Prefijo con el que el desarrollador llegaría a la API en esta configuración.
        const prefixes = base === '' || base === '/' ? ['', '/v1', '/api'] : [base, ''];

        it('GET/POST/PUT/PATCH/DELETE de negocio relativos no salen (con y sin prefijo)', async () => {
          const http = await signedInHttp(base);

          for (const prefix of prefixes) {
            for (const path of BUSINESS_PATHS) {
              await expectBlocked(http, `${prefix}${path}`);
            }
          }

          expect(httpTesting.match(() => true)).toHaveLength(0);
        });

        it('URLs absolutas del mismo origen no salen', async () => {
          const http = await signedInHttp(base);

          for (const prefix of prefixes) {
            for (const path of BUSINESS_PATHS) {
              await expectBlocked(http, `${SAME_ORIGIN}${prefix}${path}`);
            }
          }

          expect(httpTesting.match(() => true)).toHaveLength(0);
        });

        it('no se elude con segmentos de punto, barras repetidas, mayúsculas ni query', async () => {
          const http = await signedInHttp(base);

          for (const url of [
            '/x/../usuarios/usr_mock_0001',
            '/%2e%2e/usuarios/usr_mock_0001',
            '/usuarios/./usr_mock_0001',
            '/USUARIOS/usr_mock_0001',
            '/usuarios/usr_mock_0001?x=1#frag',
            '/api//usuarios/usr_mock_0001',
            '/v1/api/usuarios/usr_mock_0001',
          ]) {
            await expectBlocked(http, url);
          }

          expect(httpTesting.match(() => true)).toHaveLength(0);
        });

        it('estáticos explícitos (GET/HEAD), auth/metadatos y otros orígenes no se bloquean ni reciben credenciales', async () => {
          const http = await signedInHttp(base);
          const passthrough = [
            '/favicon.ico',
            '/assets/logo.png',
            '/assets/mock/session.json',
            `${SAME_ORIGIN}/favicon.ico`,
            `${SAME_ORIGIN}/assets/logo.png`,
            // Con base "/" todo el origen cuelga de la API configurada: ahí se bloquean (como antes).
            ...(base === '/' ? [] : ['/auth/session', '/.well-known/jwks.json']),
            'https://cdn.example.test/logo.png',
            'https://api.otro.example.test/usuarios/usr_mock_0001',
          ];
          // Solo lectura: auth/metadatos y orígenes externos se tratan como antes (cualquier método),
          // pero los estáticos solo lo están para GET/HEAD.
          const staticReads = passthrough.filter((u) => /favicon|assets/.test(u));

          for (const url of passthrough) http.get(url).subscribe();
          for (const url of staticReads) http.head(url).subscribe();
          await settle();

          for (const url of passthrough) {
            const request = httpTesting.expectOne((r) => r.url === url && r.method === 'GET');
            expect(request.request.headers.has('Authorization')).toBe(false);
            expect(request.request.headers.has('Ocp-Apim-Subscription-Key')).toBe(false);
            request.flush('');
          }
          for (const url of staticReads) {
            httpTesting.expectOne((r) => r.url === url && r.method === 'HEAD').flush('');
          }
        });

        it('P1 (QA): el prefijo de API SOLO (/api, /api/, /v1, ...) permanece bloqueado, con cualquier método y cuerpo', async () => {
          const http = await signedInHttp(base);
          const bare = [
            '/api', '/api/', '/v1', '/v1/', '/api/v1', '/api/v1/', '/v1/api', '/v1/api/',
            '/api//', '/v1//', '/API', '/V1/',
          ];

          for (const path of bare) {
            await expectBlocked(http, path);
            await expectBlocked(http, `${SAME_ORIGIN}${path}`);
          }

          expect(httpTesting.match(() => true)).toHaveLength(0);
        });

        it('P1 (QA): el prefijo no convierte la raíz en un estático ni deja pasar rutas desconocidas', async () => {
          const http = await signedInHttp(base);

          for (const path of ['/', '/desconocida', '/main.js', '/i18n/es.json', '/api/favicon.ico', '/v1/assets/logo.png']) {
            await expectBlocked(http, path);
          }

          expect(httpTesting.match(() => true)).toHaveLength(0);
        });

        it('el estático explícito NO autoriza escrituras: POST/PUT/PATCH/DELETE a /favicon.ico y /assets/* se bloquean', async () => {
          const http = await signedInHttp(base);
          const body = { dato: 'sensible' };

          for (const url of ['/favicon.ico', '/assets/logo.png', `${SAME_ORIGIN}/favicon.ico`]) {
            for (const [verb, call] of [
              ['POST', () => http.post(url, body)],
              ['PUT', () => http.put(url, body)],
              ['PATCH', () => http.patch(url, body)],
              ['DELETE', () => http.delete(url)],
            ] as const) {
              const errors: unknown[] = [];
              call().subscribe({ error: (error: unknown) => errors.push(error) });
              await tick();

              expect(httpTesting.match(() => true), `${verb} ${url}`).toHaveLength(0);
              expect(errors[0], `${verb} ${url}`).toBeInstanceOf(BusinessTransportBlockedError);
            }
          }
        });

        it('el estático explícito no sirve para colar rutas de negocio (segmentos de punto, codificación)', async () => {
          const http = await signedInHttp(base);

          for (const path of [
            '/assets/../usuarios/usr_mock_0001',
            '/assets/%2e%2e/usuarios/usr_mock_0001',
            '/assets%2f..%2fusuarios/usr_mock_0001',
            '/favicon.ico/../usuarios/usr_mock_0001',
          ]) {
            await expectBlocked(http, path);
          }

          expect(httpTesting.match(() => true)).toHaveLength(0);
        });
      });
    }

    describe('P1 (QA): API base real (https://backend.real.example.test/v1)', () => {
      const BACKEND = 'https://backend.real.example.test';

      it('/api, /api/, /v1 y la raíz del origen configurado no escapan; el cuerpo nunca llega al transporte', async () => {
        const http = await signedInHttp(REAL_BACKEND);

        for (const path of ['/api', '/api/', '/v1', '/v1/', '/', '/api/v1', '/v1/api', '/favicon.ico', '/assets/x.png']) {
          await expectBlocked(http, `${BACKEND}${path}`);
        }
        await expectBlocked(http, `${BACKEND}/api/usuarios/usr_mock_0001`);
        await expectBlocked(http, `${BACKEND}/v1/usuarios/usr_mock_0001`);
        await expectBlocked(http, `${BACKEND}/usuarios/usr_mock_0001`);

        expect(httpTesting.match(() => true)).toHaveLength(0);
      });

      it('reproducción exacta: PUT https://backend.real.example.test/api no sale', async () => {
        const http = await signedInHttp(REAL_BACKEND);
        const errors: unknown[] = [];

        http.put(`${BACKEND}/api`, { dato: 'sensible' }).subscribe({ error: (e: unknown) => errors.push(e) });
        await tick();

        const leaked = httpTesting.match(() => true);
        expect(leaked.map((r) => `${r.request.method} ${r.request.url} ${JSON.stringify(r.request.body)}`)).toEqual([]);
        expect(errors[0]).toBeInstanceOf(BusinessTransportBlockedError);
      });

      it('el favicon del frontend (otro origen) sigue disponible', async () => {
        const http = await signedInHttp(REAL_BACKEND);

        http.get('/favicon.ico').subscribe();
        await settle();

        httpTesting.expectOne('/favicon.ico').flush('');
      });
    });

    it('auth/metadatos conservan su tratamiento: bajo una base raíz "/" cuelgan de la API y se bloquean', async () => {
      const http = await signedInHttp('/');

      await expectBlocked(http, '/auth/session');
      await expectBlocked(http, '/.well-known/jwks.json');
      expect(httpTesting.match(() => true)).toHaveLength(0);
    });

    it('P3 (QA): GET /favicon.ico con la API base raíz "/" se permite (reproducción exacta)', async () => {
      const http = await signedInHttp('/');
      const errors: unknown[] = [];

      http.get('/favicon.ico').subscribe({ error: (e: unknown) => errors.push(e) });
      await settle();

      expect(errors).toHaveLength(0);
      const request = httpTesting.expectOne('/favicon.ico');
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush('');
    });

    it('el bloqueo no depende de ApiClientService: HttpClient directo con base real también falla cerrado', async () => {
      const http = await signedInHttp(REAL_BACKEND);

      await expectBlocked(http, `${REAL_BACKEND}/usuarios/usr_mock_0001`);
      // Mismo origen que la API pero fuera de su prefijo (/v1): también es de negocio.
      await expectBlocked(http, 'https://backend.real.example.test/usuarios/usr_mock_0001');
      expect(httpTesting.match(() => true)).toHaveLength(0);
    });

    it('con transporte "enabled" (adaptador real futuro) la ruta no se bloquea', async () => {
      environment.apiBaseUrl = '';
      configure(true, [{ provide: AUTH_V2_BUSINESS_TRANSPORT, useValue: 'enabled' }]);
      httpTesting = TestBed.inject(HttpTestingController);
      TestBed.inject(HttpClient).get('/usuarios/usr_mock_0001').subscribe();
      await settle();

      httpTesting.expectOne('/usuarios/usr_mock_0001').flush({});
    });

    it('authCoreV2=false conserva el comportamiento legado: la petición sale (API base vacía)', async () => {
      environment.apiBaseUrl = '';
      configure(false);
      httpTesting = TestBed.inject(HttpTestingController);

      TestBed.inject(HttpClient).put('/usuarios/usr_mock_0001', { x: 1 }).subscribe();
      await settle();

      const request = httpTesting.expectOne('/usuarios/usr_mock_0001');
      expect(request.request.method).toBe('PUT');
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
    });
  });

  describe('authCoreV2=false: comportamiento legado intacto', () => {
    beforeEach(() => {
      environment.apiBaseUrl = REAL_BACKEND;
      configure(false);
      httpTesting = TestBed.inject(HttpTestingController);
    });

    it('UserService sigue usando el transporte HTTP (el bloqueo solo aplica con el flag)', async () => {
      const result = firstValueFrom(TestBed.inject(UserService).getUser('USR-001'));
      await tick();

      const request = httpTesting.expectOne(`${REAL_BACKEND}/usuarios/USR-001`);
      expect(request.request.method).toBe('GET');
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({ id: 'USR-001' });

      await expect(result).resolves.toEqual({ id: 'USR-001' });
    });

    it('el userId hostil llega al transporte como un único segmento codificado (P2-01)', async () => {
      TestBed.inject(UserService).getUser('a/b?c#d').subscribe();
      await tick();

      const request = httpTesting.expectOne(`${REAL_BACKEND}/usuarios/a%2Fb%3Fc%23d`);
      const url = new URL(request.request.url);
      expect(url.pathname).toBe('/v1/usuarios/a%2Fb%3Fc%23d');
      expect(url.search).toBe('');
      expect(url.hash).toBe('');
      request.flush({});
    });
  });
});
