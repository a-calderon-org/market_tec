import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import {
  describeGoogleAuthFailure,
  GoogleAuthService,
} from '../../../features/auth/services/google-auth.service';
import { ProfileResponseError } from '../../../features/profile/models/user-profile-v1';
import { UserService } from '../../../features/profile/services/user.service';
import { apiKeyInterceptor } from '../../api/api-key.interceptor';
import { versionedApiUrl } from '../../api/api-url';
import { FEATURE_FLAGS, FeatureFlags } from '../../feature-flags';
import { AuthApiPort } from './auth-api.port';
import { AuthApiError, AuthRequiredError } from './auth-contract';
import { AuthSessionService } from './auth-session.service';
import { AuthSessionStore } from './auth-session.store';
import {
  AUTH_V2_HTTP_API_BASE,
  AUTH_V2_HTTP_TIMEOUT_MS,
  AUTH_V2_MIN_WRITE_START_MS,
  AUTH_V2_WARMING_RETRY_MS,
  resolveHttpApiBase,
} from './auth-v2-config';
import { bindDeadline } from './request-deadline';
import { SESSION_COORDINATOR_CONFIG } from './session-coordinator';
import { InMemoryLock, SignalHub } from './auth-v2.testing';
import { AUTH_V2_BUSINESS_TRANSPORT, BusinessTransportBlockedError } from './business-transport';
import { EmailLinkCsrf } from './email-link-csrf';
import { CLIENT_BUDGET_HEADER, HttpAuthApiAdapter } from './http-auth-api.adapter';
import { provideAuthCoreV2 } from './provide-auth-core-v2';
import { SessionLock } from './session-lock';
import { SessionSignalChannel } from './session-signal-channel';

/*
 * Integración Angular ↔ ms-users con HttpTestingController. Las formas de request y
 * response replican los controladores Java de ms-users `main@08ccf05`
 * (ver docs/MTEC10_AUTH_V2_HTTP_INTEROPERABILITY.md). No sustituye a una prueba en
 * navegador real contra Azure (cookies __Host-, CORS, Web Locks reales).
 */

const API = 'https://api.example.test';
const ATTEMPT_ID = 'a'.repeat(32);
const ATTEMPT_CSRF = 'b'.repeat(64);
const SESSION_CSRF = 'c'.repeat(64);
const ROTATED_CSRF = 'd'.repeat(64);
const NONCE = 'nonce-from-java';
const USER_ID = 'usr_internal_0001';
const OTHER_USER_ID = 'usr_internal_0002';
const GOOGLE_ID_TOKEN = 'google.id.token';
const INTERNAL_JWT = 'internal.jwt.first';
const ROTATED_JWT = 'internal.jwt.rotated';

const HTTP_FLAGS: FeatureFlags = {
  authCoreV2: true,
  authCoreV2Adapter: 'http',
  authCoreV2HttpTopologyVerified: true,
};

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const settle = async () => {
  for (let i = 0; i < 6; i++) await tick();
};
const now = () => Math.floor(Date.now() / 1000);

function snapshot() {
  const t = now();
  return {
    sessionId: 'sess-1',
    status: 'active',
    serverTime: t,
    authenticatedAt: t,
    renewedAt: t,
    lastActivityAt: t,
    windowExpiresAt: t + 900,
    inactivityExpiresAt: t + 1800,
    absoluteExpiresAt: t + 28800,
    expiresAt: t + 1800,
    warningAt: t + 1500,
  };
}

function javaUser(userId = USER_ID) {
  return { userId, email: 'est@estudiantec.cr', nombre: 'Estudiante', fotoPerfil: 'https://img/x.png' };
}

function authResponse(token = INTERNAL_JWT, csrfToken = SESSION_CSRF, userId = USER_ID) {
  return {
    token,
    tokenType: 'Bearer',
    expiresAt: now() + 600,
    user: javaUser(userId),
    session: snapshot(),
    csrfToken,
  };
}

function attemptResponse(purpose: 'login' | 'register' = 'login') {
  return {
    attemptId: ATTEMPT_ID,
    method: 'google',
    purpose,
    expiresAt: now() + 300,
    csrfToken: ATTEMPT_CSRF,
    nonce: NONCE,
  };
}

function profileV1(id = USER_ID) {
  return {
    id,
    nombreUsuario: 'est.tec',
    nombre: 'Estudiante',
    apellidos: 'TEC',
    correo: 'est@estudiantec.cr',
    fotoPerfil: 'https://img/x.png',
    fechaRegistro: '2026-01-01T00:00:00Z',
    createdAt: 1767225600,
    verificado: true,
    estado: 'activo',
  };
}

function envelope(code: string) {
  return {
    error: {
      code,
      message: 'No se pudo completar la operación.',
      details: [],
      correlationId: 'corr',
      timestamp: now(),
    },
  };
}

const url = (path: string) => `${API}${path}`;

