import { Component, computed, EventEmitter, inject, OnInit, Output, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthApiError, AuthRequiredError } from '../../core/auth/v2/auth-contract';
import { BusinessTransportBlockedError } from '../../core/auth/v2/business-transport';
import { AuthMethod, AuthMethodsService } from '../../core/auth/v2/auth-methods.service';
import { PasswordCredentialsService } from '../../core/auth/v2/password-credentials.service';
import { FEATURE_FLAGS } from '../../core/feature-flags';
import { PASSWORD_MAX, PASSWORD_MIN } from '../auth/password-setup';
import { describePasswordChangeFailure } from '../auth/services/password-auth-errors';
import { GoogleAuthService } from '../auth/services/google-auth.service';
import { UpdateUser, User } from './models/user.model';
import { UserService } from './services/user.service';

function newPasswordsMatch(group: AbstractControl): ValidationErrors | null {
  const next = group.get('nueva')?.value;
  const repeat = group.get('confirmacion')?.value;

  return next && repeat && next !== repeat ? { mismatch: true } : null;
}

/** Controles de contraseña según las credenciales reales de la cuenta (`GET /v1/me/password`). */
export type PasswordOptions = 'hidden' | 'change' | 'setup';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    ReactiveFormsModule
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.scss'
})
export class Profile implements OnInit {
  @Output() readonly closed = new EventEmitter<void>();
  private readonly formBuilder =
    inject(NonNullableFormBuilder);

  private readonly userService =
    inject(UserService);

  private readonly router =
    inject(Router);

  private readonly flags =
    inject(FEATURE_FLAGS);

  private readonly authCoreV2 =
    this.flags.authCoreV2;

  /** Solo con ms-users por HTTP: las cuentas del flujo legado no tienen métodos ni contraseña consultables. */
  private readonly methodsService =
    this.authCoreV2 && this.flags.authCoreV2Adapter === 'http'
      ? inject(AuthMethodsService)
      : null;

  /** Solo con contraseñas activas (`passwordAuth`): sin el flag no existe ningún control de contraseña. */
  private readonly passwords =
    this.methodsService && this.flags.passwordAuth === true
      ? inject(PasswordCredentialsService)
      : null;

  /**
   * authCoreV2=false conserva el identificador fijo heredado. Con el flag
   * activo solo se usa para saber si hay sesión: el perfil se pide a
   * `/v1/me/profile` y el servidor deriva el usuario del JWT interno; nunca el
   * sub de Google, el correo ni 'USR-001'. Sin sesión no se consulta nada.
   */
  readonly currentUserId: string | null =
    this.authCoreV2
      ? (inject(GoogleAuthService).user()?.id ?? null)
      : 'USR-001';

  readonly user =
    signal<User | null>(
      null
    );

  readonly loading =
    signal(true);

  readonly error =
    signal(false);

  readonly saving =
    signal(false);

  readonly saveSuccess =
    signal(false);

  readonly saveError =
    signal(false);

  readonly saveMessage =
    signal('');

  readonly imageFailed =
    signal(false);

  readonly profileForm =
    this.formBuilder.group({
      nombre:
        this.formBuilder.control(
          '',
          {
            validators: [
              Validators.required,
              Validators.minLength(2),
              Validators.maxLength(50)
            ]
          }
        ),

      apellidos:
        this.formBuilder.control(
          '',
          {
            validators: [
              Validators.required,
              Validators.minLength(2),
              Validators.maxLength(80)
            ]
          }
        )
    });

  /** Métodos vinculados (estado real de las identidades); vacío si no se pudieron consultar. */
  readonly methods =
    signal<readonly AuthMethod[]>([]);

  /** Cuentas solo Google (o sin contraseña ni concesión) no ven ningún control de contraseña. */
  readonly passwordOptions =
    signal<PasswordOptions>('hidden');

  readonly changingPassword =
    signal(false);

  readonly passwordMessage =
    signal('');

  readonly passwordChanged =
    signal(false);

  readonly passwordMin = PASSWORD_MIN;

  readonly passwordMax = PASSWORD_MAX;

