import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { GoogleAuthService } from '../../features/auth/services/google-auth.service';
import { AuthTokenService } from '../auth/auth-token.service';
import { apiKeyInterceptor } from './api-key.interceptor';

const API_BASE_URL = 'https://api.example.test/v1';

function createToken(
  expiresAt = Math.floor(Date.now() / 1000) + 3600,
  subject = 'google-user',
): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${encode({ alg: 'none' })}.${encode({
    exp: expiresAt,
    sub: subject,
    email: `${subject}@estudiantec.cr`,
    name: 'Student',
  })}.signature`;
}

describe('apiKeyInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let authToken: AuthTokenService;
  let googleAuth: GoogleAuthService;
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  const originalApiBaseUrl = environment.apiBaseUrl;
  const originalSubscriptionKey = environment.subscriptionKey;

  beforeEach(() => {
    sessionStorage.clear();
    router.navigate.mockClear();
    environment.apiBaseUrl = API_BASE_URL;
    environment.subscriptionKey = 'test-subscription-key';

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiKeyInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    authToken = TestBed.inject(AuthTokenService);
    googleAuth = TestBed.inject(GoogleAuthService);
  });

  afterEach(() => {
    authToken.clearToken();
    httpTesting.verify();
    environment.apiBaseUrl = originalApiBaseUrl;
    environment.subscriptionKey = originalSubscriptionKey;
  });

  function expectNoCredentials(url: string): void {
    http.get(url).subscribe();
    const request = httpTesting.expectOne(url);

    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.has('Ocp-Apim-Subscription-Key')).toBe(false);
    request.flush({});
  }

  it('adds the APIM key and Google bearer token to the exact API base path', () => {
    const token = createToken();
    authToken.setToken(token);

    http.get(API_BASE_URL).subscribe();

    const request = httpTesting.expectOne(API_BASE_URL);
    expect(request.request.headers.get('Ocp-Apim-Subscription-Key')).toBe('test-subscription-key');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    request.flush({});
  });

  it('adds credentials to a nested path below the authorized API base', () => {
    const token = createToken();
    authToken.setToken(token);
    const url = `${API_BASE_URL}/publicaciones/123`;

    http.get(url).subscribe();

    const request = httpTesting.expectOne(url);
    expect(request.request.headers.get('Ocp-Apim-Subscription-Key')).toBe('test-subscription-key');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    request.flush({});
  });

  it.each([
    ['an external URL', 'https://external.example.test/data'],
    ['a similar hostname prefix', 'https://api.example.test.evil.test/v1/users'],
    ['an unauthorized subdomain', 'https://sub.api.example.test/v1/users'],
    ['a different protocol', 'http://api.example.test/v1/users'],
    ['a different port', 'https://api.example.test:8443/v1/users'],
    ['a deceptive path prefix', 'https://api.example.test/v1-attacker'],
  ])('does not add credentials to %s', (_case, url) => {
    authToken.setToken(createToken());
    expectNoCredentials(url);
  });

  it.each(['', '   ', 'http://[invalid'])(
    'fails closed when the API base is empty or malformed: %j',
    (baseUrl) => {
      environment.apiBaseUrl = baseUrl;
      authToken.setToken(createToken());
      expectNoCredentials('https://api.example.test/v1/users');
    },
  );

  it('fails closed when the API base is null', () => {
    (environment as { apiBaseUrl: unknown }).apiBaseUrl = null;
    authToken.setToken(createToken());

    expectNoCredentials('https://api.example.test/v1/users');
  });

  it('supports relative API bases and requests on the application origin', () => {
    environment.apiBaseUrl = '/api/v1/';
    const token = createToken();
    authToken.setToken(token);

    http.get('/api/v1/publicaciones').subscribe();

    const request = httpTesting.expectOne('/api/v1/publicaciones');
    expect(request.request.headers.get('Ocp-Apim-Subscription-Key')).toBe('test-subscription-key');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    request.flush({});
  });

  it('does not add a bearer token when no token exists', () => {
    const url = `${API_BASE_URL}/publicaciones`;
    http.get(url).subscribe();

    const request = httpTesting.expectOne(url);
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.get('Ocp-Apim-Subscription-Key')).toBe('test-subscription-key');
    request.flush({});
  });

  it('does not add an expired bearer token', () => {
    authToken.setToken(createToken(Math.floor(Date.now() / 1000) - 60));
    const url = `${API_BASE_URL}/publicaciones`;
    http.get(url).subscribe();

    const request = httpTesting.expectOne(url);
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.get('Ocp-Apim-Subscription-Key')).toBe('test-subscription-key');
    request.flush({});
  });

  it('invalidates token and reactive user state after an authenticated API 401', async () => {
    await googleAuth.signIn(createToken());
    expect(googleAuth.user()).not.toBeNull();
    const url = `${API_BASE_URL}/publicaciones`;

    http.get(url).subscribe({ error: () => undefined });
    httpTesting
      .expectOne(url)
      .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(authToken.getToken()).toBeNull();
    expect(googleAuth.user()).toBeNull();
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('handles concurrent 401 responses only once', () => {
    authToken.setToken(createToken());
    const firstUrl = `${API_BASE_URL}/publicaciones`;
    const secondUrl = `${API_BASE_URL}/chats`;

    http.get(firstUrl).subscribe({ error: () => undefined });
    http.get(secondUrl).subscribe({ error: () => undefined });
    httpTesting.expectOne(firstUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
    httpTesting.expectOne(secondUrl).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate a newer session after a late 401', () => {
    const oldToken = createToken(undefined, 'old-user');
    const newToken = createToken(undefined, 'new-user');
    authToken.setToken(oldToken);
    const url = `${API_BASE_URL}/publicaciones`;

    http.get(url).subscribe({ error: () => undefined });
    const pendingRequest = httpTesting.expectOne(url);
    authToken.setToken(newToken);
    pendingRequest.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(authToken.getToken()).toBe(newToken);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not invalidate the session after a 403', () => {
    const token = createToken();
    authToken.setToken(token);
    const url = `${API_BASE_URL}/publicaciones`;

    http.get(url).subscribe({ error: () => undefined });
    httpTesting
      .expectOne(url)
      .flush({ message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });

    expect(authToken.getToken()).toBe(token);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
