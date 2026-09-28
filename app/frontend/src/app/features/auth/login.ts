import { Component, inject, signal } from '@angular/core';
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
export class Login {
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