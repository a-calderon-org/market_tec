import { Injectable } from '@angular/core';

const KEY = 'mtec.email-link-attempt';
/** Vigencia del intento en ms-users (10 minutos). */
const TTL_MS = 10 * 60 * 1000;
const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * CSRF del intento de Magic Link entre la pestaña que lo pidió y la que abre el enlace.
 *
 * El enlace suele abrirse en otra pestaña, y el CSRF (derivado de la cookie HttpOnly `__Host-mtec-email-attempt`)
 * no puede recalcularse en el navegador. Solo se guarda ese CSRF, que por sí solo no autentica nada: sin la cookie
 * del mismo navegador Java responde `403 CSRF_INVALID`. El `attemptId` y el `token` del enlace nunca se guardan.
 */
@Injectable({ providedIn: 'root' })
export class EmailLinkCsrf {
  save(csrfToken: string): void {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify({ csrfToken, expiresAt: Date.now() + TTL_MS }));
    } catch {
      // Almacenamiento bloqueado: el enlace solo podrá confirmarse en esta misma pestaña.
      this.memory = { csrfToken, expiresAt: Date.now() + TTL_MS };
    }
  }

  /** CSRF vigente del último intento de este navegador, o null. */
  read(): string | null {
    let entry: unknown = this.memory;
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      if (raw) entry = JSON.parse(raw);
    } catch {
      // Ilegible o bloqueado: se usa la copia en memoria, si existe.
    }
    if (typeof entry !== 'object' || entry === null) return null;
    const { csrfToken, expiresAt } = entry as Record<string, unknown>;
    if (typeof csrfToken !== 'string' || !HEX_64.test(csrfToken) || typeof expiresAt !== 'number'
      || expiresAt <= Date.now()) {
      this.clear();
      return null;
    }
    return csrfToken;
  }

  clear(): void {
    this.memory = null;
    try {
      globalThis.localStorage?.removeItem(KEY);
    } catch {
      // Nada que limpiar.
    }
  }

  private memory: { csrfToken: string; expiresAt: number } | null = null;
}
