import { inject, Injectable } from '@angular/core';
import { AuthSessionService, SessionIdentity } from './auth-session.service';

/** Margen para no enviar un token que caducaría en tránsito. */
const EXPIRY_MARGIN_MS = 30_000;

function expiresAtMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * ID Token de Google retenido SOLO en memoria para la API de publicaciones (`markettec-api-v1` valida tokens de
 * Google, no el JWT interno). Queda ligado a la identidad interna con la que se inició sesión: un logout, otra
 * generación de sesión u otro usuario lo invalidan, igual que su `exp`. Nunca se persiste ni se envía a ms-users.
 * Tras recargar la página no existe: publicaciones exige volver a iniciar sesión con Google.
 */
@Injectable({ providedIn: 'root' })
export class GoogleCatalogCredential {
  private readonly session = inject(AuthSessionService);
  private held: { token: string; expiresAt: number; identity: SessionIdentity } | null = null;

  hold(token: string): void {
    const expiresAt = expiresAtMs(token);
    const identity = this.session.currentIdentity();
    this.held = expiresAt !== null && identity ? { token, expiresAt, identity } : null;
  }

  current(): string | null {
    const held = this.held;
    if (!held) return null;
    if (held.expiresAt - EXPIRY_MARGIN_MS <= Date.now() || !this.session.isCurrentIdentity(held.identity)) {
      this.held = null;
      return null;
    }
    return held.token;
  }

  clear(): void {
    this.held = null;
  }
}
