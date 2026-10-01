import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { AuthTokenService } from '../auth/auth-token.service';
import { apiKeyInterceptor } from './api-key.interceptor';

function createValidToken(): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  return `${encode({ alg: 'none' })}.${encode({
    exp: Math.floor(Date.now() / 1000) + 3600
  })}.signature`;
}

describe('apiKeyInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let authToken: AuthTokenService;
  const router = { navigate: vi.fn().mockResolvedValue(true) };

  beforeEach(() => {
    sessionStorage.clear();
    router.navigate.mockClear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiKeyInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router }
      ]
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    authToken = TestBed.inject(AuthTokenService);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('adds the APIM key and Google bearer token to API requests', () => {
    const token = createValidToken();
    authToken.setToken(token);

    http.get(`${environment.apiBaseUrl}/publicaciones`).subscribe();

    const request = httpTesting.expectOne(
      `${environment.apiBaseUrl}/publicaciones`
    );
    expect(request.request.headers.get('Ocp-Apim-Subscription-Key'))
      .toBe(environment.subscriptionKey);
    expect(request.request.headers.get('Authorization'))
      .toBe(`Bearer ${token}`);
    request.flush({});
  });

  it('clears the token and redirects to login after an API 401', () => {
    authToken.setToken(createValidToken());

    http.get(`${environment.apiBaseUrl}/publicaciones`).subscribe({
      error: () => undefined
    });

    const request = httpTesting.expectOne(
      `${environment.apiBaseUrl}/publicaciones`
    );
    request.flush(
      { message: 'Unauthorized' },
      { status: 401, statusText: 'Unauthorized' }
    );

    expect(authToken.getToken()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
