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
import { apiVersionlessPath } from '../../api/api-url';
import { FEATURE_FLAGS } from '../../feature-flags';
import { AuthApiPort } from './auth-api.port';
import { AuthSessionService } from './auth-session.service';
import { isBearerRoute } from './bearer-routes';
import { AUTH_V2_BUSINESS_TRANSPORT } from './business-transport';
import { InMemoryLock, SignalHub } from './auth-v2.testing';
import { MockAuthApiAdapter, MockAuthBackend } from './mock-auth-api.adapter';
import { SessionLock } from './session-lock';
import { SessionSignalChannel } from './session-signal-channel';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

/** Configuraciones de API base que debe soportar el interceptor (P1-02). */
const BASES = [
  {
    label: 'API base en la raíz',
    base: 'https://api.example.test',
    origin: 'https://api.example.test',
  },
  {
    label: 'API base terminada en /v1',
    base: 'https://api.example.test/v1',
    origin: 'https://api.example.test',
  },
  {
    label: 'API base bajo otro prefijo',
    base: 'https://api.example.test/api',
    origin: 'https://api.example.test/api',
  },
] as const;

/** URL absoluta de `route` (ruta sin /v1) para cada configuración, con o sin /v1 en la petición. */
function urlsFor(config: (typeof BASES)[number], route: string): string[] {
  const withVersion = config.base.endsWith('/v1')
    ? `${config.base}${route}`
    : `${config.origin}/v1${route}`;
  const withoutVersion = config.base.endsWith('/v1') ? null : `${config.origin}${route}`;

  return [withVersion, ...(withoutVersion ? [withoutVersion] : [])];
}

describe('apiVersionlessPath', () => {
  const cases: [string, string, string | null][] = [
    ['https://api.example.test', 'https://api.example.test/v1/auth/session', '/auth/session'],
    ['https://api.example.test', 'https://api.example.test/auth/session', '/auth/session'],
    ['https://api.example.test/v1', 'https://api.example.test/v1/auth/session', '/auth/session'],
    ['https://api.example.test/v1/', 'https://api.example.test/v1/publicaciones', '/publicaciones'],
    [
      'https://api.example.test/api',
      'https://api.example.test/api/v1/publicaciones',
      '/publicaciones',
    ],
    ['https://api.example.test', 'https://api.example.test/v1', '/'],
    [
      'https://api.example.test',
      'https://api.example.test/.well-known/jwks.json',
      '/.well-known/jwks.json',
    ],
    // Un /v1 de la petición no se confunde con el de la base.
    [
      'https://api.example.test',
      'https://api.example.test/v1x/publicaciones',
      '/v1x/publicaciones',
    ],
    ['https://api.example.test', 'https://other.example.test/v1/publicaciones', null],
    ['', 'https://api.example.test/v1/publicaciones', null],
  ];

  for (const [base, url, expected] of cases) {
    it(`${JSON.stringify(base)} + ${url} → ${expected}`, () => {
      expect(apiVersionlessPath(url, base)).toBe(expected);
    });
  }
});

describe('isBearerRoute (lista explícita)', () => {
  for (const route of [
    '/me/profile',
    '/me/password',
    '/usuarios/usr_1',
    '/usuarios/a%2Fb%3Fc%23d',
    '/usuarios/usr_1/publicaciones',
    '/publicaciones',
    '/publicaciones/PUB-1',
    '/chats',
    '/chats/C1/mensajes',
    '/notificaciones',
  ]) {
    it(`permite ${route}`, () => expect(isBearerRoute(route)).toBe(true));
  }

  for (const route of [
    '/auth/session',
    '/auth/refresh',
    '/auth/logout',
    '/auth/google',
    '/auth/attempts',
    '/auth/session/activity',
    '/AUTH/session',
    '/.well-known/jwks.json',
    '/.well-known/markettec-identity',
    '/foo',
    '/usuarios',
    '/usuarios/a/b',
    '/publicaciones/PUB-1/otra/cosa',
    '/',
  ]) {
    it(`excluye ${route}`, () => expect(isBearerRoute(route)).toBe(false));
  }
});

