import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { UpdateUser, User } from './models/user.model';
import { UserService } from './services/user.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.scss'
})
export class Profile implements OnInit {
  private readonly formBuilder =
    inject(NonNullableFormBuilder);

  private readonly userService =
    inject(UserService);

  readonly currentUserId =
    'USR-001';

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

  loadUser(): void {
    this.loading.set(true);
    this.error.set(false);
    this.imageFailed.set(false);

    this.userService
      .getUser(
        this.currentUserId
      )
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
      this.saving()
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

    this.userService
      .updateUser(
        this.currentUserId,
        payload
      )
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
            HttpErrorResponse
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
      HttpErrorResponse
  ): string {
    const apiMessage =
      error.error?.message;

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
}