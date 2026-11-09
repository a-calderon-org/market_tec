/**
 * MTEC-37: plazo absoluto (epoch ms) de UNA operación de sesión, compartido por el coordinador, el adaptador HTTP y
 * — a través de `X-MTEC-Client-Budget-Ms` — el proxy same-origin.
 *
 * El coordinador crea el `AbortSignal` de cada operación y le asocia su plazo; el adaptador lo lee del mismo signal
 * para todas las peticiones que haga dentro de esa operación (p. ej. logout: espera del lock, `GET /session` y
 * `POST /logout`). Así ninguna petición interna estrena un presupuesto propio: lo que quede es lo que hay.
 * Se guarda en un `WeakMap` para no cambiar la firma del puerto ni retener signals ya descartados.
 */
const deadlines = new WeakMap<AbortSignal, number>();

export function bindDeadline(signal: AbortSignal, deadlineMs: number): void {
  deadlines.set(signal, deadlineMs);
}

export function deadlineOf(signal: AbortSignal | undefined): number | undefined {
  return signal ? deadlines.get(signal) : undefined;
}
