import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthApiError } from '../../core/auth/v2/auth-contract';
import { AuthSessionService } from '../../core/auth/v2/auth-session.service';
import { FEATURE_FLAGS } from '../../core/feature-flags';
import { PasswordCredentialsService } from '../../core/auth/v2/password-credentials.service';
import { EmailLinkCallback, parseEmailLinkFragment } from './email-link-callback';

const ATTEMPT = 'a'.repeat(32);
const TOKEN = 'b'.repeat(64);

describe('parseEmailLinkFragment', () => {
  it('accepts exactly attempt + token in hex', () => {
    expect(parseEmailLinkFragment(`attempt=${ATTEMPT}&token=${TOKEN}`)).toEqual({ attemptId: ATTEMPT, token: TOKEN });
    expect(parseEmailLinkFragment(`#attempt=${ATTEMPT}&token=${TOKEN}`)).toEqual({ attemptId: ATTEMPT, token: TOKEN });
  });

  it('rejects altered, missing or extra parameters', () => {
    for (const bad of [null, '', `attempt=${ATTEMPT}`, `attempt=${ATTEMPT}&token=${TOKEN.slice(1)}`,
      `attempt=${ATTEMPT.toUpperCase()}&token=${TOKEN}`, `attempt=${ATTEMPT}&token=${TOKEN}&x=1`]) {
      expect(parseEmailLinkFragment(bad)).toBeNull();
    }
  });
});

describe('EmailLinkCallback', () => {
  const session = { confirmEmailLink: vi.fn() };

  async function open(fragment: string, authCoreV2 = true) {
    session.confirmEmailLink.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'acceso/correo', component: EmailLinkCallback }, { path: '**', children: [] }]),
        { provide: FEATURE_FLAGS, useValue: { authCoreV2 } },
        { provide: AuthSessionService, useValue: session },
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(`/acceso/correo#${fragment}`);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(EmailLinkCallback);
    const location = TestBed.inject(Location);
    const urlAfterConstruction = location.path(true);
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    return { fixture, navigate, urlAfterConstruction };
  }

  it('removes the fragment before confirming, then opens the profile', async () => {
    const { navigate, urlAfterConstruction, fixture } = await open(`attempt=${ATTEMPT}&token=${TOKEN}`);
    expect(urlAfterConstruction).toBe('/acceso/correo');
    expect(session.confirmEmailLink).toHaveBeenCalledWith({ attemptId: ATTEMPT, token: TOKEN });
    expect(navigate).toHaveBeenCalledWith(['/'], { replaceUrl: true, state: { openProfile: true } });
    expect(fixture.componentInstance.failure()).toBeNull();
  });

  it('an altered link never reaches the backend', async () => {
    const { fixture } = await open(`attempt=${ATTEMPT}&token=zz`);
    expect(session.confirmEmailLink).not.toHaveBeenCalled();
    expect(fixture.componentInstance.failure()).toContain('no es válido');
  });

  it('another browser gets an explanation and can request a new link', async () => {
    const { fixture, navigate } = await open(`attempt=${ATTEMPT}&token=${TOKEN}`);
    // Rechazo local del núcleo: este navegador no tiene el intento (cookie + CSRF) que pidió el enlace.
    session.confirmEmailLink.mockRejectedValueOnce(new AuthApiError(403, 'EMAIL_LINK_OTHER_BROWSER'));
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    expect(fixture.componentInstance.failure()).toContain('mismo navegador');
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenLastCalledWith(['/login']);
  });

  it('expired and consumed links explain how to continue', async () => {
    const { fixture } = await open(`attempt=${ATTEMPT}&token=${TOKEN}`);
    for (const [status, code, text] of [[410, 'ATTEMPT_EXPIRED', 'expiró'], [409, 'ATTEMPT_CONSUMED', 'ya se utilizó'],
      [409, 'CONTINUITY_REQUIRED', 'Google']] as const) {
      session.confirmEmailLink.mockRejectedValueOnce(new AuthApiError(status, code));
      await fixture.componentInstance.ngOnInit();
      expect(fixture.componentInstance.failure()).toContain(text);
    }
  });
});

describe('EmailLinkCallback con contraseñas (passwordAuth)', () => {
  const session = { confirmEmailLink: vi.fn() };
  const passwords = { status: vi.fn() };

  async function open(path: string, data: object = {}) {
    session.confirmEmailLink.mockReset().mockResolvedValue(undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: path.split('#')[0].slice(1), component: EmailLinkCallback, data }, { path: '**', children: [] }]),
        { provide: FEATURE_FLAGS, useValue: { authCoreV2: true, authCoreV2Adapter: 'http', passwordAuth: true } },
        { provide: AuthSessionService, useValue: session },
        { provide: PasswordCredentialsService, useValue: passwords },
        // El componente se crea fuera del outlet: se declara la ruta que lo activaría.
        { provide: ActivatedRoute, useValue: { snapshot: { data, fragment: path.split('#')[1] ?? null } } },
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(path);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(EmailLinkCallback);
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    return { fixture, navigate };
  }

  const link = `attempt=${ATTEMPT}&token=${TOKEN}`;

  it('a confirmed link for an account without a password leads to the password setup', async () => {
    passwords.status.mockReset().mockResolvedValue({ configured: false, setupAvailable: true });
    const { navigate } = await open(`/acceso/correo#${link}`);
    expect(navigate).toHaveBeenCalledWith(['/contrasena'], { replaceUrl: true });
    expect(navigate).not.toHaveBeenCalledWith(['/'], expect.anything());
  });

  it('an account that already has a password signs in without being asked to set one', async () => {
    passwords.status.mockReset().mockResolvedValue({ configured: true, setupAvailable: false });
    const { navigate } = await open(`/acceso/correo#${link}`);
    expect(navigate).toHaveBeenCalledWith(['/'], { replaceUrl: true, state: { openProfile: true } });
  });

  it('a failed status query never blocks a session that was already created', async () => {
    passwords.status.mockReset().mockRejectedValue(new AuthApiError(503, 'AUTH_TEMPORARILY_UNAVAILABLE'));
    const { navigate } = await open(`/acceso/correo#${link}`);
    expect(navigate).toHaveBeenCalledWith(['/'], { replaceUrl: true, state: { openProfile: true } });
  });

  it('does not check the password state when the link failed', async () => {
    passwords.status.mockReset();
    session.confirmEmailLink.mockReset();
    const { fixture } = await open(`/acceso/correo#attempt=${ATTEMPT}&token=zz`);
    expect(passwords.status).not.toHaveBeenCalled();
    expect(fixture.componentInstance.failure()).toContain('no es válido');
  });

  it('the recovery page explains B02: a link never replaces an existing password, and creates no session', async () => {
    passwords.status.mockReset();
    const { fixture, navigate } = await open(`/acceso/recuperar#${link}`, { purpose: 'recovery' });
    passwords.status.mockClear(); // `open` ya procesó un enlace válido; ahora el canje falla por continuidad
    session.confirmEmailLink.mockRejectedValueOnce(new AuthApiError(409, 'CONTINUITY_REQUIRED'));
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    expect(fixture.componentInstance.recovery).toBe(true);
    expect(fixture.componentInstance.failure()).toContain('no puede reemplazar la contraseña');
    expect(fixture.componentInstance.failure()).not.toContain('Google');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Recuperar acceso');
    expect(passwords.status).not.toHaveBeenCalled();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenLastCalledWith(['/login']);
  });
});
