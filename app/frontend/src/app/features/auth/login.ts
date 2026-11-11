import { AfterViewInit, Component, ElementRef, Injector, ViewChild, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { describeGoogleAuthFailure, GoogleAuthService, type GoogleButtonTheme } from './services/google-auth.service';
import type { GoogleAttemptPurpose } from '../../core/auth/v2/auth-contract';
import { FEATURE_FLAGS } from '../../core/feature-flags';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LoginService } from './services/login.service';
import { AuthSessionService } from '../../core/auth/v2/auth-session.service';
import { describeEmailLinkFailure } from './services/email-link-errors';
import { describePasswordLoginFailure, describeRecoveryRequestFailure } from './services/password-auth-errors';
import { ThemeService } from '../../core/theme.service';
import { landingAfterSignIn } from '../profile/post-sign-in';

/** Operación visible de la pantalla: dos formularios y dos propósitos de Google bien diferenciados. */
export type AuthMode = 'signin' | 'signup';
/** Dentro de «Iniciar sesión»: contraseña o solicitud de recuperación. */
export type SignInView = 'password' | 'recovery';

/** Temas oficiales de GIS: `outline` sobre claro y `filled_black` sobre oscuro. */
export function googleThemeFor(theme: 'light' | 'dark'): GoogleButtonTheme {
  return theme === 'dark' ? 'filled_black' : 'outline';
}

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
  private readonly injector = inject(Injector);
  private googleButtonReady = false;
  private renderingGoogleButton = false;

  private readonly googleButtonThemeEffect = effect(() => {
    const theme = this.themeService.theme();

    if (this.googleButtonReady) {
      this.restyleGoogleButton(theme);
    }
  });

  @ViewChild('googleButton') private googleButton!: ElementRef<HTMLElement>;
  readonly googleLoading = signal(true);
  readonly googleLoadError = signal(false);
  /** Solo authCoreV2: cada propósito usa su propio intento y nonce (D-06). */
  private readonly flags = inject(FEATURE_FLAGS);
  readonly authCoreV2 = this.flags.authCoreV2;
  readonly googlePurpose = signal<GoogleAttemptPurpose>('login');

  /** Operación visible. Cada una usa su propio propósito de Google (intento y nonce propios) y su propio formulario. */
  readonly mode = signal<AuthMode>('signin');
  readonly signInView = signal<SignInView>('password');

  /** Contraseñas activas (ms-users `users.password.enabled` + flag del build); sin ellas no hay formulario de contraseña. */
  readonly passwordAuthAvailable =
    inject(FEATURE_FLAGS).authCoreV2 && inject(FEATURE_FLAGS).authCoreV2Adapter === 'http'
    && inject(FEATURE_FLAGS).passwordAuth === true;

  /** Cambia entre «Iniciar sesión» y «Crear cuenta»; pide un intento de Google nuevo para el propósito nuevo. */
  selectMode(mode: AuthMode): void {
    if (this.mode() === mode || this.submitting() || this.sendingLink() || this.signingIn()) return;
    this.mode.set(mode);
    this.signInView.set('password');
    this.resetFeedback();
    this.linkSentTo.set(null);
    this.recoverySentTo.set(null);
    this.emailFormOpen.set(false);
    this.passwordForm.reset();
    this.recoveryForm.reset();
    this.loginForm.reset();
    this.googlePurpose.set(mode === 'signin' ? 'login' : 'register');
    if (this.authCoreV2 && this.googleButtonReady) void this.loadGoogleButton();
  }

  /** Flechas izquierda/derecha entre las dos pestañas (patrón WAI-ARIA de tabs). */
  onTabKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    this.selectMode(this.mode() === 'signin' ? 'signup' : 'signin');
    (event.currentTarget as HTMLElement | null)?.parentElement
      ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  }

  private resetFeedback(): void {
    this.error.set(false);
    this.errorMessage.set('');
  }

  ngAfterViewInit(): void {
    this.googleButtonReady = true;
    void this.loadGoogleButton();
  }

  async loadGoogleButton(): Promise<void> {
    await this.renderGoogleButton(this.themeService.theme(), true);
  }

  /**
   * Cambio de tema: solo se vuelve a dibujar el botón oficial con el mismo intento (sin otro nonce ni otro botón). Si
   * no hay uno vigente, se renderiza completo.
   */
  private restyleGoogleButton(theme: 'light' | 'dark'): void {
    if (this.renderingGoogleButton || this.submitting()) return;
    if (!this.googleAuth.restyleButton(this.googleButton.nativeElement, googleThemeFor(theme))) {
      void this.renderGoogleButton(theme, false);
    }
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
      }, googleThemeFor(theme), this.googlePurpose());
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
      // Registro Google: si Google no aportó nombre y apellidos, se piden solo esos datos (nunca usuario ni contraseña).
      const destination = this.authCoreV2 && this.flags.authCoreV2Adapter === 'http'
        ? await landingAfterSignIn(this.injector)
        : '/';
      if (!await this.router.navigate([destination])) throw new Error('No fue posible abrir MarketTec.');
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

  readonly emailLoginAvailable = this.authCoreV2 && inject(FEATURE_FLAGS).emailLinkAuth !== false;

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

  // ---- Contraseña ---------------------------------------------------------------------------------------------

  readonly signingIn = signal(false);
  readonly showPassword = signal(false);
  /** Dirección a la que se pidió el enlace de recuperación (solo para el mensaje de confirmación). */
  readonly recoverySentTo = signal<string | null>(null);
  readonly recovering = signal(false);

  readonly passwordForm = this.formBuilder.group({
    correo: this.formBuilder.control('', [
      Validators.required,
      Validators.email,
      (control) => this.validateInstitutionalEmail(control)
    ]),
    contrasena: this.formBuilder.control('', [Validators.required, Validators.maxLength(256)])
  });

  readonly recoveryForm = this.formBuilder.group({
    correo: this.formBuilder.control('', [
      Validators.required,
      Validators.email,
      (control) => this.validateInstitutionalEmail(control)
    ])
  });

  togglePasswordVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }

  openRecovery(): void {
    this.resetFeedback();
    this.recoveryForm.controls.correo.setValue(this.passwordForm.controls.correo.value);
    this.recoverySentTo.set(null);
    this.signInView.set('recovery');
  }

  backToPasswordSignIn(): void {
    this.resetFeedback();
    this.recoverySentTo.set(null);
    this.signInView.set('password');
  }

  /** `POST /v1/auth/password/login`: sin Magic Link. La contraseña no se conserva tras el envío. */
  async submitPassword(): Promise<void> {
    this.resetFeedback();
    if (this.passwordForm.invalid || this.signingIn() || this.submitting() || !this.session) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { correo, contrasena } = this.passwordForm.getRawValue();
    this.signingIn.set(true);
    let signedIn = false;
    try {
      await this.session.signInWithPassword(this.loginService.normalizeEmail(correo), contrasena);
      signedIn = true;
      this.passwordForm.controls.contrasena.reset();
      if (!await this.router.navigate([await landingAfterSignIn(this.injector)])) throw new Error('No fue posible abrir MarketTec.');
    } catch (error) {
      this.error.set(true);
      this.errorMessage.set(signedIn ? 'Ingresaste, pero no fue posible abrir MarketTec. Recarga la página.'
        : describePasswordLoginFailure(error));
      if (!signedIn) this.passwordForm.controls.contrasena.reset();
    } finally {
      this.signingIn.set(false);
    }
  }

  /** `POST /v1/auth/password/recovery/requests`: acuse idéntico para cualquier dirección institucional. */
  async submitRecovery(): Promise<void> {
    this.resetFeedback();
    if (this.recoveryForm.invalid || this.recovering() || !this.session) {
      this.recoveryForm.markAllAsTouched();
      return;
    }

    const correo = this.loginService.normalizeEmail(this.recoveryForm.getRawValue().correo);
    this.recovering.set(true);
    try {
      await this.session.requestPasswordRecovery(correo);
      this.recoverySentTo.set(correo);
    } catch (error) {
      this.error.set(true);
      this.errorMessage.set(describeRecoveryRequestFailure(error));
    } finally {
      this.recovering.set(false);
    }
  }

  isFieldInvalid(form: 'password' | 'recovery', controlName: 'correo' | 'contrasena'): boolean {
    const group = form === 'password' ? this.passwordForm : this.recoveryForm;
    const control = (group.controls as Record<string, AbstractControl>)[controlName];

    return !!control && control.invalid && (control.dirty || control.touched);
  }

  hasFieldError(form: 'password' | 'recovery', controlName: 'correo' | 'contrasena', errorName: string): boolean {
    const group = form === 'password' ? this.passwordForm : this.recoveryForm;
    const control = (group.controls as Record<string, AbstractControl>)[controlName];

    return this.isFieldInvalid(form, controlName) && !!control?.hasError(errorName);
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
