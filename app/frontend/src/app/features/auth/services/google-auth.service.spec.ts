import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthTokenService } from '../../../core/auth/auth-token.service';
import { GoogleAuthService } from './google-auth.service';

function createValidToken(
  expiresAt = Math.floor(Date.now() / 1000) + 3600,
  subject = 'google-user',
): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${encode({ alg: 'none' })}.${encode({
    exp: expiresAt,
    sub: subject,
    email: 'student@estudiantec.cr',
    name: 'Student',
    picture: 'https://example.com/student.jpg',
  })}.signature`;
}

describe('GoogleAuthService', () => {
  let service: GoogleAuthService;
  let authToken: AuthTokenService;
  const router = { navigate: vi.fn().mockResolvedValue(true) };

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    router.navigate.mockClear();

    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: router }],
    });

    service = TestBed.inject(GoogleAuthService);
    authToken = TestBed.inject(AuthTokenService);
  });

  afterEach(() => {
    authToken.clearToken();
    vi.useRealTimers();
    delete window.google;
  });

  it('stores the Google token and exposes its identity', async () => {
    const token = createValidToken();

    expect(authToken.getToken()).toBeNull();
    await service.signIn(token);

    expect(authToken.getToken()).toBe(token);
    expect(service.user()?.id).toBe('google-user');
    expect(service.user()?.picture).toBe('https://example.com/student.jpg');

    service.user.set(null);
    expect(await service.restoreSession()).toBe(true);
    expect(service.user()?.email).toBe('student@estudiantec.cr');
  });

  it('does not restore a session without a valid Google token', async () => {
    expect(await service.restoreSession()).toBe(false);
    expect(service.user()).toBeNull();
  });

  it('updates the observable user when the token expires', async () => {
    const expiration = Math.floor(Date.now() / 1000) + 60;
    await service.signIn(createValidToken(expiration));

    vi.advanceTimersByTime(60_000);

    expect(authToken.getToken()).toBeNull();
    expect(service.user()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('clears the token and user on manual logout without scheduling a redirect', async () => {
    const disableAutoSelect = vi.fn();
    window.google = {
      accounts: {
        id: {
          initialize: vi.fn(),
          renderButton: vi.fn(),
          disableAutoSelect,
        },
      },
    };
    await service.signIn(createValidToken());

    await service.logout();

    expect(authToken.getToken()).toBeNull();
    expect(service.user()).toBeNull();
    expect(disableAutoSelect).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('supports signing in again after logout', async () => {
    await service.signIn(createValidToken(undefined, 'first-user'));
    await service.logout();

    const secondToken = createValidToken(undefined, 'second-user');
    await service.signIn(secondToken);

    expect(authToken.getToken()).toBe(secondToken);
    expect(service.user()?.id).toBe('second-user');
  });
});
