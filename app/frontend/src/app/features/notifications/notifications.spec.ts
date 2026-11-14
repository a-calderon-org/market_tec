import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { apiKeyInterceptor } from '../../core/api/api-key.interceptor';
import { isNotificationsOperation, notificationsApiBase } from '../../core/api/notifications-api';
import { AuthApiPort } from '../../core/auth/v2/auth-api.port';
import { AuthSessionService } from '../../core/auth/v2/auth-session.service';
import { ResultHoldingLock, SignalHub } from '../../core/auth/v2/auth-v2.testing';
import { AUTH_V2_BUSINESS_TRANSPORT, BusinessTransportBlockedError } from '../../core/auth/v2/business-transport';
import { MockAuthApiAdapter, MockAuthBackend } from '../../core/auth/v2/mock-auth-api.adapter';
import { SessionLock } from '../../core/auth/v2/session-lock';
import { SessionSignalChannel } from '../../core/auth/v2/session-signal-channel';
import { FEATURE_FLAGS, FeatureFlags } from '../../core/feature-flags';
import { AppNotification } from './models/notification.model';
import { relativeTime } from './notification-bell/notification-bell';
import { NotificationService } from './services/notification.service';

const ORIGIN = globalThis.location.origin;
const USERS = `${ORIGIN}/api/users`;
const CATALOG_V2 = `${ORIGIN}/api/catalog-v2/v1`;
const NOTIFICATIONS = `${ORIGIN}/api/notifications/v1`;
const ID = '0124185f-275f-41da-89b4-8d3952b97d28';
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    notificationId: ID, eventId: ID, senderUserId: 'usr_sender', chatId: 'chat-1', messageId: 'msg-1',
    occurredAt: 1_793_836_800, correlationId: 'corr-1', createdAt: 1_793_836_801, isRead: false, ...overrides,
  };
}

describe('notificationsApiBase / isNotificationsOperation', () => {
  it('se deriva solo del proxy same-origin del ms-catalog propio', () => {
    expect(notificationsApiBase(CATALOG_V2)).toBe(NOTIFICATIONS);
    expect(notificationsApiBase(`${CATALOG_V2}/`)).toBe(NOTIFICATIONS);
    expect(notificationsApiBase(`${ORIGIN}/api/catalog/v1`)).toBeNull();
    expect(notificationsApiBase(null)).toBeNull();
    expect(notificationsApiBase('no es una url')).toBeNull();
  });

  it('acepta solo la lista (GET) y marcar como leída (PATCH)', () => {
    expect(isNotificationsOperation(`${NOTIFICATIONS}/notifications?pageSize=20`, 'GET', NOTIFICATIONS)).toBe(true);
    expect(isNotificationsOperation(`${NOTIFICATIONS}/notifications/${ID}/read`, 'patch', NOTIFICATIONS)).toBe(true);
    expect(isNotificationsOperation(`${NOTIFICATIONS}/notifications/stream`, 'GET', NOTIFICATIONS)).toBe(false);
    expect(isNotificationsOperation(`${NOTIFICATIONS}/notifications/x/read`, 'PATCH', NOTIFICATIONS)).toBe(false);
    expect(isNotificationsOperation(`${NOTIFICATIONS}/notifications`, 'DELETE', NOTIFICATIONS)).toBe(false);
    expect(isNotificationsOperation(`${CATALOG_V2}/notifications`, 'GET', NOTIFICATIONS)).toBe(false);
    expect(isNotificationsOperation(`${NOTIFICATIONS}/notifications`, 'GET', null)).toBe(false);
  });
});

