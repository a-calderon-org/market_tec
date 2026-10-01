import { TestBed } from '@angular/core/testing';
import { AuthTokenService } from '../../../core/auth/auth-token.service';
import { GoogleAuthService } from './google-auth.service';

function createValidToken(): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  return `${encode({ alg: 'none' })}.${encode({
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: 'google-user',
    email: 'student@estudiantec.cr',
    name: 'Student',
    picture: 'https://example.com/student.jpg'
  })}.signature`;
}

describe('GoogleAuthService', () => {
  let service: GoogleAuthService;
  let authToken: AuthTokenService;

  beforeEach(() => {
    sessionStorage.clear();

    TestBed.configureTestingModule({});

    service = TestBed.inject(GoogleAuthService);
    authToken = TestBed.inject(AuthTokenService);
  });

  it('stores the Google token and restores its identity', async () => {
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
});
