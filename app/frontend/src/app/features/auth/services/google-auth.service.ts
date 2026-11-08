import { Injectable, inject, linkedSignal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { AuthTokenService } from '../../../core/auth/auth-token.service';
import type { GoogleTokenClaims } from '../../../core/auth/auth-token.service';
import type { AuthenticatedUser, GoogleLoginAttempt } from '../../../core/auth/v2/auth-contract';
import { AuthSessionService } from '../../../core/auth/v2/auth-session.service';
import { FEATURE_FLAGS } from '../../../core/feature-flags';

interface GoogleIdentity {
  initialize(options: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    use_fedcm_for_button?: boolean;
    nonce?: string;
  }): void;
  renderButton(element: HTMLElement, options: Record<string, string | number>): void;
  disableAutoSelect(): void;
}
declare global {
  interface Window { google?: { accounts: { id: GoogleIdentity } } }
}
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}
export type GoogleButtonTheme = 'outline' | 'outline_dark';

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private readonly flags = inject(FEATURE_FLAGS);
  /** Flujo legado: solo existe con authCoreV2=false (no se instancia con el flag activo). */
  private readonly authToken = this.flags.authCoreV2 ? null : inject(AuthTokenService);
  /** Núcleo v2: sesión interna en memoria. Solo existe con authCoreV2=true. */
  private readonly session = this.flags.authCoreV2 ? inject(AuthSessionService) : null;
  private googleAttempt: GoogleLoginAttempt | null = null;

  readonly user = linkedSignal<AuthUser | null>(() =>
    this.session
      ? this.fromInternalUser(this.session.user())
      : this.toUser(this.legacy.claims())
  );

  private get legacy(): AuthTokenService {
    if (!this.authToken) throw new Error('El flujo legado no está disponible con authCoreV2.');

    return this.authToken;
  }

  /** La identidad es el userId interno y opaco; nunca el sub de Google ni el correo. */
  private fromInternalUser(user: AuthenticatedUser | null): AuthUser | null {
    return user
      ? { id: user.userId, email: user.email, name: user.nombre, picture: user.fotoPerfil }
      : null;
  }

  private toUser(claims: GoogleTokenClaims | null): AuthUser | null {
    if (!claims?.sub || !claims.email) return null;

    return {
      id: claims.sub,
      email: claims.email,
      name: claims.name || claims.email,
      picture: claims.picture,
    };
  }

  async renderButton(
    element: HTMLElement,
    callback: (credential: string) => void,
    theme: GoogleButtonTheme = 'outline'
  ): Promise<void> {
    if (!environment.googleClientId) {
      throw new Error('Falta configurar el Client ID de Google.');
    }
    const deadline = Date.now() + 10000;
    while (!window.google?.accounts?.id) {
      if (Date.now() > deadline) {
        throw new Error('No se pudo cargar Google. Revisa tu conexión y vuelve a intentarlo.');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!element.isConnected) return;
    const identity = window.google.accounts.id;
    // v2: el intento debe existir antes de initialize porque su nonce se pasa aquí.
    const attempt = this.session ? await this.session.startGoogleAttempt() : null;
    if (!element.isConnected) return;
    this.googleAttempt = attempt;
    identity.initialize({
      client_id: environment.googleClientId,
      callback: response => { if (element.isConnected) callback(response.credential); },
      use_fedcm_for_button: true,
      ...(attempt ? { nonce: attempt.nonce } : {})
    });
    element.replaceChildren();
    identity.renderButton(element, {
      type: 'standard', theme, size: 'large', text: 'continue_with',
      shape: 'rectangular', logo_alignment: 'left', locale: 'es',
      width: Math.min(400, element.clientWidth || 300)
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    if (!element.firstElementChild) {
      throw new Error(
        `Google no pudo mostrar el botón. Verifica que ${window.location.origin} esté registrado como origen autorizado en Google Cloud y que el navegador no esté bloqueando accounts.google.com.`
      );
    }
  }

  async signIn(credential: string): Promise<void> {
    if (this.session) {
      // El ID Token de Google es transitorio: se intercambia una vez y se descarta.
      const attempt = this.googleAttempt;
      this.googleAttempt = null;

      if (!attempt) {
        throw new Error('El intento de acceso con Google expiró. Inténtalo nuevamente.');
      }

      await this.session.signInWithGoogle(credential, attempt);
      return;
    }

    this.legacy.setToken(credential);

    if (!this.user()) {
      this.legacy.clearToken();
      throw new Error('Google no entregó una identidad válida. Inténtalo nuevamente.');
    }
  }

  async restoreSession(): Promise<boolean> {
    if (this.session) return this.session.restoreSession();

    const user = this.toUser(this.legacy.getClaims());
    this.user.set(user);

    return user !== null;
  }

  async logout(): Promise<void> {
    if (this.session) {
      await this.session.logout();
    } else {
      this.legacy.clearToken();
    }

    window.google?.accounts.id.disableAutoSelect();
  }
}
