import { AfterViewInit, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { GoogleAuthService } from './services/google-auth.service';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LoginService } from './services/login.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login implements AfterViewInit {
  private readonly googleAuth = inject(GoogleAuthService);
  @ViewChild('googleButton') private googleButton!: ElementRef<HTMLElement>;
  readonly googleLoading = signal(true);
  readonly googleLoadError = signal(false);

  ngAfterViewInit(): void {
    void this.loadGoogleButton();
  }

  async loadGoogleButton(): Promise<void> {
    this.googleLoading.set(true);
    this.googleLoadError.set(false);
    this.error.set(false);
    try {
      await this.googleAuth.renderButton(this.googleButton.nativeElement, credential => {
        void this.signInWithGoogle(credential);
      });
    } catch (error) {
      this.googleLoadError.set(true);
      this.error.set(true);
      this.errorMessage.set(error instanceof Error ? error.message : 'No se pudo cargar Google.');
    } finally {
      this.googleLoading.set(false);
    }
  }

  async signInWithGoogle(credential: string): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set(false);
    try {
      await this.googleAuth.signIn(credential);
      if (!await this.router.navigate(['/'])) throw new Error('No fue posible abrir MarketTec.');
    } catch (error) {
      this.error.set(true);
      this.errorMessage.set(error instanceof HttpErrorResponse
        ? error.error?.message || 'No se pudo conectar con el servidor de acceso. Inténtalo nuevamente.'
        : 'No fue posible ingresar a MarketTec.');
    } finally {
      this.submitting.set(false);
    }
  }
  private readonly loginService =
    inject(LoginService);

  private readonly formBuilder =
    inject(NonNullableFormBuilder);

  private readonly router =
    inject(Router);

  readonly showPassword =
    signal(false);

  readonly submitting =
    signal(false);

  readonly error =
    signal(false);

  readonly errorMessage =
    signal('');

  readonly loginForm =
    this.formBuilder.group({
      correo:
        this.formBuilder.control(
          '',
          {
            validators: [
              Validators.required,
              Validators.email,
              (control) =>
                this.validateInstitutionalEmail(
                  control
                )
            ]
          }
        ),

      password:
        this.formBuilder.control(
          '',
          {
            validators: [
              Validators.required,
              Validators.minLength(8),
              Validators.maxLength(128)
            ]
          }
        ),

      rememberSession:
        this.formBuilder.control(
          false
        )
    });

  togglePasswordVisibility(): void {
    this.showPassword.update(
      (visible) =>
        !visible
    );
  }

  submit(): void {
    this.error.set(false);
    this.errorMessage.set('');

    if (
      this.loginForm.invalid ||
      this.submitting()
    ) {
      this.loginForm
        .markAllAsTouched();

      return;
    }

    const value =
      this.loginForm
        .getRawValue();

    const correo =
      this.loginService
        .normalizeEmail(
          value.correo
        );

    if (
      !this.loginService
        .isInstitutionalEmail(
          correo
        )
    ) {
      this.error.set(true);

      this.errorMessage.set(
        'Debes utilizar un correo institucional del TEC.'
      );

      return;
    }

    this.submitting.set(true);

    void this.router
      .navigate(['/'])
      .then(
        (navigated) => {
          if (!navigated) {
            this.error.set(true);

            this.errorMessage.set(
              'No fue posible ingresar a MarketTec.'
            );
          }

          this.submitting.set(false);
        }
      )
      .catch(
        () => {
          this.error.set(true);

          this.errorMessage.set(
            'No fue posible ingresar a MarketTec.'
          );

          this.submitting.set(false);
        }
      );
  }

  isControlInvalid(
    controlName:
      'correo' |
      'password'
  ): boolean {
    const control =
      this.loginForm.controls[
        controlName
      ];

    return (
      control.invalid &&
      (
        control.dirty ||
        control.touched
      )
    );
  }

  hasEmailError(
    errorName: string
  ): boolean {
    const control =
      this.loginForm.controls
        .correo;

    return (
      this.isControlInvalid(
        'correo'
      ) &&
      control.hasError(
        errorName
      )
    );
  }

  private validateInstitutionalEmail(
    control:
      AbstractControl<string>
  ): ValidationErrors | null {
    const value =
      control.value.trim();

    if (!value) {
      return null;
    }

    if (
      !this.loginService
        .isInstitutionalEmail(
          value
        )
    ) {
      return {
        institutionalEmail:
          true
      };
    }

    return null;
  }
}
