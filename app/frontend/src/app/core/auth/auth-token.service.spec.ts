import { TestBed } from '@angular/core/testing';
import { AuthTokenService } from './auth-token.service';

function createToken(expiresAt: number): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  return `${encode({ alg: 'none' })}.${encode({ exp: expiresAt })}.signature`;
}

describe('AuthTokenService', () => {
  let service: AuthTokenService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthTokenService);
  });

  it('returns a stored token while it is valid', () => {
    const token = createToken(Math.floor(Date.now() / 1000) + 3600);

    service.setToken(token);

    expect(service.getToken()).toBe(token);
  });

  it('removes an expired token', () => {
    service.setToken(createToken(Math.floor(Date.now() / 1000) - 60));

    expect(service.getToken()).toBeNull();
    expect(sessionStorage.getItem('google_token')).toBeNull();
  });

  it('rejects values that are not JWT tokens', () => {
    service.setToken('invalid-token');

    expect(service.getToken()).toBeNull();
  });
});
