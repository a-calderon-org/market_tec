import { Injectable } from '@angular/core';

const TOKEN_STORAGE_KEY = 'google_token';

export interface GoogleTokenClaims {
  exp?: number;
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthTokenService {
  setToken(token: string): void {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  }

  getToken(): string | null {
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);

    if (!token || !this.isValid(token)) {
      this.clearToken();
      return null;
    }

    return token;
  }

  clearToken(): void {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  getClaims(): GoogleTokenClaims | null {
    const token = this.getToken();

    return token ? this.decode(token) : null;
  }

  private isValid(token: string): boolean {
    const payload = this.decode(token);

    return (
      typeof payload?.exp === 'number' &&
      payload.exp * 1000 > Date.now()
    );
  }

  private decode(token: string): GoogleTokenClaims | null {
    try {
      const parts = token.split('.');

      if (parts.length !== 3) return null;
      const encodedPayload = parts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const padding = '='.repeat((4 - encodedPayload.length % 4) % 4);
      return JSON.parse(
        atob(encodedPayload + padding)
      ) as GoogleTokenClaims;
    } catch {
      return null;
    }
  }
}
