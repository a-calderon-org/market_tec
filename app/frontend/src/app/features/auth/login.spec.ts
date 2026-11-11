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
    restyleButton: vi.fn().mockReturnValue(true),
    signIn: vi.fn().mockResolvedValue(undefined)
  };

  beforeEach(async () => {
    localStorage.setItem('market-tec-theme', 'light');
    googleAuth.renderButton.mockReset().mockResolvedValue(undefined);
    googleAuth.restyleButton.mockReset().mockReturnValue(true);
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

  it('should render the official Google button for the active color theme', async () => {
    await fixture.whenStable();
    expect(googleAuth.renderButton.mock.lastCall?.[2]).toBe('outline');
  });

  it('switches only the theme of the already rendered Google button (official filled_black), without another attempt', async () => {
    await fixture.whenStable();
    const renders = googleAuth.renderButton.mock.calls.length;

    TestBed.inject(ThemeService).toggle();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(googleAuth.restyleButton).toHaveBeenLastCalledWith(expect.any(HTMLElement), 'filled_black');
    expect(googleAuth.renderButton.mock.calls.length).toBe(renders);
    TestBed.inject(ThemeService).toggle();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(googleAuth.restyleButton).toHaveBeenLastCalledWith(expect.any(HTMLElement), 'outline');
  });

  it('renders the whole button again when there is no restylable one', async () => {
    await fixture.whenStable();
    googleAuth.restyleButton.mockReturnValue(false);
    TestBed.inject(ThemeService).toggle();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(googleAuth.renderButton.mock.lastCall?.[2]).toBe('filled_black');
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
  let signedInElsewhere: (() => void) | null = null;
  const session = {
    requestEmailLink: vi.fn(),
    restoreSession: vi.fn(),
    onSignedInElsewhere: (listener: () => void) => {
      signedInElsewhere = listener;
      return () => { signedInElsewhere = null; };
    },
  };
  const googleAuth = {
    renderButton: vi.fn().mockResolvedValue(undefined),
    restyleButton: vi.fn().mockReturnValue(true),
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

    expect(session.requestEmailLink).toHaveBeenCalledWith('Ana@estudiantec.cr');
    expect(text()).toContain('Revisa tu correo institucional');
    expect(fixture.nativeElement.querySelector('.login-form input')).toBeNull();

    component.requestAnotherLink();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.login-form input')).not.toBeNull();
  });

  it('stops waiting when the link signed in from another tab and can continue here', async () => {
    component.openEmailForm();
    component.loginForm.setValue({ correo: 'ana@estudiantec.cr' });
    await component.submit();
    signedInElsewhere?.();
    fixture.detectChanges();

    expect(text()).toContain('Ya ingresaste en la otra pestaña');
    expect(text()).not.toContain('Solicitar otro enlace');

    session.restoreSession.mockResolvedValueOnce(true);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await component.continueHere();
    expect(session.restoreSession).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalled();
  });

  it('a sign-in elsewhere does not change a page that is not waiting for a link', () => {
    signedInElsewhere?.();
    fixture.detectChanges();
    expect(component.signedInElsewhere()).toBe(false);
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

describe('Login — Google only (authCoreV2, emailLinkAuth: false)', () => {
  let fixture: ComponentFixture<Login>;
  const googleAuth = {
    renderButton: vi.fn().mockResolvedValue(undefined),
    restyleButton: vi.fn().mockReturnValue(true),
    signIn: vi.fn().mockResolvedValue(undefined)
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        LoginService,
        { provide: FEATURE_FLAGS, useValue: { authCoreV2: true, authCoreV2Adapter: 'http', emailLinkAuth: false } },
        { provide: AuthSessionService, useValue: { requestEmailLink: vi.fn(), onSignedInElsewhere: () => () => undefined } },
        { provide: GoogleAuthService, useValue: googleAuth }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
  });

  it('offers no institutional email or password form in either tab, only Google', () => {
    for (const mode of ['signin', 'signup'] as const) {
      fixture.componentInstance.selectMode(mode);
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).not.toContain('Continuar con correo institucional');
      expect(fixture.nativeElement.querySelector('input[type="email"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('input[type="password"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('.google-button')).not.toBeNull();
    }
    expect(fixture.componentInstance.emailLoginAvailable).toBe(false);
  });
});

describe('Login — Iniciar sesión / Crear cuenta con contraseña (authCoreV2 + passwordAuth)', () => {
  let fixture: ComponentFixture<Login>;
  let component: Login;
  let router: Router;
  const session = {
    onSignedInElsewhere: vi.fn(() => () => undefined),
    requestEmailLink: vi.fn(),
    signInWithPassword: vi.fn(),
    requestPasswordRecovery: vi.fn()
  };
  const googleAuth = {
    renderButton: vi.fn().mockResolvedValue(undefined),
    restyleButton: vi.fn().mockReturnValue(true),
    signIn: vi.fn().mockResolvedValue(undefined)
  };

  async function create(flags: object): Promise<void> {
    TestBed.resetTestingModule();
    for (const mock of Object.values(session)) mock.mockReset().mockResolvedValue(undefined);
    session.onSignedInElsewhere.mockReset().mockReturnValue(() => undefined);
    googleAuth.renderButton.mockReset().mockResolvedValue(undefined);
    googleAuth.restyleButton.mockReset().mockReturnValue(true);
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        LoginService,
        { provide: FEATURE_FLAGS, useValue: flags },
        { provide: AuthSessionService, useValue: session },
        { provide: GoogleAuthService, useValue: googleAuth }
      ]
    }).compileComponents();
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement;
  const text = (): string => el().textContent ?? '';
  const click = (selector: string): void => {
    (el().querySelector(selector) as HTMLElement).click();
    fixture.detectChanges();
  };
  const tabs = (): HTMLButtonElement[] => Array.from(el().querySelectorAll('[role="tab"]'));

  beforeEach(() => create({ authCoreV2: true, authCoreV2Adapter: 'http', passwordAuth: true }));

  it('shows two clearly differentiated operations, «Iniciar sesión» selected first', () => {
    expect(tabs().map((tab) => tab.textContent?.trim())).toEqual(['Iniciar sesión', 'Crear cuenta']);
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs()[1].getAttribute('aria-selected')).toBe('false');
    expect(el().querySelector('[role="tablist"]')).not.toBeNull();
    expect(el().querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe('auth-tab-signin');
  });

  it('sign in: institutional email, password, «Iniciar sesión», «Olvidé mi contraseña» and Google', () => {
    expect(el().querySelector('input[type="email"]')).not.toBeNull();
    expect(el().querySelector('input[type="password"]')).not.toBeNull();
    expect(el().querySelector('form .login-submit')?.textContent).toContain('Iniciar sesión');
    expect(text()).toContain('Olvidé mi contraseña');
    expect(el().querySelector('.google-access')).not.toBeNull();
    // Sin Magic Link en el inicio de sesión normal.
    expect(text()).not.toContain('Enviar enlace de acceso');
    expect(text()).not.toContain('Continuar con correo institucional');
    expect(googleAuth.renderButton.mock.lastCall?.[3]).toBe('login');
  });

  it('validates the institutional email and the required password; the submit stays disabled', () => {
    const submit = el().querySelector('form .login-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    component.passwordForm.setValue({ correo: 'ana@gmail.com', contrasena: 'x' });
    component.passwordForm.markAllAsTouched();
    fixture.detectChanges();
    expect(submit.disabled).toBe(true);
    expect(text()).toContain('Utiliza tu cuenta');
    component.passwordForm.setValue({ correo: 'ana@estudiantec.cr', contrasena: '' });
    component.passwordForm.markAllAsTouched();
    fixture.detectChanges();
    expect(text()).toContain('Ingresa tu contraseña');
    component.passwordForm.setValue({ correo: 'ana@estudiantec.cr', contrasena: 'x' });
    fixture.detectChanges();
    expect(submit.disabled).toBe(false);
  });

  it('signs in with the normalized email and password, then opens the app', async () => {
    component.passwordForm.setValue({ correo: 'Ana@EstudianTEC.cr', contrasena: 'correct horse battery' });
    await component.submitPassword();
    expect(session.signInWithPassword).toHaveBeenCalledWith('Ana@estudiantec.cr', 'correct horse battery');
    expect(router.navigate).toHaveBeenCalledWith(['/']);
    expect(component.signingIn()).toBe(false);
    expect(component.passwordForm.controls.contrasena.value).toBe('');
    expect(session.requestEmailLink).not.toHaveBeenCalled();
  });

  it('never calls the backend for an invalid form, and shows a uniform message for bad credentials', async () => {
    component.passwordForm.setValue({ correo: 'ana@gmail.com', contrasena: 'x' });
    await component.submitPassword();
    expect(session.signInWithPassword).not.toHaveBeenCalled();

    component.passwordForm.setValue({ correo: 'ana@tec.ac.cr', contrasena: 'wrong password' });
    session.signInWithPassword.mockRejectedValueOnce(new AuthApiError(401, 'INVALID_CREDENTIALS'));
    await component.submitPassword();
    fixture.detectChanges();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.errorMessage()).toBe('Correo o contraseña incorrectos.');
    expect(component.passwordForm.controls.contrasena.value).toBe('');
    expect(text()).toContain('Correo o contraseña incorrectos.');
  });

  it('explains throttling and unavailability without revealing anything about the account', async () => {
    component.passwordForm.setValue({ correo: 'ana@tec.ac.cr', contrasena: 'x' });
    session.signInWithPassword.mockRejectedValueOnce(new AuthApiError(429, 'RATE_LIMITED'));
    await component.submitPassword();
    expect(component.errorMessage()).toContain('Demasiados intentos');
    component.passwordForm.setValue({ correo: 'ana@tec.ac.cr', contrasena: 'x' });
    session.signInWithPassword.mockRejectedValueOnce(new AuthApiError(503, 'AUTH_TEMPORARILY_UNAVAILABLE'));
    await component.submitPassword();
    expect(component.errorMessage()).toContain('no está disponible');
    component.passwordForm.setValue({ correo: 'ana@tec.ac.cr', contrasena: 'x' });
    session.signInWithPassword.mockRejectedValueOnce(new AuthApiError(0, 'NETWORK'));
    await component.submitPassword();
    expect(component.errorMessage()).toContain('No se pudo conectar');
    expect(component.signingIn()).toBe(false);
  });

  it('toggles password visibility accessibly', () => {
    const input = el().querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
    expect(input.type).toBe('password');
    click('.password-toggle');
    expect(input.type).toBe('text');
    expect((el().querySelector('.password-toggle') as HTMLElement).getAttribute('aria-pressed')).toBe('true');
  });

  it('«Olvidé mi contraseña» requests a recovery link and gives a non-revealing confirmation', async () => {
    component.passwordForm.controls.correo.setValue('ana@estudiantec.cr');
    click('.forgot-password');
    expect(component.signInView()).toBe('recovery');
    expect(component.recoveryForm.controls.correo.value).toBe('ana@estudiantec.cr');
    await component.submitRecovery();
    fixture.detectChanges();

    expect(session.requestPasswordRecovery).toHaveBeenCalledWith('ana@estudiantec.cr');
    expect(text()).toContain('Revisa tu correo institucional');
    expect(text()).toContain('tiene una cuenta');
    expect(text()).toContain('no reemplaza una contraseña ya');
    click('.institutional-button');
    expect(component.signInView()).toBe('password');
  });

  it('recovery never calls the backend for a non institutional address and reports failures honestly', async () => {
    component.openRecovery();
    component.recoveryForm.setValue({ correo: 'ana@gmail.com' });
    await component.submitRecovery();
    expect(session.requestPasswordRecovery).not.toHaveBeenCalled();

    component.recoveryForm.setValue({ correo: 'ana@tec.ac.cr' });
    session.requestPasswordRecovery.mockRejectedValueOnce(new AuthApiError(503, 'AUTH_TEMPORARILY_UNAVAILABLE'));
    await component.submitRecovery();
    expect(component.recoverySentTo()).toBeNull();
    expect(component.errorMessage()).toContain('No se pudo enviar el enlace');
    expect(component.recovering()).toBe(false);
  });

  it('sign up: email verification with a centered, responsive «Continuar con correo institucional» button', async () => {
    click('#auth-tab-signup');
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(el().querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe('auth-tab-signup');
    expect(el().querySelector('input[type="password"]')).toBeNull();
    const open = el().querySelector('.login-submit') as HTMLButtonElement;
    expect(open.textContent).toContain('Continuar con correo institucional');
    expect(open.classList.contains('login-submit--centered')).toBe(true);

    open.click();
    fixture.detectChanges();
    const submit = el().querySelector('.login-form .login-submit') as HTMLButtonElement;
    expect(submit.textContent).toContain('Enviar enlace de verificación');
    expect(submit.classList.contains('login-submit--centered')).toBe(true);
    component.loginForm.setValue({ correo: 'Nueva@EstudianTEC.cr' });
    await component.submit();
    fixture.detectChanges();

    expect(session.requestEmailLink).toHaveBeenCalledWith('Nueva@estudiantec.cr');
    expect(text()).toContain('enlace de verificación');
    expect(text()).toContain('podrás crear tu contraseña');
  });

  it('each operation uses its own Google purpose and attempt, and switching resets the forms', async () => {
    expect(component.googlePurpose()).toBe('login');
    component.passwordForm.setValue({ correo: 'ana@tec.ac.cr', contrasena: 'secret value' });
    click('#auth-tab-signup');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.googlePurpose()).toBe('register');
    expect(googleAuth.renderButton.mock.lastCall?.[3]).toBe('register');
    expect(text()).toContain('Estás creando una cuenta nueva');

    click('#auth-tab-signin');
    await fixture.whenStable();
    expect(component.googlePurpose()).toBe('login');
    expect(googleAuth.renderButton.mock.lastCall?.[3]).toBe('login');
    expect(component.passwordForm.controls.contrasena.value).toBe('');
  });

  it('arrow keys move between the tabs (WAI-ARIA)', () => {
    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(component.mode()).toBe('signup');
    tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(component.mode()).toBe('signin');
  });

  it('does not switch operation while a request is in flight', async () => {
    let finish!: () => void;
    session.signInWithPassword.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    component.passwordForm.setValue({ correo: 'ana@tec.ac.cr', contrasena: 'x' });
    const pending = component.submitPassword();
    component.selectMode('signup');
    expect(component.mode()).toBe('signin');
    finish();
    await pending;
  });

  it('keeps the Google button container visible in both operations', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    expect((el().querySelector('.google-button') as HTMLElement).hidden).toBe(false);
    click('#auth-tab-signup');
    await fixture.whenStable();
    fixture.detectChanges();
    expect((el().querySelector('.google-button') as HTMLElement).hidden).toBe(false);
  });
});

describe('Login — sin contraseñas (flag apagado) conserva Google y el enlace por correo', () => {
  it('shows no password form, but keeps the tabs, the email link and Google', async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        LoginService,
        { provide: FEATURE_FLAGS, useValue: { authCoreV2: true, authCoreV2Adapter: 'http' } },
        { provide: AuthSessionService, useValue: { requestEmailLink: vi.fn(), onSignedInElsewhere: () => () => undefined } },
        { provide: GoogleAuthService, useValue: { renderButton: vi.fn().mockResolvedValue(undefined), restyleButton: vi.fn(), signIn: vi.fn() } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(fixture.componentInstance.passwordAuthAvailable).toBe(false);
    expect(root.querySelector('input[type="password"]')).toBeNull();
    expect(root.textContent).not.toContain('Olvidé mi contraseña');
    expect(root.textContent).toContain('Continuar con correo institucional');
    expect(root.querySelector('.google-access')).not.toBeNull();
    expect(root.querySelectorAll('[role="tab"]').length).toBe(2);
  });

  it('with the mock adapter the password form is never offered, even if the flag is on', async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        LoginService,
        { provide: FEATURE_FLAGS, useValue: { authCoreV2: true, authCoreV2Adapter: 'mock', passwordAuth: true } },
        { provide: AuthSessionService, useValue: { requestEmailLink: vi.fn(), onSignedInElsewhere: () => () => undefined } },
        { provide: GoogleAuthService, useValue: { renderButton: vi.fn().mockResolvedValue(undefined), restyleButton: vi.fn(), signIn: vi.fn() } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    expect(fixture.componentInstance.passwordAuthAvailable).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('input[type="password"]')).toBeNull();
  });
});