  readonly passwordForm =
    this.formBuilder.group(
      {
        actual: this.formBuilder.control('', [Validators.required, Validators.maxLength(256)]),
        nueva: this.formBuilder.control('', [
          Validators.required,
          Validators.minLength(PASSWORD_MIN),
          Validators.maxLength(PASSWORD_MAX)
        ]),
        confirmacion: this.formBuilder.control('', [Validators.required])
      },
      { validators: newPasswordsMatch }
    );

  /** Texto del método de acceso a partir de las identidades activas vinculadas. */
  readonly accessMethod =
    computed(() => {
      const active = this.methods().filter((method) => method.status === 'active');
      const google = active.some((method) => method.provider === 'google');
      const institutional = active.some((method) => method.provider === 'institutional_email');
      const withPassword = this.passwordOptions() === 'change';
      const institutionalLabel = withPassword
        ? 'Correo institucional y contraseña'
        : 'Correo institucional (enlace por correo)';

      if (google && institutional) return `Google · ${institutionalLabel}`;
      if (google) return 'Google';
      if (institutional) return institutionalLabel;

      return '';
    });

  readonly fullName =
    computed(() => {
      const user =
        this.user();

      if (!user) {
        return '';
      }

      return [
        user.nombre,
        user.apellidos
      ]
        .filter(Boolean)
        .join(' ');
    });

  readonly initials =
    computed(() => {
      const user =
        this.user();

      if (!user) {
        return 'MT';
      }

      const first =
        user.nombre
          .trim()
          .charAt(0);

      const last =
        user.apellidos
          .trim()
          .charAt(0);

      return (
        `${first}${last}`
      ).toUpperCase();
    });

  ngOnInit(): void {
    this.loadUser();
    void this.loadAccess();
  }

  /** Métodos y contraseña se consultan aparte: un fallo aquí no impide ver ni editar el perfil. */
  async loadAccess(): Promise<void> {
    if (this.methodsService) {
      try {
        this.methods.set(await this.methodsService.list());
      } catch {
        this.methods.set([]);
      }
    }

    if (this.passwords) {
      try {
        const status = await this.passwords.status();
        this.passwordOptions.set(status.configured ? 'change' : status.setupAvailable ? 'setup' : 'hidden');
      } catch {
        this.passwordOptions.set('hidden');
      }
    }
  }

  async changePassword(): Promise<void> {
    this.passwordMessage.set('');
    this.passwordChanged.set(false);

    if (!this.passwords || this.passwordForm.invalid || this.changingPassword()) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const value = this.passwordForm.getRawValue();
    this.changingPassword.set(true);
    try {
      await this.passwords.change(value.actual, value.nueva);
      this.passwordForm.reset();
      this.passwordChanged.set(true);
      this.passwordMessage.set('Contraseña actualizada. Se cerraron tus otras sesiones.');
    } catch (error) {
      this.passwordMessage.set(describePasswordChangeFailure(error));
    } finally {
      this.changingPassword.set(false);
    }
  }

  isPasswordControlInvalid(
    controlName: keyof typeof this.passwordForm.controls
  ): boolean {
    const control = this.passwordForm.controls[controlName];

    return control.invalid && (control.dirty || control.touched);
  }

  /** Primera contraseña: la pantalla dedicada valida la concesión de un solo uso del enlace confirmado. */
  async openPasswordSetup(): Promise<void> {
    this.close();
    await this.router.navigate(['/contrasena']);
  }

  passwordMismatch(): boolean {
    return this.passwordForm.hasError('mismatch') && this.passwordForm.controls.confirmacion.touched;
  }

  close(): void {
    this.closed.emit();
  }

  loadUser(): void {
    this.loading.set(true);
    this.error.set(false);
    this.imageFailed.set(false);

    if (this.currentUserId === null) {
      this.user.set(null);
      this.error.set(true);
      this.loading.set(false);
      return;
    }

    (this.authCoreV2
      ? this.userService.getMyProfile()
      : this.userService.getUser(this.currentUserId))
      .subscribe({
        next: (user) => {
          this.user.set(
            user
          );

          this.profileForm.setValue({
            nombre:
              user.nombre,

            apellidos:
              user.apellidos
          });

          this.profileForm
            .markAsPristine();

          this.loading.set(
            false
          );
        },

        error: () => {
          this.user.set(
            null
          );

          this.error.set(
            true
          );

          this.loading.set(
            false
          );
        }
      });
  }

