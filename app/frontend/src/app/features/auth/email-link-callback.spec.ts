import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthApiError } from '../../core/auth/v2/auth-contract';
import { AuthSessionService } from '../../core/auth/v2/auth-session.service';
import { FEATURE_FLAGS } from '../../core/feature-flags';
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
