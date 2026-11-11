import { Component, Injector, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { User } from '../profile/models/user.model';
import { APELLIDOS_MAX, NOMBRE_MAX, needsNames, prefillNombre } from '../profile/profile-completion';
import { UserService } from '../profile/services/user.service';
import { PasswordCredentialsService } from '../../core/auth/v2/password-credentials.service';
import { describePasswordSetupFailure } from './services/password-auth-errors';

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const next = group.get('contrasena')?.value;
  const repeat = group.get('confirmacion')?.value;

  return next && repeat && next !== repeat ? { mismatch: true } : null;
}

/**
 * Configuración de la primera contraseña (`/contrasena`, solo con sesión). ms-users la autoriza únicamente con la
 * concesión de un solo uso que deja un enlace confirmado hace menos de 10 minutos; sin ella no hay formulario, solo la
 * indicación de verificar el correo otra vez. Nada de esto se simula: cada paso es una llamada real al backend.
 */
@Component({
  selector: 'app-password-setup',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './password-setup.html',
  styleUrl: './login.scss',
})
export class PasswordSetup implements OnInit {
  private readonly passwords = inject(PasswordCredentialsService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly injector = inject(Injector);

  readonly state = signal<'checking' | 'ready' | 'unavailable' | 'configured' | 'done' | 'failed'>('checking');
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly showPassword = signal(false);
  readonly min = PASSWORD_MIN;
  readonly max = PASSWORD_MAX;
  readonly nombreMax = NOMBRE_MAX;
  readonly apellidosMax = APELLIDOS_MAX;
  /** Registro institucional nuevo: además de la contraseña se piden nombre y apellidos (nunca nombre de usuario). */
  readonly askNames = signal(false);
  private profile: User | null = null;

  readonly form = this.fb.group(
    {
      contrasena: this.fb.control('', [Validators.required, Validators.minLength(PASSWORD_MIN), Validators.maxLength(PASSWORD_MAX)]),
      confirmacion: this.fb.control('', [Validators.required]),
      // Sin validadores hasta saber si la cuenta necesita sus datos básicos.
      nombre: this.fb.control(''),
      apellidos: this.fb.control(''),
    },
    { validators: passwordsMatch },
  );

  async ngOnInit(): Promise<void> {
    try {
      const status = await this.passwords.status();
      if (status.setupAvailable) await this.loadNames();
      this.state.set(status.setupAvailable ? 'ready' : status.configured ? 'configured' : 'unavailable');
    } catch (error) {
      this.errorMessage.set(describePasswordSetupFailure(error));
      this.state.set('failed');
    }
  }

  /** Si el perfil no se puede consultar, la contraseña se configura igual; los datos se completan después. */
  private async loadNames(): Promise<void> {
    try {
      const user = await firstValueFrom(this.injector.get(UserService).getMyProfile());
      if (!needsNames(user)) return;
      this.profile = user;
      const { nombre, apellidos } = this.form.controls;
      nombre.setValidators([Validators.required, Validators.maxLength(NOMBRE_MAX), Validators.pattern(/\S/)]);
      apellidos.setValidators([Validators.required, Validators.maxLength(APELLIDOS_MAX), Validators.pattern(/\S/)]);
      nombre.setValue(prefillNombre(user));
      apellidos.setValue(user.apellidos.trim());
      this.askNames.set(true);
    } catch {
      this.askNames.set(false);
    }
  }

  toggleVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }

  hasError(control: 'contrasena' | 'confirmacion' | 'nombre' | 'apellidos', error: string): boolean {
    const field = this.form.controls[control];

    return field.hasError(error) && (field.dirty || field.touched);
  }

  mismatch(): boolean {
    return this.form.hasError('mismatch') && this.form.controls.confirmacion.touched;
  }

  async submit(): Promise<void> {
    this.errorMessage.set('');
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const value = this.form.getRawValue();
      if (this.askNames() && this.profile) {
        // Primero los datos (idempotente): si la contraseña se rechaza por débil, reintentar no pierde nada.
        // El nombre de usuario se reenvía sin cambios; ms-users rechaza cualquier otro valor.
        await firstValueFrom(
          this.injector.get(UserService).updateMyProfile({
            nombreUsuario: this.profile.nombreUsuario,
            nombre: value.nombre.trim(),
            apellidos: value.apellidos.trim(),
          }),
        );
      }
      await this.passwords.setInitial(value.contrasena);
      this.form.reset();
      this.state.set('done');
    } catch (error) {
      this.errorMessage.set(describePasswordSetupFailure(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** Omitir la contraseña no omite los datos básicos que falten. */
  async continueToApp(): Promise<void> {
    const destination = this.state() === 'done' ? '/' : this.askNames() ? '/registro/datos' : '/';
    await this.router.navigate([destination], { replaceUrl: true });
  }
}
