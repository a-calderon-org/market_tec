import { AfterViewInit, Component, ElementRef, ViewChild, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { describeGoogleAuthFailure, GoogleAuthService } from './services/google-auth.service';
import type { GoogleAttemptPurpose } from '../../core/auth/v2/auth-contract';
import { FEATURE_FLAGS } from '../../core/feature-flags';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LoginService } from './services/login.service';
import { AuthSessionService } from '../../core/auth/v2/auth-session.service';
import { describeEmailLinkFailure } from './services/email-link-errors';
import { ThemeService } from '../../core/theme.service';

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
  private readonly themeService = inject(ThemeService);
  private googleButtonReady = false;
  private renderingGoogleButton = false;

  private readonly googleButtonThemeEffect = effect(() => {
    const theme = this.themeService.theme();

    if (this.googleButtonReady) {
      void this.renderGoogleButton(theme, false);
    }
  });

  @ViewChild('googleButton') private googleButton!: ElementRef<HTMLElement>;
  readonly googleLoading = signal(true);
  readonly googleLoadError = signal(false);
  /** Solo authCoreV2: cada propósito usa su propio intento y nonce (D-06). */
  readonly authCoreV2 = inject(FEATURE_FLAGS).authCoreV2;
  readonly googlePurpose = signal<GoogleAttemptPurpose>('login');

  /** Cambia entre «Ingresar» y «Crear cuenta»; pide un intento nuevo a ms-users. */
  setGooglePurpose(purpose: GoogleAttemptPurpose): void {
    if (!this.authCoreV2 || this.googleLoading() || this.submitting() || this.googlePurpose() === purpose) return;
    this.googlePurpose.set(purpose);
    void this.loadGoogleButton();
  }

  ngAfterViewInit(): void {
    this.googleButtonReady = true;
    void this.loadGoogleButton();
  }

  async loadGoogleButton(): Promise<void> {
    await this.renderGoogleButton(this.themeService.theme(), true);
  }

  private async renderGoogleButton(
    theme: 'light' | 'dark',
    resetFeedback: boolean
  ): Promise<void> {
    if (this.authCoreV2 && (this.renderingGoogleButton || this.submitting())) return;
    this.renderingGoogleButton = true;
    this.googleLoading.set(true);
    this.googleLoadError.set(false);
    if (resetFeedback) this.error.set(false);
    try {
      await this.googleAuth.renderButton(this.googleButton.nativeElement, credential => {
        void this.signInWithGoogle(credential);
      }, theme === 'dark' ? 'outline_dark' : 'outline', this.googlePurpose());
    } catch (error) {
      this.googleLoadError.set(true);
      this.error.set(true);
      this.errorMessage.set(error instanceof Error ? error.message : 'No se pudo cargar Google.');
    } finally {
      this.renderingGoogleButton = false;
      this.googleLoading.set(false);
    }
  }

  async signInWithGoogle(credential: string): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set(false);
    let signedIn = false;
    try {
      await this.googleAuth.signIn(credential);
      signedIn = true;
      if (!await this.router.navigate(['/'])) throw new Error('No fue posible abrir MarketTec.');
    } catch (error) {
      this.error.set(true);
      this.errorMessage.set(error instanceof HttpErrorResponse
        ? error.error?.message || 'No se pudo conectar con el servidor de acceso. Inténtalo nuevamente.'
        : this.authCoreV2 && !signedIn
          ? describeGoogleAuthFailure(error, this.googlePurpose())
          : 'No fue posible ingresar a MarketTec.');
    } finally {
      this.submitting.set(false);
    }
    // v2: el intento ya se consumió (o falló); otro clic necesita un intento nuevo.
    if (this.authCoreV2 && !signedIn) {
      await this.renderGoogleButton(this.themeService.theme(), false);
    }
  }
  private readonly loginService =
    inject(LoginService);

  private readonly formBuilder =
    inject(NonNullableFormBuilder);

  private readonly router =
    inject(Router);

  /** Magic Link institucional: solo con el núcleo v2 (sesión interna en memoria). */
  private readonly session = this.authCoreV2 ? inject(AuthSessionService) : null;

  readonly emailLoginAvailable = this.authCoreV2;

  /** El formulario de correo se muestra tras «Continuar con correo institucional». */
  readonly emailFormOpen =
    signal(false);

  readonly submitting =
    signal(false);

  readonly sendingLink =
    signal(false);

  /** Dirección a la que se pidió el último enlace (solo para el mensaje de confirmación). */
  readonly linkSentTo =
    signal<string | null>(null);

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
        )
    });

  openEmailForm(): void {
    this.emailFormOpen.set(true);
  }

  /** Vuelve al formulario para pedir otro enlace (p. ej. tras abrirlo en otro navegador). */
  requestAnotherLink(): void {
    this.linkSentTo.set(null);
    this.emailFormOpen.set(true);
  }

  async submit(): Promise<void> {
    this.error.set(false);
    this.errorMessage.set('');

    if (
      this.loginForm.invalid ||
      this.sendingLink() ||
      this.submitting()
    ) {
      this.loginForm
        .markAllAsTouched();

      return;
    }

    const correo =
      this.loginService
        .normalizeEmail(
          this.loginForm.getRawValue().correo
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

    if (!this.session) {
      this.error.set(true);
      this.errorMessage.set(
        'El acceso con correo institucional no está disponible en este momento. Ingresa con Google.'
      );

      return;
    }

    this.sendingLink.set(true);
    try {
      await this.session.requestEmailLink(correo);
      this.linkSentTo.set(correo);
    } catch (error) {
      this.error.set(true);
      this.errorMessage.set(describeEmailLinkFailure(error));
    } finally {
      this.sendingLink.set(false);
    }
  }

  isControlInvalid(
    controlName:
      'correo'
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

  onSupportClick(event: Event): void {
    event.preventDefault();
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
