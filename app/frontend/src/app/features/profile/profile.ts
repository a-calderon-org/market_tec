import { Component, computed, EventEmitter, inject, OnInit, Output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthApiError, AuthRequiredError } from '../../core/auth/v2/auth-contract';
import { BusinessTransportBlockedError } from '../../core/auth/v2/business-transport';
import { FEATURE_FLAGS } from '../../core/feature-flags';
import { GoogleAuthService } from '../auth/services/google-auth.service';
import { UpdateUser, User } from './models/user.model';
import { UserService } from './services/user.service';

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

  private readonly authCoreV2 =
    inject(FEATURE_FLAGS).authCoreV2;

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
        ),

      nombreUsuario:
        this.formBuilder.control(
          '',
          {
            validators: [
              Validators.required,
              Validators.minLength(3),
              Validators.maxLength(40),
              Validators.pattern(
                /^[a-zA-Z0-9._-]+$/
              )
            ]
          }
        )
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
              user.apellidos,

            nombreUsuario:
              user.nombreUsuario
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

    if (
      this.profileForm.invalid ||
      this.saving() ||
      this.currentUserId === null
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

        nombreUsuario:
          value.nombreUsuario.trim()
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
              response.apellidos,

            nombreUsuario:
              response.nombreUsuario
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
