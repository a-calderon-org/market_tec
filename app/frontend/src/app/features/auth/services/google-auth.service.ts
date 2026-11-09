import { Injectable, inject, linkedSignal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { AuthTokenService } from '../../../core/auth/auth-token.service';
import type { GoogleTokenClaims } from '../../../core/auth/auth-token.service';
import {
  AuthApiError,
  AuthRequiredError,
  type AuthenticatedUser,
  type GoogleAttemptPurpose,
  type GoogleLoginAttempt,
} from '../../../core/auth/v2/auth-contract';
import { AuthSessionService } from '../../../core/auth/v2/auth-session.service';
import { GoogleCatalogCredential } from '../../../core/auth/v2/google-catalog-credential';
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

/**
 * Mensaje para la UI a partir de un fallo del núcleo v2. Solo usa el status y el
 * `error.code` que Java emite; no deduce si la cuenta existe (D-06 pendiente).
 */
export function describeGoogleAuthFailure(error: unknown, purpose: GoogleAttemptPurpose): string {
  if (error instanceof AuthRequiredError) {
    return 'El intento de acceso con Google expiró o se canceló. Inténtalo nuevamente.';
  }

  if (!(error instanceof AuthApiError)) {
    return 'No fue posible ingresar a MarketTec.';
  }

  switch (error.status) {
    case 0:
      return 'No se pudo conectar con el servidor de acceso. Revisa tu conexión e inténtalo nuevamente.';
    case 404:
    case 503:
      return purpose === 'register'
        ? 'La creación de cuentas con Google no está disponible en este momento.'
        : 'El acceso con Google no está disponible en este momento.';
    case 401:
      return purpose === 'register'
        ? 'Google no pudo verificar tu cuenta institucional para crear la cuenta.'
        : 'No se pudo iniciar sesión con esa cuenta de Google. Si aún no tienes cuenta en MarketTEC, usa «Crear cuenta con Google».';
    case 403:
      return 'El servidor de acceso rechazó la solicitud desde este sitio.';
    case 409:
    case 410:
      return 'El intento de acceso con Google expiró. Inténtalo nuevamente.';
    case 429:
      return 'Demasiados intentos. Espera un momento e inténtalo nuevamente.';
    default:
      return 'No fue posible ingresar a MarketTec.';
  }
}

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private readonly flags = inject(FEATURE_FLAGS);
  /** Flujo legado: solo existe con authCoreV2=false (no se instancia con el flag activo). */
  private readonly authToken = this.flags.authCoreV2 ? null : inject(AuthTokenService);
  /** Núcleo v2: sesión interna en memoria. Solo existe con authCoreV2=true. */
  private readonly session = this.flags.authCoreV2 ? inject(AuthSessionService) : null;
  private readonly catalogCredential = this.flags.authCoreV2 ? inject(GoogleCatalogCredential) : null;
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
    theme: GoogleButtonTheme = 'outline',
    purpose: GoogleAttemptPurpose = 'login'
  ): Promise<void> {
    if (!environment.googleClientId) {
      throw new Error('Falta configurar el Client ID de Google.');
    }
    this.googleAttempt = null;
    const deadline = Date.now() + 10000;
    while (!window.google?.accounts?.id) {
      if (Date.now() > deadline) {
        throw new Error('No se pudo cargar Google. Revisa tu conexión y vuelve a intentarlo.');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!element.isConnected) return;
    const identity = window.google.accounts.id;
    // v2: el intento debe existir antes de initialize porque su nonce (emitido por
    // ms-users) se pasa aquí. Un intento previo no consumido queda descartado.
    let attempt: GoogleLoginAttempt | null = null;
    if (this.session) {
      try {
        attempt = await this.session.startGoogleAttempt(purpose);
      } catch (error) {
        throw new Error(describeGoogleAuthFailure(error, purpose));
      }
    }
    if (!element.isConnected) return;
    this.googleAttempt = attempt;
    identity.initialize({
      client_id: environment.googleClientId,
      callback: response => {
        if (element.isConnected && (!this.session || this.googleAttempt === attempt)) {
          callback(response.credential);
        }
      },
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
      // Solo en memoria y solo para publicaciones (`markettec-api-v1` valida tokens de Google, no el JWT interno).
      this.catalogCredential?.hold(credential);
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
      this.googleAttempt = null;
      this.catalogCredential?.clear();
      await this.session.logout();
    } else {
      this.legacy.clearToken();
    }

    window.google?.accounts.id.disableAutoSelect();
  }
}
