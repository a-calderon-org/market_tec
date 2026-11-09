import { Injectable } from '@angular/core';

/**
 * Señales entre pestañas (D-07). Solo llevan el tipo del evento: nunca JWT,
 * CSRF, refresh token, identidad ni ningún dato de sesión, y no son un mutex.
 */
export type SessionSignal = { readonly type: 'session-rotated' } | { readonly type: 'logout' };

export abstract class SessionSignalChannel {
  abstract post(signal: SessionSignal): void;
  /** Devuelve la función que cancela la suscripción. */
  abstract subscribe(listener: (signal: SessionSignal) => void): () => void;
}

export const SESSION_SIGNAL_CHANNEL_NAME = 'markettec.auth.signals';

const SIGNAL_TYPES: readonly SessionSignal['type'][] = ['session-rotated', 'logout'];

/** Acepta únicamente `{type}` con un tipo conocido; descarta cualquier otra forma. */
export function parseSessionSignal(data: unknown): SessionSignal | null {
  if (typeof data !== 'object' || data === null) return null;

  const keys = Object.keys(data);
  const type = (data as { type?: unknown }).type;

  if (keys.length !== 1 || keys[0] !== 'type') return null;

  return SIGNAL_TYPES.includes(type as SessionSignal['type']) ? ({ type } as SessionSignal) : null;
}

@Injectable()
export class BroadcastSessionSignalChannel extends SessionSignalChannel {
  private readonly channel: BroadcastChannel | null =
    typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel(SESSION_SIGNAL_CHANNEL_NAME);

  post(signal: SessionSignal): void {
    // Se reconstruye el mensaje para que no viaje nada más que el tipo.
    this.channel?.postMessage({ type: signal.type });
  }

  subscribe(listener: (signal: SessionSignal) => void): () => void {
    const channel = this.channel;
    if (!channel) return () => undefined;

    const handler = (event: MessageEvent) => {
      const signal = parseSessionSignal(event.data);
      if (signal) listener(signal);
    };

    channel.addEventListener('message', handler);

    return () => channel.removeEventListener('message', handler);
  }
}