  saveProfile(): void {
    this.saveSuccess.set(
      false
    );

    this.saveError.set(
      false
    );

    this.saveMessage.set(
      ''
    );

    const current =
      this.user();

    if (current === null && !this.saving()) {
      // Sin perfil cargado no se conoce el nombre de usuario (inmutable): no se envía nada.
      this.saveError.set(true);
      this.saveMessage.set('No fue posible cargar tu perfil. Recarga e inténtalo nuevamente.');
      return;
    }

    if (
      this.profileForm.invalid ||
      this.saving() ||
      this.currentUserId === null ||
      current === null
    ) {
      this.profileForm
        .markAllAsTouched();

      return;
    }

    const value =
      this.profileForm
        .getRawValue();

    const payload:
      UpdateUser = {
        nombre:
          value.nombre.trim(),

        apellidos:
          value.apellidos.trim(),

        // El nombre de usuario es inmutable: se reenvía exactamente el valor actual.
        nombreUsuario:
          current.nombreUsuario
      };

    this.saving.set(
      true
    );

    (this.authCoreV2
      ? this.userService.updateMyProfile(payload)
      : this.userService.updateUser(this.currentUserId, payload))
      .subscribe({
        next: (response) => {
          this.user.set(
            response
          );

          this.profileForm.setValue({
            nombre:
              response.nombre,

            apellidos:
              response.apellidos
          });

          this.profileForm
            .markAsPristine();

          this.saveSuccess.set(
            true
          );

          this.saveMessage.set(
            response.message ||
            'Perfil actualizado correctamente.'
          );

          this.saving.set(
            false
          );
        },

        error: (
          error:
            unknown
        ) => {
          this.saveError.set(
            true
          );

          this.saveMessage.set(
            this.getErrorMessage(
              error
            )
          );

          this.saving.set(
            false
          );
        }
      });
  }

  isControlInvalid(
    controlName:
      keyof typeof this.profileForm.controls
  ): boolean {
    const control =
      this.profileForm.controls[
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

  onImageError(): void {
    this.imageFailed.set(
      true
    );
  }

  formatDate(
    date: string
  ): string {
    return new Intl
      .DateTimeFormat(
        'es-CR',
        {
          dateStyle:
            'long'
        }
      )
      .format(
        new Date(date)
      );
  }

  formatStatus(
    status: string
  ): string {
    if (
      status.toLowerCase() ===
      'activo'
    ) {
      return 'Activo';
    }

    return status
      .split('-')
      .map(
        (word) =>
          word.charAt(0)
            .toUpperCase() +
          word.slice(1)
      )
      .join(' ');
  }

  private getErrorMessage(
    error:
      unknown
  ): string {
    if (this.authCoreV2) {
      return this.getV2ErrorMessage(error);
    }

    const apiMessage =
      error instanceof HttpErrorResponse
        ? error.error?.message
        : undefined;

    if (
      typeof apiMessage ===
      'string' &&
      apiMessage.trim()
    ) {
      return apiMessage;
    }

    return (
      'No fue posible actualizar el perfil. Inténtalo nuevamente.'
    );
  }

  /** Mensajes por código del sobre Java (`{error:{code}}`); nunca se reintenta. */
  private getV2ErrorMessage(error: unknown): string {
    if (error instanceof AuthRequiredError) {
      return 'Tu sesión cambió o expiró. Vuelve a ingresar para editar tu perfil.';
    }

    if (error instanceof BusinessTransportBlockedError) {
      return 'La edición del perfil no está disponible en este momento.';
    }

    const status = error instanceof HttpErrorResponse
      ? error.status
      : error instanceof AuthApiError ? error.status : 0;
    const code = error instanceof HttpErrorResponse
      ? (error.error?.error?.code as string | undefined)
      : undefined;

    if (status === 401) {
      return 'Tu sesión expiró. Vuelve a ingresar para editar tu perfil.';
    }

    if (status === 409 && code === 'CONCURRENT_MODIFICATION') {
      return 'Tu perfil cambió en otra sesión. Recarga e inténtalo de nuevo.';
    }

    if (status === 400) {
      return 'Revisa los datos del perfil e inténtalo nuevamente.';
    }

    if (status === 503) {
      return 'La edición del perfil no está disponible en este momento.';
    }

    return 'No fue posible actualizar el perfil. Inténtalo nuevamente.';
  }
}
