import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ApiClientService } from '../../api/api-client.service';
import { apiKeyInterceptor } from '../../api/api-key.interceptor';
import { FEATURE_FLAGS } from '../../feature-flags';
import { AuthApiPort } from './auth-api.port';
import { AuthRequiredError } from './auth-contract';
import { AuthSessionService } from './auth-session.service';
import { ResultHoldingLock, SignalHub } from './auth-v2.testing';
import { AUTH_V2_BUSINESS_TRANSPORT, BusinessTransportBlockedError, BusinessTransportMode } from './business-transport';
import { GoogleCatalogCredential } from './google-catalog-credential';
import { MockAuthApiAdapter, MockAuthBackend } from './mock-auth-api.adapter';
import { SessionLock } from './session-lock';
import { SessionSignalChannel } from './session-signal-channel';

const USERS = 'https://app.example.test/api/users';
const CATALOG = 'https://app.example.test/api/catalog/v1';
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

function googleToken(expSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: expSeconds })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `eyJhbGciOiJSUzI1NiJ9.${payload}.c2ln`;
}

type Env = { apiBaseUrl: string; catalogApiBaseUrl?: string };

describe('authCoreV2: publicaciones hacia el proxy del catálogo, sesión y perfil hacia ms-users', () => {
  const env = environment as Env;
  const original = { ...env };
  let httpTesting: HttpTestingController;
  let session: AuthSessionService;
  let credential: GoogleCatalogCredential;

  function setup(transport: BusinessTransportMode, catalog: string | null = CATALOG): void {
    env.apiBaseUrl = USERS;
    env.catalogApiBaseUrl = catalog ?? undefined;
    const hub = new SignalHub();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiKeyInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        { provide: FEATURE_FLAGS, useValue: { authCoreV2: true } },
        { provide: AUTH_V2_BUSINESS_TRANSPORT, useValue: transport },
        { provide: AuthApiPort, useValue: new MockAuthApiAdapter(new MockAuthBackend()) },
        { provide: SessionLock, useValue: new ResultHoldingLock() },
        { provide: SessionSignalChannel, useValue: hub.channelFor({}) },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    session = TestBed.inject(AuthSessionService);
    credential = TestBed.inject(GoogleCatalogCredential);
  }

  async function signIn(token = googleToken(Date.now() / 1000 + 3600)): Promise<void> {
    const attempt = await session.startGoogleAttempt();
    await session.signInWithGoogle(token, attempt);
    credential.hold(token);
  }

  function capture(observable: ReturnType<HttpClient['get']>): unknown[] {
    const errors: unknown[] = [];
    observable.subscribe({ error: (error: unknown) => errors.push(error) });
    return errors;
  }

  afterEach(() => {
    try {
      httpTesting.verify();
    } finally {
      env.apiBaseUrl = original.apiBaseUrl;
      env.catalogApiBaseUrl = original.catalogApiBaseUrl;
    }
  });

  it('lista, detalle y alta van al catálogo con el token de Google y sin el JWT interno', async () => {
    setup('restricted');
    await signIn();
    const api = TestBed.inject(ApiClientService);
    const token = credential.current();

    api.get('/publicaciones').subscribe();
    api.get('/publicaciones/PUB-001').subscribe();
    api.post('/publicaciones', { titulo: 'x' }).subscribe();
    await settle();

    for (const [method, url] of [['GET', `${CATALOG}/publicaciones`], ['GET', `${CATALOG}/publicaciones/PUB-001`],
      ['POST', `${CATALOG}/publicaciones`]]) {
      const request = httpTesting.expectOne((r) => r.method === method && r.url === url);
      expect(request.request.headers.get('X-MTEC-Google-Authorization')).toBe(`Bearer ${token}`);
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(request.request.headers.has('X-MTEC-Authorization')).toBe(false);
      request.flush({});
    }
  });

  it('el perfil sigue yendo a ms-users con el JWT interno y nunca con el token de Google', async () => {
    setup('restricted');
    await signIn();
    TestBed.inject(HttpClient).get(`${USERS}/v1/me/profile`).subscribe();
    await settle();

    const request = httpTesting.expectOne(`${USERS}/v1/me/profile`);
    expect(request.request.headers.get('Authorization')).toMatch(/^Bearer mock-access-/);
    expect(request.request.headers.has('X-MTEC-Google-Authorization')).toBe(false);
    request.flush({});
  });

  it('sin token de Google la publicación no sale (AuthRequiredError)', async () => {
    setup('restricted');
    const errors = capture(TestBed.inject(ApiClientService).get('/publicaciones'));
    await settle();

    expect(errors[0]).toBeInstanceOf(AuthRequiredError);
    httpTesting.expectNone(() => true);
  });

  it('un logout invalida el token retenido', async () => {
    setup('restricted');
    await signIn();
    await session.logout();
    await settle();

    expect(credential.current()).toBeNull();
    const errors = capture(TestBed.inject(ApiClientService).get('/publicaciones'));
    await settle();
    expect(errors[0]).toBeInstanceOf(AuthRequiredError);
  });

  it('un token caducado no se envía', async () => {
    setup('restricted');
    await signIn(googleToken(Date.now() / 1000 - 1));

    expect(credential.current()).toBeNull();
  });

  it('el resto de rutas del catálogo y métodos no listados siguen bloqueados', async () => {
    setup('restricted');
    await signIn();
    const http = TestBed.inject(HttpClient);
    const blocked = [
      capture(http.get(`${CATALOG}/chats`)),
      capture(http.get(`${CATALOG}/usuarios/USR-001/publicaciones`)),
      capture(http.put(`${CATALOG}/publicaciones/PUB-001`, {})),
      capture(http.delete(`${CATALOG}/publicaciones/PUB-001`)),
      capture(http.get(`${CATALOG}/publicaciones/a%2Fb`)),
      capture(http.get(`${USERS}/publicaciones`)),
    ];
    await settle();

    for (const errors of blocked) expect(errors[0]).toBeInstanceOf(BusinessTransportBlockedError);
    httpTesting.expectNone(() => true);
  });

  it('con sesión simulada (transporte bloqueado) el catálogo tampoco sale', async () => {
    setup('blocked');
    await signIn();
    const errors = capture(TestBed.inject(HttpClient).get(`${CATALOG}/publicaciones`));
    await settle();

    expect(errors[0]).toBeInstanceOf(BusinessTransportBlockedError);
  });

  it('sin catalogApiBaseUrl se conserva el comportamiento anterior (bloqueado)', async () => {
    setup('restricted', null);
    await signIn();
    const errors = capture(TestBed.inject(ApiClientService).get('/publicaciones'));
    await settle();

    expect(errors[0]).toBeInstanceOf(BusinessTransportBlockedError);
  });
});