describe('notificaciones de ms-notifications con el JWT interno', () => {
  type Env = { apiBaseUrl: string; catalogApiBaseUrl?: string };
  const env = environment as Env;
  const original = { ...env };
  let httpTesting: HttpTestingController;
  let session: AuthSessionService;

  function setup(flags: Partial<FeatureFlags> = { authCoreV2: true, catalogInternalJwt: true }): void {
    env.apiBaseUrl = USERS;
    env.catalogApiBaseUrl = CATALOG_V2;
    const hub = new SignalHub();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiKeyInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        { provide: FEATURE_FLAGS, useValue: flags },
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

  it('carga la lista y marca como leída con el JWT en X-MTEC-Authorization, sin otras credenciales', async () => {
    setup();
    await signIn();
    const service = TestBed.inject(NotificationService);
    expect(service.enabled).toBe(true);

    service.refresh();
    await settle();
    const list = httpTesting.expectOne((r) => r.method === 'GET' && r.url === `${NOTIFICATIONS}/notifications`);
    expect(list.request.params.get('pageSize')).toBe('20');
    expect(list.request.headers.get('X-MTEC-Authorization')).toMatch(/^Bearer mock-access-/);
    expect(list.request.headers.has('Authorization')).toBe(false);
    expect(list.request.headers.has('Ocp-Apim-Subscription-Key')).toBe(false);
    list.flush({ items: [notification(), notification({ notificationId: 'other', isRead: true })], nextCursor: null });

    expect(service.loaded()).toBe(true);
    expect(service.unreadCount()).toBe(1);

    service.markAsRead(service.items()[0]);
    expect(service.unreadCount()).toBe(0);
    await settle();
    const read = httpTesting.expectOne(`${NOTIFICATIONS}/notifications/${ID}/read`);
    expect(read.request.method).toBe('PATCH');
    expect(read.request.headers.get('X-MTEC-Authorization')).toMatch(/^Bearer mock-access-/);
    read.flush(notification({ isRead: true }));
    expect(service.unreadCount()).toBe(0);
  });

  it('revierte la marca de leída si ms-notifications la rechaza', async () => {
    setup();
    await signIn();
    const service = TestBed.inject(NotificationService);
    service.refresh();
    await settle();
    httpTesting.expectOne(() => true).flush({ items: [notification()], nextCursor: null });

    service.markAsRead(service.items()[0]);
    await settle();
    httpTesting.expectOne(`${NOTIFICATIONS}/notifications/${ID}/read`)
      .flush({}, { status: 404, statusText: 'Not Found' });
    expect(service.unreadCount()).toBe(1);
  });

  it('un 401 de notificaciones no cierra la sesión: solo marca el error del panel', async () => {
    setup();
    await signIn();
    const spy = vi.spyOn(session, 'handleBusinessUnauthorized');
    const service = TestBed.inject(NotificationService);
    service.refresh();
    await settle();
    httpTesting.expectOne(`${NOTIFICATIONS}/notifications?pageSize=20`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(spy).not.toHaveBeenCalled();
    expect(service.error()).toBe(true);
    expect(service.loaded()).toBe(false);
  });

  it('el stream SSE y otras operaciones del mismo origen siguen bloqueados', async () => {
    setup();
    await signIn();
    const http = TestBed.inject(HttpClient);
    const blocked: unknown[] = [];
    for (const call of [http.get(`${NOTIFICATIONS}/notifications/stream`),
      http.delete(`${NOTIFICATIONS}/notifications/${ID}/read`)]) {
      call.subscribe({ error: (error: unknown) => blocked.push(error) });
    }
    await settle();

    expect(blocked).toHaveLength(2);
    for (const error of blocked) expect(error).toBeInstanceOf(BusinessTransportBlockedError);
  });

  it('con el catálogo heredado (sin catalogInternalJwt) queda desactivado y no consulta nada', async () => {
    setup({ authCoreV2: true, catalogInternalJwt: false });
    const service = TestBed.inject(NotificationService);
    expect(service.enabled).toBe(false);
    service.refresh();
    await settle();
    httpTesting.expectNone(() => true);
  });
});

describe('relativeTime', () => {
  const now = 1_793_836_800_000;
  it('describe la antigüedad en español', () => {
    expect(relativeTime(now / 1000 - 10, now)).toBe('Hace un momento');
    expect(relativeTime(now / 1000 - 5 * 60, now)).toBe('Hace 5 min');
    expect(relativeTime(now / 1000 - 2 * 3600, now)).toBe('Hace 2 h');
    expect(relativeTime(now / 1000 - 86_400, now)).toBe('Ayer');
    expect(relativeTime(now / 1000 - 3 * 86_400, now)).toBe('Hace 3 días');
  });
});
