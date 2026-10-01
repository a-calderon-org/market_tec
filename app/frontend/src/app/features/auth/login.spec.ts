import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Login } from './login';
import { LoginService } from './services/login.service';
import { GoogleAuthService } from './services/google-auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ThemeService } from '../../core/theme.service';

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

  it('should place institutional credentials before Google access', () => {
    const element: HTMLElement = fixture.nativeElement;
    const form = element.querySelector('.login-form');
    const googleAccess = element.querySelector('.google-access');

    expect(form).not.toBeNull();
    expect(googleAccess).not.toBeNull();
    expect(
      form!.compareDocumentPosition(googleAccess!) &
      Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
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
  it('should initialize with an empty form', () => {
    expect(
      component.loginForm
        .getRawValue()
    ).toEqual({
      correo: '',
      password: '',
      rememberSession: false
    });
  });

  it('should enable login only after entering valid credentials', () => {
    const button = fixture.nativeElement.querySelector('.login-submit') as HTMLButtonElement;

    expect(button.textContent).toContain('Ingresar');
    expect(button.disabled).toBe(true);

    component.loginForm.setValue({
      correo: 'usuario@estudiantec.cr',
      password: 'password123',
      rememberSession: false
    });
    fixture.detectChanges();

    expect(button.disabled).toBe(false);
  });

  it('should keep Google access available when institutional credentials are empty', async () => {
    await fixture.whenStable();

    const institutionalButton = fixture.nativeElement.querySelector('.login-submit') as HTMLButtonElement;
    const googleButton = fixture.nativeElement.querySelector('.google-button') as HTMLElement;

    expect(institutionalButton.disabled).toBe(true);
    expect(googleButton.hidden).toBe(false);
    expect(googleAuth.renderButton).toHaveBeenCalled();
  });

  it('should start with password hidden', () => {
    expect(
      component.showPassword()
    ).toBe(false);
  });

  it('should toggle password visibility', () => {
    component
      .togglePasswordVisibility();

    expect(
      component.showPassword()
    ).toBe(true);

    component
      .togglePasswordVisibility();

    expect(
      component.showPassword()
    ).toBe(false);
  });

  it('should not submit an empty form', () => {
    component.submit();

    expect(
      router.navigate
    ).not.toHaveBeenCalled();

    expect(
      component.loginForm
        .invalid
    ).toBe(true);
  });

  it('should reject a non institutional email', () => {
    component.loginForm
      .setValue({
        correo:
          'usuario@gmail.com',

        password:
          'password123',

        rememberSession:
          false
      });

    component.submit();

    expect(
      router.navigate
    ).not.toHaveBeenCalled();

    expect(
      component.loginForm
        .controls
        .correo
        .hasError(
          'institutionalEmail'
        )
    ).toBe(true);
  });

  it('should reject a short password', () => {
    component.loginForm
      .setValue({
        correo:
          'usuario@estudiantec.cr',

        password:
          '1234567',

        rememberSession:
          false
      });

    component.submit();

    expect(
      router.navigate
    ).not.toHaveBeenCalled();

    expect(
      component.loginForm
        .controls
        .password
        .hasError(
          'minlength'
        )
    ).toBe(true);
  });

  it('should accept estudiantec.cr email', () => {
    component.loginForm
      .controls
      .correo
      .setValue(
        'usuario@estudiantec.cr'
      );

    expect(
      component.loginForm
        .controls
        .correo
        .valid
    ).toBe(true);
  });

  it('should accept tec.ac.cr email', () => {
    component.loginForm
      .controls
      .correo
      .setValue(
        'usuario@tec.ac.cr'
      );

    expect(
      component.loginForm
        .controls
        .correo
        .valid
    ).toBe(true);
  });

  it('should not bypass Google authentication with prototype credentials', () => {
    component.loginForm
      .setValue({
        correo:
          'usuario@estudiantec.cr',

        password:
          'password123',

        rememberSession:
          false
      });

    component.submit();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.error()).toBe(true);
    expect(component.errorMessage()).toContain(
      'Ingresa con el botón de Google'
    );
  });

  it('should allow remember session checkbox selection', () => {
    component.loginForm
      .controls
      .rememberSession
      .setValue(true);

    expect(
      component.loginForm
        .controls
        .rememberSession
        .value
    ).toBe(true);
  });

  it('should expose invalid email state after touch', () => {
    component.loginForm
      .controls
      .correo
      .setValue(
        'usuario@gmail.com'
      );

    component.loginForm
      .controls
      .correo
      .markAsTouched();

    expect(
      component.isControlInvalid(
        'correo'
      )
    ).toBe(true);
  });

  it('should expose invalid password state after touch', () => {
    component.loginForm
      .controls
      .password
      .setValue(
        '123'
      );

    component.loginForm
      .controls
      .password
      .markAsTouched();

    expect(
      component.isControlInvalid(
        'password'
      )
    ).toBe(true);
  });
});
