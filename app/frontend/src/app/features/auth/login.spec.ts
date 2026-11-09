import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Login } from './login';
import { LoginService } from './services/login.service';
import { GoogleAuthService } from './services/google-auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ThemeService } from '../../core/theme.service';
import { FEATURE_FLAGS } from '../../core/feature-flags';
import { AuthSessionService } from '../../core/auth/v2/auth-session.service';
import { AuthApiError } from '../../core/auth/v2/auth-contract';

describe('Login', () => {
  let fixture:
    ComponentFixture<Login>;

  let component:
    Login;

  let router:
    Router;

  const googleAuth = {
    renderButton: vi.fn().mockResolvedValue(undefined),
    signIn: vi.fn().mockResolvedValue(undefined)
  };

  beforeEach(async () => {
    localStorage.setItem('market-tec-theme', 'light');
    googleAuth.renderButton.mockReset().mockResolvedValue(undefined);
    googleAuth.signIn.mockReset().mockResolvedValue(undefined);
    await TestBed
      .configureTestingModule({
        imports: [
          Login
        ],

        providers: [
          provideRouter([]),
          LoginService,
          { provide: GoogleAuthService, useValue: googleAuth }
        ]
      })
      .compileComponents();

    router =
      TestBed.inject(
        Router
      );

    vi.spyOn(
      router,
      'navigate'
    ).mockResolvedValue(true);

    fixture =
      TestBed.createComponent(
        Login
      );

    component =
      fixture.componentInstance;

    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(
      component
    ).toBeTruthy();
  });

  it('should show the simplified MarkeTEC welcome', () => {
    const element: HTMLElement = fixture.nativeElement;

    expect(element.textContent).toContain('Bienvenido a MarketTEC');
    expect(element.textContent).not.toContain('Tec Digital');
  });

  it('should render the Google button for the active color theme', async () => {
    await fixture.whenStable();
    expect(googleAuth.renderButton.mock.lastCall?.[2]).toBe('outline');

    TestBed.inject(ThemeService).toggle();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(googleAuth.renderButton.mock.lastCall?.[2]).toBe('outline_dark');
  });

  it('navigates only after the backend validates Google', async () => {
    await component.signInWithGoogle('google-credential');
    expect(googleAuth.signIn).toHaveBeenCalledWith('google-credential');
    expect(router.navigate).toHaveBeenCalledWith(['/']);
    expect(component.submitting()).toBe(false);
  });

  it('shows backend errors without navigating', async () => {
    googleAuth.signIn.mockRejectedValueOnce(new HttpErrorResponse({
      status: 401, error: { message: 'Credencial inválida.' }
    }));
    await component.signInWithGoogle('invalid');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.errorMessage()).toBe('Credencial inválida.');
    expect(component.submitting()).toBe(false);
  });
  it('hides the institutional email form without the v2 session core', () => {
    expect(component.emailLoginAvailable).toBe(false);
    expect(fixture.nativeElement.querySelector('.login-form')).toBeNull();
    expect(fixture.nativeElement.querySelector('.google-access')).not.toBeNull();
  });

  it('accepts only exact institutional domains', () => {
    const correo = component.loginForm.controls.correo;
    for (const ok of ['usuario@estudiantec.cr', 'usuario@itcr.ac.cr', 'usuario@tec.ac.cr']) {
      correo.setValue(ok);
      expect(correo.valid).toBe(true);
    }
    for (const bad of ['usuario@gmail.com', 'usuario@tec.ac.cr.evil.com']) {
      correo.setValue(bad);
      expect(correo.hasError('institutionalEmail')).toBe(true);
    }
  });
});

describe('Login — Magic Link institucional (authCoreV2)', () => {
  let fixture: ComponentFixture<Login>;
  let component: Login;
  const session = { requestEmailLink: vi.fn() };
  const googleAuth = {
    renderButton: vi.fn().mockResolvedValue(undefined),
    signIn: vi.fn().mockResolvedValue(undefined)
  };

  beforeEach(async () => {
    session.requestEmailLink.mockReset().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        LoginService,
        { provide: FEATURE_FLAGS, useValue: { authCoreV2: true } },
        { provide: AuthSessionService, useValue: session },
        { provide: GoogleAuthService, useValue: googleAuth }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('offers «Continuar con correo institucional» before Google, then the email form', () => {
    const open = fixture.nativeElement.querySelector('.login-submit') as HTMLButtonElement;
    expect(open.textContent).toContain('Continuar con correo institucional');
    expect(open.compareDocumentPosition(fixture.nativeElement.querySelector('.google-access'))
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    open.click();
    fixture.detectChanges();

    const submit = fixture.nativeElement.querySelector('.login-form .login-submit') as HTMLButtonElement;
    expect(submit.textContent).toContain('Enviar enlace de acceso');
    expect(submit.disabled).toBe(true);
    component.loginForm.setValue({ correo: 'ana@estudiantec.cr' });
    fixture.detectChanges();
    expect(submit.disabled).toBe(false);
  });

  it('sends the normalized address and shows «Revisa tu correo institucional»', async () => {
    component.openEmailForm();
    component.loginForm.setValue({ correo: 'Ana@EstudianTEC.cr' });
    await component.submit();
    fixture.detectChanges();

    expect(session.requestEmailLink).toHaveBeenCalledWith('ana@estudiantec.cr');
    expect(text()).toContain('Revisa tu correo institucional');
    expect(fixture.nativeElement.querySelector('.login-form input')).toBeNull();

    component.requestAnotherLink();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.login-form input')).not.toBeNull();
  });

  it('never calls the backend for a non institutional address', async () => {
    component.loginForm.setValue({ correo: 'ana@gmail.com' });
    await component.submit();
    expect(session.requestEmailLink).not.toHaveBeenCalled();
  });

  it('reports a provider failure without claiming the link was sent', async () => {
    session.requestEmailLink.mockRejectedValueOnce(new AuthApiError(503, 'AUTH_TEMPORARILY_UNAVAILABLE'));
    component.openEmailForm();
    component.loginForm.setValue({ correo: 'ana@tec.ac.cr' });
    await component.submit();
    fixture.detectChanges();

    expect(component.linkSentTo()).toBeNull();
    expect(component.errorMessage()).toContain('No se pudo enviar el enlace');
    expect(component.sendingLink()).toBe(false);
  });

  it('keeps Google sign-in available as the alternative', async () => {
    await fixture.whenStable();
    expect(googleAuth.renderButton).toHaveBeenCalled();
    expect((fixture.nativeElement.querySelector('.google-button') as HTMLElement).hidden).toBe(false);
  });
});
