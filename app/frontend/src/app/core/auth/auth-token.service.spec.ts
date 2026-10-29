import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthTokenService } from './auth-token.service';

function createToken(expiresAt: number, subject = 'google-user'): string {
  return createTokenWithClaims({
    exp: expiresAt,
    sub: subject,
    email: `${subject}@estudiantec.cr`,
  });
}

function createTokenWithClaims(claims: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${encode({ alg: 'none' })}.${encode(claims)}.signature`;
}

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  const now = new Date('2026-10-29T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    sessionStorage.clear();
    router.navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: router }],
    });
  });

  afterEach(() => {
    service?.clearToken();
    vi.useRealTimers();
  });

  function injectService(): AuthTokenService {
    service = TestBed.inject(AuthTokenService);
    return service;
  }

  it('returns a stored token while it is valid', () => {
    const token = createToken(Math.floor(Date.now() / 1000) + 3600);
    injectService().setToken(token);

    expect(service.getToken()).toBe(token);
    expect(service.claims()?.sub).toBe('google-user');
  });

  it('removes a token that is already expired when the application loads', () => {
    sessionStorage.setItem('google_token', createToken(Math.floor(Date.now() / 1000) - 60));

    injectService();

    expect(service.getToken()).toBeNull();
    expect(sessionStorage.getItem('google_token')).toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('expires an active token during inactivity and redirects to login', () => {
    const token = createToken(Math.floor(Date.now() / 1000) + 60);
    injectService().setToken(token);

    vi.advanceTimersByTime(60_000);

    expect(service.getToken()).toBeNull();
    expect(service.claims()).toBeNull();
    expect(sessionStorage.getItem('google_token')).toBeNull();
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('cancels expiration when the user logs out manually', () => {
    injectService().setToken(createToken(Math.floor(Date.now() / 1000) + 60));

    expect(service.clearToken()).toBe(true);
    vi.advanceTimersByTime(60_000);

    expect(service.getToken()).toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('replaces the expiration timer when a newer token is stored', () => {
    const firstToken = createToken(Math.floor(Date.now() / 1000) + 60, 'first-user');
    const secondToken = createToken(Math.floor(Date.now() / 1000) + 180, 'second-user');
    injectService().setToken(firstToken);

    vi.advanceTimersByTime(30_000);
    service.setToken(secondToken);
    vi.advanceTimersByTime(30_000);

    expect(service.getToken()).toBe(secondToken);
    expect(service.claims()?.sub).toBe('second-user');
    expect(router.navigate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(120_000);
    expect(service.getToken()).toBeNull();
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('does not clear a newer token when invalidating an older token', () => {
    const oldToken = createToken(Math.floor(Date.now() / 1000) + 60, 'old-user');
    const newToken = createToken(Math.floor(Date.now() / 1000) + 120, 'new-user');
    injectService().setToken(oldToken);
    service.setToken(newToken);

    expect(service.invalidateToken(oldToken)).toBe(false);
    expect(service.getToken()).toBe(newToken);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('rejects values that are not valid expiring JWT-shaped tokens', () => {
    injectService().setToken('invalid-token');

    expect(service.getToken()).toBeNull();
    expect(sessionStorage.getItem('google_token')).toBeNull();
  });

  it.each([
    ['missing', createTokenWithClaims({ sub: 'google-user' })],
    ['not numeric', createTokenWithClaims({ exp: 'later' })],
  ])('rejects a token whose exp claim is %s', (_case, token) => {
    injectService().setToken(token);

    expect(service.getToken()).toBeNull();
    expect(sessionStorage.getItem('google_token')).toBeNull();
  });
});
