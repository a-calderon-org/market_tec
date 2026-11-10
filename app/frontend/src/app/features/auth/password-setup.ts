import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
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

  readonly state = signal<'checking' | 'ready' | 'unavailable' | 'configured' | 'done' | 'failed'>('checking');
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly showPassword = signal(false);
  readonly min = PASSWORD_MIN;
  readonly max = PASSWORD_MAX;

  readonly form = this.fb.group(
    {
      contrasena: this.fb.control('', [Validators.required, Validators.minLength(PASSWORD_MIN), Validators.maxLength(PASSWORD_MAX)]),
      confirmacion: this.fb.control('', [Validators.required]),
    },
    { validators: passwordsMatch },
  );

  async ngOnInit(): Promise<void> {
    try {
      const status = await this.passwords.status();
      this.state.set(status.setupAvailable ? 'ready' : status.configured ? 'configured' : 'unavailable');
    } catch (error) {
      this.errorMessage.set(describePasswordSetupFailure(error));
      this.state.set('failed');
    }
  }

  toggleVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }

  hasError(control: 'contrasena' | 'confirmacion', error: string): boolean {
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
      await this.passwords.setInitial(this.form.getRawValue().contrasena);
      this.form.reset();
      this.state.set('done');
    } catch (error) {
      this.errorMessage.set(describePasswordSetupFailure(error));
    } finally {
      this.saving.set(false);
    }
  }

  async continueToApp(): Promise<void> {
    await this.router.navigate(['/'], { replaceUrl: true });
  }
}
