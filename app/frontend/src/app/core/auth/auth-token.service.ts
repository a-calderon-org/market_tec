import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

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
  private readonly router = inject(Router, { optional: true });
  private readonly currentToken = signal<string | null>(null);
  private expirationTimer: ReturnType<typeof setTimeout> | null = null;

  readonly claims = computed<GoogleTokenClaims | null>(() => {
    const token = this.currentToken();

    return token ? this.decode(token) : null;
  });

  constructor() {
    const storedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);

    if (storedToken && this.isValid(storedToken)) {
      this.activateToken(storedToken);
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }

  setToken(token: string): void {
    if (!this.isValid(token)) {
      this.clearToken();
      return;
    }

    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    this.activateToken(token);
  }

  getToken(): string | null {
    const token = this.currentToken();

    if (!token || !this.isValid(token)) {
      this.clearToken(token ?? undefined);
      return null;
    }

    return token;
  }

  clearToken(expectedToken?: string): boolean {
    const token = this.currentToken();

    if (expectedToken !== undefined && token !== expectedToken) {
      return false;
    }

    this.cancelExpiration();
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    this.currentToken.set(null);
    return token !== null;
  }

  invalidateToken(expectedToken: string): boolean {
    if (!this.clearToken(expectedToken)) {
      return false;
    }

    void this.router?.navigate(['/login']);
    return true;
  }

  getClaims(): GoogleTokenClaims | null {
    return this.getToken() ? this.claims() : null;
  }

  private activateToken(token: string): void {
    const expiration = this.decode(token)?.exp;

    if (typeof expiration !== 'number') {
      this.clearToken();
      return;
    }

    this.cancelExpiration();
    this.currentToken.set(token);

    const delay = expiration * 1000 - Date.now();

    if (delay <= 0) {
      this.invalidateToken(token);
      return;
    }

    this.expirationTimer = setTimeout(() => {
      this.expirationTimer = null;
      this.invalidateToken(token);
    }, delay);
  }

  private cancelExpiration(): void {
    if (this.expirationTimer !== null) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = null;
    }
  }

  private isValid(token: string): boolean {
    const payload = this.decode(token);

    return (
      typeof payload?.exp === 'number' &&
      Number.isFinite(payload.exp) &&
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
