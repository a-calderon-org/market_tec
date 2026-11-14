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
import { AUTH_V2_BUSINESS_TRANSPORT, BusinessTransportBlockedError } from './business-transport';
import { GoogleCatalogCredential } from './google-catalog-credential';
import { MockAuthApiAdapter, MockAuthBackend } from './mock-auth-api.adapter';
import { SessionLock } from './session-lock';
import { SessionSignalChannel } from './session-signal-channel';

const ORIGIN = globalThis.location.origin;
const USERS = `${ORIGIN}/api/users`;
const CATALOG_V2 = `${ORIGIN}/api/catalog-v2/v1`;
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

type Env = { apiBaseUrl: string; catalogApiBaseUrl?: string };

describe('catalogInternalJwt: publicaciones del ms-catalog propio con el JWT interno de ms-users', () => {
  const env = environment as Env;
  const original = { ...env };
  let httpTesting: HttpTestingController;
  let session: AuthSessionService;

  function setup(): void {
    env.apiBaseUrl = USERS;
    env.catalogApiBaseUrl = CATALOG_V2;
    const hub = new SignalHub();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiKeyInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        { provide: FEATURE_FLAGS, useValue: { authCoreV2: true, catalogInternalJwt: true } },
        { provide: AUTH_V2_BUSINESS_TRANSPORT, useValue: 'restricted' },
        { provide: AuthApiPort, useValue: new MockAuthApiAdapter(new MockAuthBackend()) },
        { provide: SessionLock, useValue: new ResultHoldingLock() },
        { provide: SessionSignalChannel, useValue: hub.channelFor({}) },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    session = TestBed.inject(AuthSessionService);
  }

  async function signIn(): Promise<void> {
    const attempt = await session.startGoogleAttempt();
    await session.signInWithGoogle('eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.c2ln', attempt);
  }

  afterEach(() => {
    try {
      httpTesting.verify();
    } finally {
      env.apiBaseUrl = original.apiBaseUrl;
      env.catalogApiBaseUrl = original.catalogApiBaseUrl;
    }
  });

  it('lista, detalle, alta y actualización llevan el JWT interno en X-MTEC-Authorization y nunca el token de Google', async () => {
    setup();
    await signIn();
    // Aunque exista un ID Token de Google retenido, este modo no lo usa.
    TestBed.inject(GoogleCatalogCredential).hold('eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.Z29vZ2xl');
    const api = TestBed.inject(ApiClientService);

    api.get('/publicaciones').subscribe();
    api.get('/publicaciones/PUB-001').subscribe();
    api.post('/publicaciones', { titulo: 'x' }).subscribe();
    api.put('/publicaciones/PUB-001', { titulo: 'y' }).subscribe();
    api.delete('/publicaciones/PUB-001').subscribe();
    await settle();

    for (const [method, url] of [['GET', `${CATALOG_V2}/publicaciones`], ['GET', `${CATALOG_V2}/publicaciones/PUB-001`],
      ['POST', `${CATALOG_V2}/publicaciones`], ['PUT', `${CATALOG_V2}/publicaciones/PUB-001`],
      ['DELETE', `${CATALOG_V2}/publicaciones/PUB-001`]]) {
      const request = httpTesting.expectOne((r) => r.method === method && r.url === url);
      expect(request.request.headers.get('X-MTEC-Authorization')).toMatch(/^Bearer mock-access-/);
      expect(request.request.headers.has('X-MTEC-Google-Authorization')).toBe(false);
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(request.request.headers.has('Ocp-Apim-Subscription-Key')).toBe(false);
      expect(request.request.headers.has('X-User-Id')).toBe(false);
      request.flush({});
    }
  });

  it('sin sesión no sale ninguna publicación (AuthRequiredError)', async () => {
    setup();
    const errors: unknown[] = [];
    TestBed.inject(ApiClientService).get('/publicaciones').subscribe({ error: (error: unknown) => errors.push(error) });
    await settle();

    expect(errors[0]).toBeInstanceOf(AuthRequiredError);
    httpTesting.expectNone(() => true);
  });

  it('perfil y sesión siguen contra ms-users; otras rutas del catálogo siguen bloqueadas', async () => {
    setup();
    await signIn();
    const http = TestBed.inject(HttpClient);
    http.get(`${USERS}/v1/me/profile`).subscribe();
    const blocked: unknown[] = [];
    http.get(`${CATALOG_V2}/chats?pageSize=100`).subscribe();
    http.post(`${CATALOG_V2}/chats/chat-1/mensajes`, { texto: 'Hola' }).subscribe();
    for (const call of [http.delete(`${CATALOG_V2}/chats/chat-1/mensajes`), http.delete(`${CATALOG_V2}/publicaciones`),
      http.put(`${CATALOG_V2}/publicaciones`, {})]) {
      call.subscribe({ error: (error: unknown) => blocked.push(error) });
    }
    await settle();

    const profile = httpTesting.expectOne(`${USERS}/v1/me/profile`);
    expect(profile.request.headers.get('X-MTEC-Authorization')).toMatch(/^Bearer mock-access-/);
    profile.flush({});
    for (const path of ['/chats?pageSize=100', '/chats/chat-1/mensajes']) {
      const chat = httpTesting.expectOne(CATALOG_V2 + path);
      expect(chat.request.headers.get('X-MTEC-Authorization')).toMatch(/^Bearer mock-access-/);
      chat.flush({});
    }
    expect(blocked).toHaveLength(3);
    for (const error of blocked) expect(error).toBeInstanceOf(BusinessTransportBlockedError);
  });

  it('un 401 del catálogo gestiona la pérdida de sesión y no reejecuta la petición', async () => {
    setup();
    await signIn();
    const spy = vi.spyOn(session, 'handleBusinessUnauthorized');
    const errors: unknown[] = [];
    TestBed.inject(ApiClientService).post('/publicaciones', {}).subscribe({ error: (e: unknown) => errors.push(e) });
    await settle();

    httpTesting.expectOne(`${CATALOG_V2}/publicaciones`).flush({}, { status: 401, statusText: 'Unauthorized' });
    await settle();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
    httpTesting.expectNone(() => true);
  });
});