describe('HttpAuthApiAdapter + núcleo v2 contra ms-users (HttpTestingController)', () => {
  let httpTesting: HttpTestingController;
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  const originalApiBaseUrl = environment.apiBaseUrl;

  function configure(flags: Partial<FeatureFlags> = HTTP_FLAGS, extra: Provider[] = []): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiKeyInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: FEATURE_FLAGS, useValue: flags },
        ...provideAuthCoreV2(),
        { provide: SessionLock, useValue: new InMemoryLock() },
        { provide: SessionSignalChannel, useValue: new SignalHub().channelFor({}) },
        ...extra,
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    environment.apiBaseUrl = API;
    router.navigate.mockClear();
  });

  afterEach(() => {
    try {
      httpTesting?.verify();
    } finally {
      environment.apiBaseUrl = originalApiBaseUrl;
      delete window.google;
      vi.restoreAllMocks();
    }
  });

  /** Ninguna petición de autenticación lleva bearer ni clave de APIM. */
  function expectCookieRequest(req: TestRequest, method: string): void {
    expect(req.request.method).toBe(method);
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('X-MTEC-Client')).toBe('web');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.headers.has('Ocp-Apim-Subscription-Key')).toBe(false);
    expect(req.request.headers.has('Origin')).toBe(false); // lo pone el navegador
  }

  async function signIn(userId = USER_ID): Promise<void> {
    const session = TestBed.inject(AuthSessionService);
    const attemptPromise = session.startGoogleAttempt('login');
    await settle();
    httpTesting.expectOne(url('/v1/auth/attempts')).flush(attemptResponse());
    const attempt = await attemptPromise;

    const done = session.signInWithGoogle(GOOGLE_ID_TOKEN, attempt);
    await settle();
    httpTesting
      .expectOne(url('/v1/auth/google'))
      .flush(authResponse(INTERNAL_JWT, SESSION_CSRF, userId));
    await done;
  }

  describe('Magic Link institucional', () => {
    const EMAIL_CSRF = 'e'.repeat(64);
    const TOKEN = 'f'.repeat(64);

    beforeEach(() => {
      localStorage.clear();
      configure();
    });

    async function requestLink(csrfToken = EMAIL_CSRF): Promise<void> {
      const pending = TestBed.inject(AuthSessionService).requestEmailLink('ana@estudiantec.cr');
      const req = httpTesting.expectOne(url('/v1/auth/email/requests'));
      expectCookieRequest(req, 'POST');
      expect(req.request.body).toEqual({ email: 'ana@estudiantec.cr' });
      expect(req.request.headers.has('X-CSRF-Token')).toBe(false);
      req.flush({ status: 'accepted', csrfToken }, { status: 202, statusText: 'Accepted' });
      await pending;
    }

    it('solicita el enlace y confirma con la cookie de intento y su CSRF: sesión interna en memoria', async () => {
      await requestLink();
      // Solo el CSRF del intento se comparte con la pestaña del enlace; nunca attemptId ni token.
      expect(JSON.stringify(localStorage)).toContain(EMAIL_CSRF);
      expect(JSON.stringify(localStorage)).not.toContain(ATTEMPT_ID);
      expect(JSON.stringify(localStorage)).not.toContain(TOKEN);

      // Otra pestaña comparte localStorage pero arranca con un núcleo de sesión nuevo.
      httpTesting.verify();
      TestBed.resetTestingModule();
      configure();

      const session = TestBed.inject(AuthSessionService);
      const done = session.confirmEmailLink({ attemptId: ATTEMPT_ID, token: TOKEN });
      await settle();
      const req = httpTesting.expectOne(url('/v1/auth/email/confirm'));
      expectCookieRequest(req, 'POST');
      expect(req.request.headers.get('X-CSRF-Token')).toBe(EMAIL_CSRF);
      expect(req.request.body).toEqual({ attemptId: ATTEMPT_ID, token: TOKEN });
      req.flush(authResponse());
      await done;

      expect(session.currentIdentity()?.userId).toBe(USER_ID);
      expect(await session.getAccessToken()).toBe(INTERNAL_JWT);
      expect(JSON.stringify(localStorage)).not.toContain(EMAIL_CSRF);
      expect(JSON.stringify(localStorage)).not.toContain(TOKEN);
    });

    it('desde otro navegador (sin el intento) no envía nada ni gasta el enlace', async () => {
      const session = TestBed.inject(AuthSessionService);
      await expect(session.confirmEmailLink({ attemptId: ATTEMPT_ID, token: TOKEN }))
        .rejects.toMatchObject({ status: 403, code: 'EMAIL_LINK_OTHER_BROWSER' });
      httpTesting.expectNone(url('/v1/auth/email/confirm'));
      expect(session.currentIdentity()).toBeNull();
    });

    it('enlace consumido, expirado o de otra cuenta Google: error de Java y ninguna sesión', async () => {
      for (const [status, code] of [[409, 'ATTEMPT_CONSUMED'], [410, 'ATTEMPT_EXPIRED'],
        [409, 'CONTINUITY_REQUIRED'], [403, 'CSRF_INVALID']] as const) {
        await requestLink();
        const session = TestBed.inject(AuthSessionService);
        const done = session.confirmEmailLink({ attemptId: ATTEMPT_ID, token: TOKEN });
        await settle();
        httpTesting.expectOne(url('/v1/auth/email/confirm')).flush(envelope(code), { status, statusText: 'x' });
        await expect(done).rejects.toMatchObject({ status, code });
        expect(session.currentIdentity()).toBeNull();
        expect(JSON.stringify(localStorage)).not.toContain(EMAIL_CSRF);
      }
    });

    it('conserva el CSRF vigente al abrir un enlace anterior', async () => {
      await requestLink();
      const session = TestBed.inject(AuthSessionService);
      const done = session.confirmEmailLink({ attemptId: ATTEMPT_ID, token: TOKEN });
      const req = httpTesting.expectOne(url('/v1/auth/email/confirm'));
      req.flush(envelope('AUTH_PROOF_INVALID'), { status: 401, statusText: 'Unauthorized' });
      await expect(done).rejects.toMatchObject({ code: 'AUTH_PROOF_INVALID' });
      expect(TestBed.inject(EmailLinkCsrf).read()).toBe(EMAIL_CSRF);
    });

    it('una respuesta tardía no borra el CSRF de un intento nuevo', async () => {
      await requestLink();
      const session = TestBed.inject(AuthSessionService);
      const done = session.confirmEmailLink({ attemptId: ATTEMPT_ID, token: TOKEN });
      const req = httpTesting.expectOne(url('/v1/auth/email/confirm'));
      await requestLink(ROTATED_CSRF);
      req.flush(envelope('ATTEMPT_EXPIRED'), { status: 410, statusText: 'Gone' });
      await expect(done).rejects.toMatchObject({ code: 'ATTEMPT_EXPIRED' });
      expect(TestBed.inject(EmailLinkCsrf).read()).toBe(ROTATED_CSRF);
    });

    it('descarta el CSRF vencido después de diez minutos sin confirmar el enlace', async () => {
      const start = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
      await requestLink();
      clock.mockReturnValue(start + 10 * 60 * 1000);
      const session = TestBed.inject(AuthSessionService);
      await expect(session.confirmEmailLink({ attemptId: ATTEMPT_ID, token: TOKEN }))
        .rejects.toMatchObject({ code: 'EMAIL_LINK_OTHER_BROWSER' });
      httpTesting.expectNone(url('/v1/auth/email/confirm'));
      expect(JSON.stringify(localStorage)).not.toContain(EMAIL_CSRF);
    });

    it('fallo del proveedor (503) o 202 malformado no se informan como enviados', async () => {
      const session = TestBed.inject(AuthSessionService);
      let pending = session.requestEmailLink('ana@estudiantec.cr');
      httpTesting.expectOne(url('/v1/auth/email/requests'))
        .flush(envelope('AUTH_TEMPORARILY_UNAVAILABLE'), { status: 503, statusText: 'x' });
      await expect(pending).rejects.toMatchObject({ status: 503 });

      pending = session.requestEmailLink('ana@estudiantec.cr');
      httpTesting.expectOne(url('/v1/auth/email/requests')).flush({ status: 'accepted' });
      await expect(pending).rejects.toMatchObject({ status: 0, code: 'INVALID_RESPONSE' });
      expect(JSON.stringify(localStorage)).not.toContain('csrfToken');
    });
  });

  describe('autenticación Google', () => {
    beforeEach(() => configure());

    it('POST /v1/auth/attempts envía method, purpose, X-MTEC-Client y cookies', async () => {
      const port = TestBed.inject(AuthApiPort);
      expect(port).toBeInstanceOf(HttpAuthApiAdapter);

      for (const purpose of ['login', 'register'] as const) {
        const pending = port.createGoogleAttempt(purpose);
        const req = httpTesting.expectOne(url('/v1/auth/attempts'));
        expectCookieRequest(req, 'POST');
        expect(req.request.body).toEqual({ method: 'google', purpose });
        expect(req.request.headers.has('X-CSRF-Token')).toBe(false);
        req.flush(attemptResponse(purpose));

        await expect(pending).resolves.toEqual({
          attemptId: ATTEMPT_ID,
          purpose,
          nonce: NONCE,
          expiresAt: expect.any(Number),
          csrfToken: ATTEMPT_CSRF,
        });
      }
    });

    it('GIS recibe el nonce de Java; el credential se intercambia UNA vez y crea la sesión interna', async () => {
      const initialize = vi.fn();
      window.google = {
        accounts: {
          id: {
            initialize,
            renderButton: (el: HTMLElement) => el.appendChild(document.createElement('div')),
            disableAutoSelect: vi.fn(),
          },
        },
      };
      const google = TestBed.inject(GoogleAuthService);
      const element = document.createElement('div');
      document.body.appendChild(element);

      const rendering = google.renderButton(element, () => undefined);
      await settle();
      httpTesting.expectOne(url('/v1/auth/attempts')).flush(attemptResponse());
      await rendering;
      element.remove();

      expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ nonce: NONCE }));

      const signingIn = google.signIn(GOOGLE_ID_TOKEN);
      await settle();
      const exchange = httpTesting.expectOne(url('/v1/auth/google'));
      expectCookieRequest(exchange, 'POST');
      expect(exchange.request.headers.get('X-CSRF-Token')).toBe(ATTEMPT_CSRF);
      // Exactamente los dos campos que Java acepta: el propósito no viaja en el cuerpo.
      expect(exchange.request.body).toEqual({ attemptId: ATTEMPT_ID, credential: GOOGLE_ID_TOKEN });
      exchange.flush(authResponse());
      await signingIn;

      const session = TestBed.inject(AuthSessionService);
      expect(session.status()).toBe('active');
      expect(session.user()?.userId).toBe(USER_ID);
      expect(google.user()?.id).toBe(USER_ID);

      // Segundo callback de GIS: el intento ya se consumió; no se reenvía nada.
      await expect(google.signIn(GOOGLE_ID_TOKEN)).rejects.toThrow();
      httpTesting.expectNone(url('/v1/auth/google'));

      // El JWT interno, nunca el ID Token de Google, es el bearer de negocio.
      void firstValueFrom(TestBed.inject(UserService).getMyProfile()).catch(() => undefined);
      await settle();
      const profile = httpTesting.expectOne(url('/v1/me/profile'));
      expect(profile.request.headers.get('Authorization')).toBe(`Bearer ${INTERNAL_JWT}`);
      expect(profile.request.headers.get('Authorization')).not.toContain(GOOGLE_ID_TOKEN);
      profile.flush(profileV1());
      await settle();

      // El access JWT y el ID Token no quedan en almacenamiento del navegador.
      const stored = JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage }) + document.cookie;
      expect(stored).not.toContain(INTERNAL_JWT);
      expect(stored).not.toContain(GOOGLE_ID_TOKEN);
    });

    it('ignora el callback de GIS de un intento sustituido al cambiar a registro', async () => {
      const initialize = vi.fn<(options: { callback: (response: { credential: string }) => void }) => void>();
      window.google = {
        accounts: {
          id: {
            initialize,
            renderButton: (el) => el.appendChild(document.createElement('div')),
            disableAutoSelect: vi.fn(),
          },
        },
      };
      const google = TestBed.inject(GoogleAuthService);
      const element = document.createElement('div');
      document.body.appendChild(element);
      const onCredential = vi.fn();

      try {
        const login = google.renderButton(element, onCredential);
        httpTesting.expectOne(url('/v1/auth/attempts')).flush(attemptResponse());
        await login;
        const register = google.renderButton(element, onCredential, 'outline', 'register');
        httpTesting.expectOne(url('/v1/auth/attempts')).flush(attemptResponse('register'));
        await register;

        initialize.mock.calls[0][0].callback({ credential: 'obsolete-google-credential' });
        expect(onCredential).not.toHaveBeenCalled();
        initialize.mock.calls[1][0].callback({ credential: GOOGLE_ID_TOKEN });
        expect(onCredential).toHaveBeenCalledExactlyOnceWith(GOOGLE_ID_TOKEN);
      } finally {
        element.remove();
      }
    });

    it('purpose=register intercambia en /v1/auth/google/registrations; 503 se informa como no disponible', async () => {
      const port = TestBed.inject(AuthApiPort);

      const exchanged = port.exchangeGoogle(
        { attemptId: ATTEMPT_ID, credential: GOOGLE_ID_TOKEN, purpose: 'register' },
        ATTEMPT_CSRF,
      );
      const req = httpTesting.expectOne(url('/v1/auth/google/registrations'));
      expect(req.request.body).toEqual({ attemptId: ATTEMPT_ID, credential: GOOGLE_ID_TOKEN });
      req.flush(authResponse());
      await expect(exchanged).resolves.toMatchObject({ token: INTERNAL_JWT });

      const disabled = port.createGoogleAttempt('register');
      httpTesting
        .expectOne(url('/v1/auth/attempts'))
        .flush(envelope('AUTH_TEMPORARILY_UNAVAILABLE'), { status: 503, statusText: 'Unavailable' });
      const error = await disabled.catch((e: unknown) => e);
      expect(error).toEqual(new AuthApiError(503, 'AUTH_TEMPORARILY_UNAVAILABLE'));
      expect(describeGoogleAuthFailure(error, 'register')).toMatch(/creación de cuentas.*no está disponible/);
    });

    it.each([
      [401, 'AUTH_PROOF_INVALID'],
      [403, 'CSRF_INVALID'],
      [503, 'AUTH_TEMPORARILY_UNAVAILABLE'],
    ])('un %i %s del intercambio se representa y no crea sesión', async (status, code) => {
      const session = TestBed.inject(AuthSessionService);
      const attempt = { attemptId: ATTEMPT_ID, purpose: 'login' as const, nonce: NONCE, expiresAt: now() + 300, csrfToken: ATTEMPT_CSRF };

      const done = session.signInWithGoogle(GOOGLE_ID_TOKEN, attempt);
      await settle();
      httpTesting.expectOne(url('/v1/auth/google')).flush(envelope(code), { status, statusText: 'x' });

      await expect(done).rejects.toEqual(new AuthApiError(status, code));
      expect(session.status()).not.toBe('active');
      expect(session.user()).toBeNull();
      // Un login fallido no se convierte en registro.
      httpTesting.expectNone(url('/v1/auth/google/registrations'));
    });

    it('un fallo de red o una respuesta 200 malformada no crean sesión simulada', async () => {
      const session = TestBed.inject(AuthSessionService);
      const attempt = { attemptId: ATTEMPT_ID, purpose: 'login' as const, nonce: NONCE, expiresAt: now() + 300, csrfToken: ATTEMPT_CSRF };

      const network = session.signInWithGoogle(GOOGLE_ID_TOKEN, attempt);
      await settle();
      httpTesting.expectOne(url('/v1/auth/google')).error(new ProgressEvent('error'));
      await expect(network).rejects.toEqual(new AuthApiError(0, 'NETWORK'));

      const malformed = session.signInWithGoogle(GOOGLE_ID_TOKEN, attempt);
      await settle();
      httpTesting.expectOne(url('/v1/auth/google')).flush({ ...authResponse(), csrfToken: 'short' });
      await expect(malformed).rejects.toEqual(new AuthApiError(0, 'INVALID_RESPONSE'));

      expect(session.user()).toBeNull();
      expect(session.status()).not.toBe('active');
    });

    it('respeta el AbortSignal (cancela la petición) y distingue timeout', async () => {
      const port = TestBed.inject(AuthApiPort);
      const controller = new AbortController();

      const pending = port.getSession(controller.signal);
      const req = httpTesting.expectOne(url('/v1/auth/session'));
      controller.abort();

      await expect(pending).rejects.toEqual(new AuthApiError(0, 'ABORTED'));
      expect(req.cancelled).toBe(true);
    });
  });

  it('timeout del adaptador → AuthApiError(0, TIMEOUT) sin reintento', async () => {
    configure(HTTP_FLAGS, [
      { provide: AUTH_V2_HTTP_TIMEOUT_MS, useValue: 5 },
      { provide: AUTH_V2_MIN_WRITE_START_MS, useValue: 0 },
    ]);
    const pending = TestBed.inject(AuthApiPort).refresh(SESSION_CSRF);
    const req = httpTesting.expectOne(url('/v1/auth/refresh'));

    await expect(pending).rejects.toEqual(new AuthApiError(0, 'TIMEOUT'));
    expect(req.cancelled).toBe(true);
    httpTesting.expectNone(url('/v1/auth/refresh'));
  });

  describe('arranque en frío tras el proxy same-origin (MTEC-12/D04)', () => {
    const warming = { error: { code: 'BACKEND_WARMING' } };
    const unavailable = { status: 503, statusText: 'Service Unavailable' };

    it('503 BACKEND_WARMING: repite el mismo POST /refresh y entrega la respuesta', async () => {
      configure(HTTP_FLAGS, [{ provide: AUTH_V2_WARMING_RETRY_MS, useValue: 1 }]);
      const pending = TestBed.inject(AuthApiPort).refresh(SESSION_CSRF);
      httpTesting.expectOne(url('/v1/auth/refresh')).flush(warming, unavailable);
      await new Promise((r) => setTimeout(r, 5));
      const retry = httpTesting.expectOne(url('/v1/auth/refresh'));
      expect(retry.request.headers.get('X-CSRF-Token')).toBe(SESSION_CSRF);
      expect(retry.request.body).toEqual({ mode: 'rotate' });
      retry.flush(authResponse(ROTATED_JWT, ROTATED_CSRF));
      await expect(pending).resolves.toMatchObject({ token: ROTATED_JWT });
    });

    it('otros 503, 504 y TIMEOUT no se reintentan (la escritura pudo procesarse)', async () => {
      configure(HTTP_FLAGS, [{ provide: AUTH_V2_WARMING_RETRY_MS, useValue: 1 }]);
      const port = TestBed.inject(AuthApiPort);
      for (const [body, status] of [
        [{ error: { code: 'INTERNAL_JWT_UNCONFIGURED' } }, unavailable],
        [{ error: { code: 'UPSTREAM_TIMEOUT' } }, { status: 504, statusText: 'Gateway Timeout' }],
      ] as const) {
        const pending = port.refresh(SESSION_CSRF);
        httpTesting.expectOne(url('/v1/auth/refresh')).flush(body, status);
        await expect(pending).rejects.toBeInstanceOf(AuthApiError);
        await new Promise((r) => setTimeout(r, 5));
        httpTesting.expectNone(url('/v1/auth/refresh'));
      }
    });

    it('MTEC-37: hacia el proxy same-origin cada intento declara su presupuesto restante', async () => {
      const base = `${location.origin}/api/users`;
      configure(HTTP_FLAGS, [
        { provide: AUTH_V2_HTTP_API_BASE, useValue: base },
        { provide: AUTH_V2_HTTP_TIMEOUT_MS, useValue: 5_000 },
        { provide: AUTH_V2_WARMING_RETRY_MS, useValue: 20 },
        { provide: AUTH_V2_MIN_WRITE_START_MS, useValue: 1_000 },
      ]);
      const pending = TestBed.inject(AuthApiPort).refresh(SESSION_CSRF);
      const first = httpTesting.expectOne(`${base}/v1/auth/refresh`);
      const firstBudget = Number(first.request.headers.get(CLIENT_BUDGET_HEADER));
      expect(firstBudget).toBeGreaterThan(4_000);
      expect(firstBudget).toBeLessThanOrEqual(5_000);
      first.flush(warming, unavailable);
      await new Promise((r) => setTimeout(r, 40));
      const retry = httpTesting.expectOne(`${base}/v1/auth/refresh`);
      const retryBudget = Number(retry.request.headers.get(CLIENT_BUDGET_HEADER));
      expect(retryBudget).toBeLessThan(firstBudget);
      retry.flush(authResponse(ROTATED_JWT, ROTATED_CSRF));
      await expect(pending).resolves.toMatchObject({ token: ROTATED_JWT });
    });

    it('MTEC-37: a un origen ajeno no se envía el presupuesto (no es un encabezado CORS permitido)', async () => {
      configure(HTTP_FLAGS);
      const pending = TestBed.inject(AuthApiPort).getSession();
      const req = httpTesting.expectOne(url('/v1/auth/session'));
      expect(req.request.headers.has(CLIENT_BUDGET_HEADER)).toBe(false);
      req.flush(warming, { status: 401, statusText: 'Unauthorized' });
      await expect(pending).rejects.toBeInstanceOf(AuthApiError);
    });

    it('los reintentos respetan el tope total del adaptador', async () => {
      configure(HTTP_FLAGS, [
        { provide: AUTH_V2_HTTP_TIMEOUT_MS, useValue: 30 },
        { provide: AUTH_V2_WARMING_RETRY_MS, useValue: 40 },
      ]);
      const pending = TestBed.inject(AuthApiPort).getSession();
      httpTesting.expectOne(url('/v1/auth/session')).flush(warming, unavailable);
      await expect(pending).rejects.toEqual(new AuthApiError(503, 'BACKEND_WARMING'));
      httpTesting.expectNone(url('/v1/auth/session'));
    });
  });

  describe('MTEC-37: plazo compartido coordinador → adaptador → proxy', () => {
    const base = `${location.origin}/api/users`;
    const same = (path: string) => `${base}${path}`;
    const sessionBody = () => ({ session: snapshot(), user: javaUser(), csrfToken: ROTATED_CSRF });

    function configureSameOrigin(coordinatorMs: number, extra: Provider[] = []): void {
      configure(HTTP_FLAGS, [
        { provide: AUTH_V2_HTTP_API_BASE, useValue: base },
        { provide: SESSION_COORDINATOR_CONFIG, useValue: { requestTimeoutMs: coordinatorMs } },
        ...extra,
      ]);
    }

    async function signInSameOrigin(): Promise<void> {
      const session = TestBed.inject(AuthSessionService);
      const attemptPromise = session.startGoogleAttempt('login');
      await settle();
      httpTesting.expectOne(same('/v1/auth/attempts')).flush(attemptResponse());
      const attempt = await attemptPromise;
      const done = session.signInWithGoogle(GOOGLE_ID_TOKEN, attempt);
      await settle();
      httpTesting.expectOne(same('/v1/auth/google')).flush(authResponse());
      await done;
    }

    it('reproducción: GET /session consume 69 s de 75 → el POST /logout NO se envía con un presupuesto nuevo', async () => {
      configureSameOrigin(75_000);
      await signInSameOrigin();
      const session = TestBed.inject(AuthSessionService);
      const start = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(start);

      const loggingOut = session.logout();
      await settle();
      const get = httpTesting.expectOne(same('/v1/auth/session'));
      // El GET declara el plazo de la operación: min(70 s del adaptador, 75 s del coordinador).
      expect(Number(get.request.headers.get(CLIENT_BUDGET_HEADER))).toBe(70_000);
      clock.mockReturnValue(start + 69_000);
      get.flush(sessionBody());
      await settle();

      // Antes el POST salía con X-MTEC-Client-Budget-Ms ≈ 70 000 aunque al coordinador le quedaran 6 s.
      httpTesting.expectNone(same('/v1/auth/logout'));
      await expect(loggingOut).resolves.toBeUndefined();
      expect(session.status()).toBe('closed');
    });

    it('el POST /logout declara al proxy el presupuesto restante del coordinador, no uno propio', async () => {
      configureSameOrigin(30_000);
      await signInSameOrigin();
      const session = TestBed.inject(AuthSessionService);
      const start = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(start);

      const loggingOut = session.logout();
      await settle();
      const get = httpTesting.expectOne(same('/v1/auth/session'));
      expect(Number(get.request.headers.get(CLIENT_BUDGET_HEADER))).toBe(30_000);
      clock.mockReturnValue(start + 12_000);
      get.flush(sessionBody());
      await settle();
      const post = httpTesting.expectOne(same('/v1/auth/logout'));
      expect(post.request.headers.get('X-CSRF-Token')).toBe(ROTATED_CSRF);
      expect(Number(post.request.headers.get(CLIENT_BUDGET_HEADER))).toBe(18_000);
      post.flush(null, { status: 204, statusText: 'No Content' });
      await loggingOut;
    });

    it('con menos del mínimo para una escritura, el POST no empieza (tampoco tras un BACKEND_WARMING)', async () => {
      configureSameOrigin(75_000, [{ provide: AUTH_V2_WARMING_RETRY_MS, useValue: 1 }]);
      const port = TestBed.inject(AuthApiPort);
      const start = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
      const controller = new AbortController();
      bindDeadline(controller.signal, start + 12_000);

      const pending = port.refresh(SESSION_CSRF, controller.signal);
      const first = httpTesting.expectOne(same('/v1/auth/refresh'));
      expect(Number(first.request.headers.get(CLIENT_BUDGET_HEADER))).toBe(12_000);
      clock.mockReturnValue(start + 3_000); // quedan 9 s < 10 s: el reintento no se envía
      first.flush({ error: { code: 'BACKEND_WARMING' } }, { status: 503, statusText: 'Service Unavailable' });
      await expect(pending).rejects.toEqual(new AuthApiError(503, 'BACKEND_WARMING'));
      await settle();
      httpTesting.expectNone(same('/v1/auth/refresh'));

      // Plazo ya agotado: ni siquiera el primer intento sale.
      const expired = new AbortController();
      bindDeadline(expired.signal, start + 3_000);
      await expect(port.refresh(SESSION_CSRF, expired.signal)).rejects.toEqual(new AuthApiError(0, 'TIMEOUT'));
      httpTesting.expectNone(same('/v1/auth/refresh'));
    });

    it('un POST no empieza tras cancelar: abortar durante la espera de BACKEND_WARMING no lo reenvía', async () => {
      configureSameOrigin(75_000, [{ provide: AUTH_V2_WARMING_RETRY_MS, useValue: 30 }]);
      const port = TestBed.inject(AuthApiPort);
      const controller = new AbortController();
      const pending = port.refresh(SESSION_CSRF, controller.signal);
      httpTesting
        .expectOne(same('/v1/auth/refresh'))
        .flush({ error: { code: 'BACKEND_WARMING' } }, { status: 503, statusText: 'Service Unavailable' });
      await tick();
      controller.abort();
      await expect(pending).rejects.toEqual(new AuthApiError(0, 'ABORTED'));
      await new Promise((r) => setTimeout(r, 60));
      httpTesting.expectNone(same('/v1/auth/refresh'));
    });

    it('un POST enviado cuyo resultado es incierto (TIMEOUT) no se reintenta aunque quede plazo', async () => {
      configureSameOrigin(75_000, [
        { provide: AUTH_V2_HTTP_TIMEOUT_MS, useValue: 40 },
        { provide: AUTH_V2_MIN_WRITE_START_MS, useValue: 0 },
        { provide: AUTH_V2_WARMING_RETRY_MS, useValue: 1 },
      ]);
      const pending = TestBed.inject(AuthApiPort).refresh(SESSION_CSRF);
      const sent = httpTesting.expectOne(same('/v1/auth/refresh'));
      await expect(pending).rejects.toEqual(new AuthApiError(0, 'TIMEOUT'));
      expect(sent.cancelled).toBe(true);
      await new Promise((r) => setTimeout(r, 20));
      httpTesting.expectNone(same('/v1/auth/refresh'));
    });
  });

  describe('sesión (D-07) por HTTP', () => {
    beforeEach(() => configure());

    it('bootstrap: GET /session (cookie, sin CSRF) y un POST /refresh con el CSRF obtenido dentro del lock', async () => {
      const session = TestBed.inject(AuthSessionService);
      const restored = session.restoreSession();
      await settle();

      const get = httpTesting.expectOne(url('/v1/auth/session'));
      expectCookieRequest(get, 'GET');
      expect(get.request.headers.has('X-CSRF-Token')).toBe(false);
      expect(get.request.body).toBeNull();
      get.flush({ session: snapshot(), user: javaUser(), csrfToken: SESSION_CSRF });
      await settle();

      const refresh = httpTesting.expectOne(url('/v1/auth/refresh'));
      expectCookieRequest(refresh, 'POST');
      expect(refresh.request.body).toEqual({ mode: 'rotate' });
      expect(refresh.request.headers.get('X-CSRF-Token')).toBe(SESSION_CSRF);
      refresh.flush(authResponse(ROTATED_JWT, ROTATED_CSRF));

      await expect(restored).resolves.toBe(true);
      expect(await session.getAccessToken()).toBe(ROTATED_JWT);
      expect(TestBed.inject(AuthSessionStore).csrfToken()).toBe(ROTATED_CSRF);
    });

    it('demandas concurrentes producen un solo GET y un solo POST', async () => {
      const session = TestBed.inject(AuthSessionService);
      const demands = [session.getAccessToken(), session.getAccessToken(), session.restoreSession()];
      await settle();

      httpTesting
        .expectOne(url('/v1/auth/session'))
        .flush({ session: snapshot(), user: javaUser(), csrfToken: SESSION_CSRF });
      await settle();
      httpTesting.expectOne(url('/v1/auth/refresh')).flush(authResponse(ROTATED_JWT, ROTATED_CSRF));

      await expect(Promise.all(demands)).resolves.toEqual([ROTATED_JWT, ROTATED_JWT, true]);
    });

    it('respuesta perdida del refresh: solo reconcilia con GET, sin segundo POST', async () => {
      const session = TestBed.inject(AuthSessionService);
      const restored = session.restoreSession();
      await settle();
      httpTesting
        .expectOne(url('/v1/auth/session'))
        .flush({ session: snapshot(), user: javaUser(), csrfToken: SESSION_CSRF });
      await settle();
      httpTesting.expectOne(url('/v1/auth/refresh')).error(new ProgressEvent('error'));
      await settle();

      httpTesting
        .expectOne(url('/v1/auth/session'))
        .flush({ session: snapshot(), user: javaUser(), csrfToken: ROTATED_CSRF });

      await expect(restored).resolves.toBe(false);
      await settle();
      httpTesting.expectNone(url('/v1/auth/refresh'));
      // GET /session reconcilió estado; no entregó JWT.
      expect(TestBed.inject(AuthSessionStore).accessToken(Date.now())).toBeNull();
      expect(session.status()).toBe('active');
    });

    it('logout usa el CSRF rotado en otra pestaña y descarta una restauración en vuelo', async () => {
      await signIn();
      const session = TestBed.inject(AuthSessionService);
      const store = TestBed.inject(AuthSessionStore);
      store.dropAccessToken(INTERNAL_JWT);

      // Demanda en vuelo de la sesión que se va a cerrar.
      const late = session.restoreSession();
      await settle();
      const get = httpTesting.expectOne(url('/v1/auth/session'));

      const loggingOut = session.logout();
      await settle();
      httpTesting.expectOne(url('/v1/auth/session')).flush({
        session: snapshot(),
        user: javaUser(),
        csrfToken: ROTATED_CSRF,
      });
      await settle();
      const logout = httpTesting.expectOne(url('/v1/auth/logout'));
      expectCookieRequest(logout, 'POST');
      expect(logout.request.body).toEqual({ scope: 'current' });
      expect(logout.request.headers.get('X-CSRF-Token')).toBe(ROTATED_CSRF);
      logout.flush(null, { status: 204, statusText: 'No Content' });
      await loggingOut;

      expect(get.cancelled).toBe(true);
      await expect(late).resolves.toBe(false);
      expect(session.status()).toBe('closed');
      expect(session.user()).toBeNull();
      expect(await session.getAccessToken()).toBeNull();
      httpTesting.expectNone(url('/v1/auth/refresh'));
    });

    it('logout no revoca la sesión de otro login que sustituyó la cookie', async () => {
      await signIn();
      const session = TestBed.inject(AuthSessionService);
      const loggingOut = session.logout();
      await settle();

      httpTesting.expectOne(url('/v1/auth/session')).flush({
        session: { ...snapshot(), sessionId: 'sess-2' },
        user: javaUser(OTHER_USER_ID),
        csrfToken: ROTATED_CSRF,
      });

      await loggingOut;
      httpTesting.expectNone(url('/v1/auth/logout'));
      expect(session.status()).toBe('closed');
    });

    it('D-11: un 401 de negocio no reejecuta la petición ni reutiliza el JWT rechazado', async () => {
      await signIn();
      const failing = firstValueFrom(TestBed.inject(UserService).getMyProfile());
      await settle();
      httpTesting
        .expectOne(url('/v1/me/profile'))
        .flush(envelope('AUTH_REQUIRED'), { status: 401, statusText: 'x' });

      await expect(failing).rejects.toBeInstanceOf(HttpErrorResponse);
      await settle();
      // Recuperación de sesión (no repetición): GET /session → 401 → reautenticación.
      httpTesting
        .expectOne(url('/v1/auth/session'))
        .flush(envelope('REFRESH_INVALID'), { status: 401, statusText: 'x' });
      await settle();

      httpTesting.expectNone(url('/v1/me/profile'));
      expect(TestBed.inject(AuthSessionStore).accessToken(Date.now())).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('perfil propio /v1/me/profile', () => {
    beforeEach(() => configure());

    it('GET con el JWT interno, sin cookies, sin userId en la ruta, y mapeo del DTO Java', async () => {
      await signIn();
      const result = firstValueFrom(TestBed.inject(UserService).getMyProfile());
      await settle();

      const req = httpTesting.expectOne(url('/v1/me/profile'));
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBe(`Bearer ${INTERNAL_JWT}`);
      expect(req.request.headers.get('X-MTEC-Client')).toBe('web');
      expect(req.request.headers.has('Ocp-Apim-Subscription-Key')).toBe(false);
      expect(req.request.withCredentials).toBe(false);
      expect(req.request.urlWithParams).not.toMatch(/USR-001|usr_internal/);
      req.flush(profileV1());

      const user = await result;
      expect(user).toEqual({
        id: USER_ID,
        nombreUsuario: 'est.tec',
        nombre: 'Estudiante',
        apellidos: 'TEC',
        correo: 'est@estudiantec.cr',
        fotoPerfil: 'https://img/x.png',
        fechaRegistro: '2026-01-01T00:00:00Z',
        verificado: true,
        estado: 'activo',
      });
      expect(user).not.toHaveProperty('createdAt');
    });

    it('PUT envía exactamente los tres campos editables y mapea UpdateUserResponseV1', async () => {
      await signIn();
      const result = firstValueFrom(
        TestBed.inject(UserService).updateMyProfile({
          nombreUsuario: 'nuevo',
          nombre: 'Nuevo',
          apellidos: 'Apellido',
          ...({ id: 'USR-001' } as object),
        } as never),
      );
      await settle();

      const req = httpTesting.expectOne(url('/v1/me/profile'));
      expect(req.request.method).toBe('PUT');
      expect(req.request.headers.get('Authorization')).toBe(`Bearer ${INTERNAL_JWT}`);
      expect(req.request.body).toEqual({ nombreUsuario: 'nuevo', nombre: 'Nuevo', apellidos: 'Apellido' });
      req.flush({
        ...profileV1(),
        nombreUsuario: 'nuevo',
        createdAt: undefined,
        fechaActualizacion: '2026-11-08T00:00:00Z',
        message: 'Perfil actualizado',
      });

      await expect(result).resolves.toMatchObject({
        id: USER_ID,
        nombreUsuario: 'nuevo',
        fechaActualizacion: '2026-11-08T00:00:00Z',
        message: 'Perfil actualizado',
      });
    });

    it('sin sesión no se emite ninguna petición de perfil', async () => {
      const service = TestBed.inject(UserService);

      await expect(firstValueFrom(service.getMyProfile())).rejects.toBeInstanceOf(AuthRequiredError);
      await expect(
        firstValueFrom(service.updateMyProfile({ nombreUsuario: 'a', nombre: 'b', apellidos: 'c' })),
      ).rejects.toBeInstanceOf(AuthRequiredError);
      await settle();
      httpTesting.expectNone(() => true);
    });

    it('un 401 del PUT no repite el PUT', async () => {
      await signIn();
      const failing = firstValueFrom(
        TestBed.inject(UserService).updateMyProfile({ nombreUsuario: 'a', nombre: 'b', apellidos: 'c' }),
      );
      await settle();
      httpTesting
        .expectOne((r) => r.method === 'PUT' && r.url === url('/v1/me/profile'))
        .flush(envelope('AUTH_REQUIRED'), { status: 401, statusText: 'x' });
      await expect(failing).rejects.toBeInstanceOf(HttpErrorResponse);
      await settle();
      httpTesting.match(url('/v1/auth/session')).forEach((r) =>
        r.flush(envelope('REFRESH_INVALID'), { status: 401, statusText: 'x' }),
      );
      await settle();

      httpTesting.expectNone((r) => r.method === 'PUT');
    });

    it('un logout durante la respuesta pendiente descarta los datos del usuario anterior', async () => {
      await signIn();
      const result = firstValueFrom(TestBed.inject(UserService).getMyProfile());
      await settle();
      const pending = httpTesting.expectOne(url('/v1/me/profile'));

      void TestBed.inject(AuthSessionService).logout();
      await settle();
      httpTesting.expectOne(url('/v1/auth/session')).flush({
        session: snapshot(),
        user: javaUser(),
        csrfToken: SESSION_CSRF,
      });
      await settle();
      httpTesting.expectOne(url('/v1/auth/logout')).flush(null, { status: 204, statusText: '' });

      pending.flush(profileV1());
      await expect(result).rejects.toEqual(new AuthRequiredError('cancelled'));
    });

    it.each([
      [OTHER_USER_ID, 'sess-2'],
      [USER_ID, 'sess-2'],
    ])('no usa la cookie de %s / %s para editar el perfil de la sesión anterior', async (userId, sessionId) => {
      await signIn();
      TestBed.inject(AuthSessionStore).dropAccessToken(INTERNAL_JWT);
      const result = firstValueFrom(TestBed.inject(UserService).updateMyProfile({
        nombreUsuario: 'cuenta-a',
        nombre: 'Nombre de A',
        apellidos: '',
      })).catch((error: unknown) => error);
      await settle();
      httpTesting.expectOne(url('/v1/auth/session')).flush({
        session: { ...snapshot(), sessionId },
        user: javaUser(userId),
        csrfToken: ROTATED_CSRF,
      });
      await settle();

      httpTesting.expectNone(url('/v1/auth/refresh'));
      httpTesting.expectNone(url('/v1/me/profile'));
      await expect(result).resolves.toBeInstanceOf(AuthRequiredError);
      const session = TestBed.inject(AuthSessionService);
      expect(session.user()).toBeNull();
      await expect(session.restoreSession()).resolves.toBe(false);
      httpTesting.expectNone(url('/v1/auth/session'));
    });

    it('una respuesta de otro usuario se rechaza', async () => {
      await signIn();
      const result = firstValueFrom(TestBed.inject(UserService).getMyProfile());
      await settle();
      httpTesting.expectOne(url('/v1/me/profile')).flush(profileV1(OTHER_USER_ID));

      await expect(result).rejects.toBeInstanceOf(ProfileResponseError);
    });
  });

  describe('aislamiento del transporte con el adaptador HTTP real', () => {
    beforeEach(() => configure());

    it('modo restricted: solo GET/PUT /me/profile salen; el resto de la API se bloquea antes de enviar', async () => {
      expect(TestBed.inject(AUTH_V2_BUSINESS_TRANSPORT)).toBe('restricted');
      await signIn();
      const http = TestBed.inject(HttpClient);

      const blocked: [string, string][] = [
        ['POST', '/v1/me/profile'],
        ['DELETE', '/v1/me/profile'],
        ['GET', '/v1/usuarios/USR-001'],
        ['PUT', `/v1/usuarios/${USER_ID}`],
        ['GET', '/v1/publicaciones'],
        ['POST', '/v1/publicaciones'],
        ['GET', '/v1/chats'],
        ['GET', '/v1/me/auth-methods'],
        ['GET', '/v1/auth/session'],
        ['GET', '/publicaciones'],
        ['GET', '/v1/desconocida'],
      ];

      for (const [method, path] of blocked) {
        await expect(firstValueFrom(http.request(method, url(path), { body: {} }))).rejects.toBeInstanceOf(
          BusinessTransportBlockedError,
        );
      }
      httpTesting.expectNone(() => true);

      // Otro origen: no se bloquea y nunca lleva el JWT interno.
      http.get('https://cdn.example.test/logo.png').subscribe();
      await settle();
      const external = httpTesting.expectOne('https://cdn.example.test/logo.png');
      expect(external.request.headers.has('Authorization')).toBe(false);
      external.flush('');
    });
  });

  describe('selección de adaptador y configuración segura', () => {
    it('por defecto (flag apagado) no hay API HTTP autorizada y el transporte queda bloqueado', () => {
      configure({ authCoreV2: false });
      expect(TestBed.inject(AUTH_V2_HTTP_API_BASE)).toBeNull();
      expect(TestBed.inject(AUTH_V2_BUSINESS_TRANSPORT)).toBe('blocked');
    });

    it('authCoreV2 con mock: transporte bloqueado y ningún adaptador HTTP', () => {
      configure({ authCoreV2: true, authCoreV2Adapter: 'mock' });
      expect(TestBed.inject(AUTH_V2_BUSINESS_TRANSPORT)).toBe('blocked');
      expect(TestBed.inject(AuthApiPort)).not.toBeInstanceOf(HttpAuthApiAdapter);
    });

    it('http sin topología verificada falla cerrado (sin sesión real ni simulada)', () => {
      configure({ authCoreV2: true, authCoreV2Adapter: 'http' });
      expect(() => TestBed.inject(AuthApiPort)).toThrow();
      expect(TestBed.inject(AUTH_V2_BUSINESS_TRANSPORT)).toBe('blocked');
    });

    it('http con una API base insegura falla cerrado', () => {
      environment.apiBaseUrl = 'http://api.example.test';
      configure();
      expect(() => TestBed.inject(AuthApiPort)).toThrow();
      expect(TestBed.inject(AUTH_V2_BUSINESS_TRANSPORT)).toBe('blocked');
    });

    it.each([
      ['https://api.example.test', 'https://api.example.test'],
      ['https://api.example.test/v1/', 'https://api.example.test/v1'],
      ['https://api.example.test/users', 'https://api.example.test/users'],
      ['http://api.example.test', null],
      ['https://user:pw@api.example.test', null],
      ['https://api.example.test?x=1', null],
      ['https://api.example.test#f', null],
      ['/api', null],
      ['', null],
      ['javascript:alert(1)', null],
      ['ftp://api.example.test', null],
    ])('resolveHttpApiBase(%s) → %s', (value, expected) => {
      expect(resolveHttpApiBase(value, false)).toBe(expected);
    });

    it('http://localhost solo con loopback permitido (build de desarrollo)', () => {
      expect(resolveHttpApiBase('http://localhost:8080', true)).toBe('http://localhost:8080');
      expect(resolveHttpApiBase('http://localhost:8080', false)).toBeNull();
      expect(resolveHttpApiBase('http://evil.example', true)).toBeNull();
    });

    it('no duplica /v1 al construir las URL', () => {
      expect(versionedApiUrl('https://h', '/auth/session')).toBe('https://h/v1/auth/session');
      expect(versionedApiUrl('https://h/v1', '/auth/session')).toBe('https://h/v1/auth/session');
      expect(versionedApiUrl('https://h/v1/', '/me/profile')).toBe('https://h/v1/me/profile');
      expect(versionedApiUrl('https://h/users', '/me/profile')).toBe('https://h/users/v1/me/profile');
    });

    it('con la API base terminada en /v1 el adaptador usa /v1/auth/... una sola vez', async () => {
      environment.apiBaseUrl = `${API}/v1`;
      configure();
      const pending = TestBed.inject(AuthApiPort).getSession();
      httpTesting
        .expectOne(url('/v1/auth/session'))
        .flush({ session: snapshot(), user: javaUser(), csrfToken: SESSION_CSRF });
      await expect(pending).resolves.toMatchObject({ csrfToken: SESSION_CSRF });
    });
  });
});
