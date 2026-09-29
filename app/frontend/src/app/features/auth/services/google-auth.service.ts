import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface GoogleIdentity {
  initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void;
  renderButton(element: HTMLElement, options: Record<string, string | number>): void;
  disableAutoSelect(): void;
}
declare global {
  interface Window { google?: { accounts: { id: GoogleIdentity } } }
}
export interface AuthUser { id: string; email: string; name: string }

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private readonly http = inject(HttpClient);
  readonly user = signal<AuthUser | null>(null);

  async renderButton(element: HTMLElement, callback: (credential: string) => void): Promise<void> {
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
      callback: response => { if (element.isConnected) callback(response.credential); }
    });
    element.replaceChildren();
    identity.renderButton(element, {
      theme: 'outline', size: 'large', text: 'continue_with', locale: 'es',
      width: Math.min(400, element.clientWidth || 300)
    });
  }

  async signIn(credential: string): Promise<void> {
    const result = await firstValueFrom(this.http.post<{ user: AuthUser }>(
      '/api/auth/google', { credential }, { withCredentials: true }
    ));
    this.user.set(result.user);
  }

  async restoreSession(): Promise<boolean> {
    try {
      const result = await firstValueFrom(this.http.get<{ user: AuthUser }>(
        '/api/auth/me', { withCredentials: true }
      ));
      this.user.set(result.user);
      return true;
    } catch {
      this.user.set(null);
      return false;
    }
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', {}, { withCredentials: true }));
    this.user.set(null);
    sessionStorage.removeItem('google_token');
    window.google?.accounts.id.disableAutoSelect();
  }
}