for (const config of BASES) {
  describe(`authCoreV2Interceptor — rutas con bearer (${config.label})`, () => {
    let http: HttpClient;
    let httpTesting: HttpTestingController;
    let session: AuthSessionService;
    const originalApiBaseUrl = environment.apiBaseUrl;

    beforeEach(async () => {
      environment.apiBaseUrl = config.base;
      const backend = new MockAuthBackend();
      const hub = new SignalHub();

      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(withInterceptors([apiKeyInterceptor])),
          provideHttpClientTesting(),
          { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
          { provide: FEATURE_FLAGS, useValue: { authCoreV2: true } },
          { provide: AUTH_V2_BUSINESS_TRANSPORT, useValue: 'enabled' },
          { provide: AuthApiPort, useValue: new MockAuthApiAdapter(backend) },
          { provide: SessionLock, useValue: new InMemoryLock() },
          { provide: SessionSignalChannel, useValue: hub.channelFor({}) },
        ],
      });

      http = TestBed.inject(HttpClient);
      httpTesting = TestBed.inject(HttpTestingController);
      session = TestBed.inject(AuthSessionService);

      const attempt = await session.startGoogleAttempt();
      await session.signInWithGoogle('google-id-token-placeholder', attempt);
    });

    afterEach(() => {
      try {
        httpTesting.verify();
      } finally {
        environment.apiBaseUrl = originalApiBaseUrl;
      }
    });

    /** Envía y devuelve la petición interceptada tal como llegó al backend. */
    async function dispatch(method: string, url: string) {
      http
        .request(method, url, method === 'GET' ? {} : { body: {} })
        .subscribe({ error: () => undefined });
      await settle();

      const request = httpTesting.expectOne(url);
      request.flush({});

      return request.request;
    }

    const excluded: [string, string][] = [
      ['GET', '/auth/session'],
      ['POST', '/auth/refresh'],
      ['POST', '/auth/logout'],
      ['POST', '/auth/google'],
      ['POST', '/auth/attempts'],
      ['GET', '/auth/session/activity'],
      ['GET', '/.well-known/jwks.json'],
      ['GET', '/.well-known/markettec-identity'],
      ['GET', '/ruta-desconocida'],
    ];

    for (const [method, route] of excluded) {
      it(`${method} ${route} no recibe Authorization`, async () => {
        for (const url of urlsFor(config, route)) {
          const request = await dispatch(method, url);

          expect(request.headers.has('Authorization')).toBe(false);
          expect(request.headers.has('Ocp-Apim-Subscription-Key')).toBe(false);
        }
      });
    }

    it('con query y fragmento seguidos de una ruta de cookie tampoco recibe Authorization', async () => {
      for (const url of urlsFor(config, '/auth/session')) {
        const withQuery = `${url}?x=1`;
        const request = await dispatch('GET', withQuery);
        expect(request.headers.has('Authorization')).toBe(false);
      }
    });

    const allowed: [string, string][] = [
      ['GET', '/publicaciones'],
      ['POST', '/publicaciones'],
      ['GET', '/publicaciones/PUB-1'],
      ['GET', '/usuarios/usr_mock_0001'],
      ['PUT', '/usuarios/usr_mock_0001'],
      ['GET', '/usuarios/a%2Fb%3Fc%23d'],
      ['GET', '/me/profile'],
      ['GET', '/me/password'],
      ['POST', '/me/password'],
      ['GET', '/chats'],
      ['POST', '/chats/C1/mensajes'],
    ];

    for (const [method, route] of allowed) {
      it(`${method} ${route} (negocio reconocido) recibe el JWT interno`, async () => {
        for (const url of urlsFor(config, route)) {
          const request = await dispatch(method, url);

          expect(request.headers.get('Authorization')).toMatch(/^Bearer mock-access-/);
          expect(request.headers.has('Ocp-Apim-Subscription-Key')).toBe(false);
        }
      });
    }

    it('no adjunta Authorization a un origen distinto ni con la misma ruta de negocio', async () => {
      for (const url of [
        'https://other.example.test/v1/publicaciones',
        'https://other.example.test/publicaciones',
        'https://api.example.test.evil.test/v1/publicaciones',
        'http://api.example.test/v1/publicaciones',
      ]) {
        const request = await dispatch('GET', url);

        expect(request.headers.has('Authorization')).toBe(false);
      }
    });

    it('D-11: un 401 en una ruta de negocio no se reenvía (cero replay)', async () => {
      const [url] = urlsFor(config, '/publicaciones/PUB-1');
      const errors: unknown[] = [];
      http.get(url).subscribe({ error: (error: unknown) => errors.push(error) });
      await settle();

      httpTesting.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });
      await settle();

      expect((errors[0] as HttpErrorResponse).status).toBe(401);
      expect(httpTesting.match(() => true).filter((r) => r.request.url === url)).toHaveLength(0);
    });
  });
}
