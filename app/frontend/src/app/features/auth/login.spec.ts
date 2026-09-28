import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Login } from './login';
import { LoginService } from './services/login.service';

describe('Login', () => {
  let fixture:
    ComponentFixture<Login>;

  let component:
    Login;

  let router:
    Router;

  beforeEach(async () => {
    await TestBed
      .configureTestingModule({
        imports: [
          Login
        ],

        providers: [
          provideRouter([]),
          LoginService
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

  it('should navigate to home with valid credentials', () => {
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

    expect(
      router.navigate
    ).toHaveBeenCalledWith(
      ['/']
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