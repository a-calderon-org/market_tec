import { Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { User } from './models/user.model';
import { APELLIDOS_MAX, NOMBRE_MAX, needsNames, prefillNombre } from './profile-completion';
import { UserService } from './services/user.service';

/**
 * Datos básicos tras registrarse (`/registro/datos`, solo con sesión). Pide únicamente nombre y apellidos, precargados
 * con lo que Google haya aportado. Ni nombre de usuario ni contraseña: el primero lo genera ms-users y es inmutable;
 * las cuentas Google no tienen contraseña local.
 */
@Component({
  selector: 'app-complete-profile',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <main class="login">
      <section class="login-card" aria-live="polite">
        <header class="login-brand">
          <div class="login-brand__welcome">
            <h1>Completa tu registro</h1>
            <p>Confirma tu nombre y apellidos. Podrás cambiarlos después desde tu perfil.</p>
          </div>
        </header>

        @if (errorMessage()) {
          <div class="login-feedback" role="alert">
            <span>!</span>
            <p>{{ errorMessage() }}</p>
          </div>
        }

        @if (loading()) {
          <p class="google-login-note" role="status">Cargando tu cuenta...</p>
        } @else if (user()) {
          <form class="login-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <label class="form-field">
              <span class="form-field__label">Nombre</span>
              <div class="input-control" [class.input-control--error]="invalid('nombre')">
                <input type="text" formControlName="nombre" autocomplete="given-name" [attr.maxlength]="nombreMax">
              </div>
              @if (invalid('nombre')) {
                <small class="field-error">Ingresa tu nombre.</small>
              }
            </label>

            <label class="form-field">
              <span class="form-field__label">Apellidos</span>
              <div class="input-control" [class.input-control--error]="invalid('apellidos')">
                <input type="text" formControlName="apellidos" autocomplete="family-name" [attr.maxlength]="apellidosMax">
              </div>
              @if (invalid('apellidos')) {
                <small class="field-error">Ingresa tus apellidos.</small>
              }
            </label>

            <button class="login-submit login-submit--centered" type="submit" [disabled]="form.invalid || saving()">
              {{ saving() ? 'Guardando...' : 'Continuar' }}
            </button>
          </form>
        } @else {
          <button type="button" class="login-submit login-submit--centered" (click)="continueToApp()">
            Continuar a MarketTEC
          </button>
        }
      </section>
    </main>
  `,
  styleUrl: '../auth/login.scss',
})
export class CompleteProfile implements OnInit {
  private readonly users = inject(UserService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly user = signal<User | null>(null);
  readonly nombreMax = NOMBRE_MAX;
  readonly apellidosMax = APELLIDOS_MAX;

  readonly form = this.fb.group({
    nombre: this.fb.control('', [Validators.required, Validators.maxLength(NOMBRE_MAX), Validators.pattern(/\S/)]),
    apellidos: this.fb.control('', [
      Validators.required,
      Validators.maxLength(APELLIDOS_MAX),
      Validators.pattern(/\S/),
    ]),
  });

  async ngOnInit(): Promise<void> {
    try {
      const user = await firstValueFrom(this.users.getMyProfile());
      if (!needsNames(user)) {
        await this.continueToApp();
        return;
      }
      this.user.set(user);
      this.form.setValue({ nombre: prefillNombre(user), apellidos: user.apellidos.trim() });
    } catch {
      this.errorMessage.set('No fue posible cargar tu cuenta. Podrás completar tus datos desde tu perfil.');
    } finally {
      this.loading.set(false);
    }
  }

  invalid(control: 'nombre' | 'apellidos'): boolean {
    const field = this.form.controls[control];

    return field.invalid && (field.dirty || field.touched);
  }

  async submit(): Promise<void> {
    this.errorMessage.set('');
    const user = this.user();
    if (!user || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.saving.set(true);
    try {
      // El nombre de usuario se reenvía sin cambios: ms-users rechaza cualquier otro valor.
      await firstValueFrom(
        this.users.updateMyProfile({
          nombreUsuario: user.nombreUsuario,
          nombre: value.nombre.trim(),
          apellidos: value.apellidos.trim(),
        }),
      );
      await this.continueToApp();
    } catch {
      this.errorMessage.set('No fue posible guardar tus datos. Inténtalo nuevamente.');
    } finally {
      this.saving.set(false);
    }
  }

  async continueToApp(): Promise<void> {
    await this.router.navigate(['/'], { replaceUrl: true });
  }
}
