import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { AuthTokenService } from '../../../core/auth/auth-token.service';

interface GoogleIdentity {
  initialize(options: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    use_fedcm_for_button?: boolean;
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
  private readonly authToken = inject(AuthTokenService);
  readonly user = signal<AuthUser | null>(null);

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
    identity.initialize({
      client_id: environment.googleClientId,
      callback: response => { if (element.isConnected) callback(response.credential); },
      use_fedcm_for_button: true
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
    this.authToken.setToken(credential);
    const user = this.readUser();

    if (!user) {
      this.authToken.clearToken();
      throw new Error('Google no entregó una identidad válida. Inténtalo nuevamente.');
    }

    this.user.set(user);
  }

  async restoreSession(): Promise<boolean> {
    const user = this.readUser();

    if (!user) {
      this.user.set(null);
      return false;
    }

    this.user.set(user);
    return true;
  }

  async logout(): Promise<void> {
    this.user.set(null);
    this.authToken.clearToken();
    window.google?.accounts.id.disableAutoSelect();
  }

  private readUser(): AuthUser | null {
    const claims = this.authToken.getClaims();

    if (!claims?.sub || !claims.email) return null;

    return {
      id: claims.sub,
      email: claims.email,
      name: claims.name || claims.email,
      picture: claims.picture
    };
  }
}
