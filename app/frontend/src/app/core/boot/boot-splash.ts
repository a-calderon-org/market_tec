import { DestroyRef, DOCUMENT, inject, Injectable, InjectionToken } from '@angular/core';
import {
  Event,
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
} from '@angular/router';
import type { Subscription } from 'rxjs';

/**
 * Pantalla de carga inicial. El marcado y el CSS viven en `src/index.html` para pintarse desde el primer byte del
 * documento, antes de que Angular descargue o arranque. Este módulo la controla una vez que Angular toma el mando:
 * la retira al terminar la primera navegación (incluidos los guards que restauran la sesión) y nunca deja un spinner
 * indefinido.
 */
export const BOOT_SPLASH_ID = 'mtec-boot';

export type BootSplashState = 'loading' | 'slow' | 'failed' | 'done';

/** Textos visibles. `failed` debe coincidir con el que escribe el respaldo previo a Angular en `index.html`. */
export const BOOT_SPLASH_MESSAGES: Readonly<Record<Exclude<BootSplashState, 'done'>, string>> = Object.freeze({
  loading: 'Cargando MarketTEC...',
  slow: 'Estamos preparando los servicios de MarketTEC. Esto puede tardar hasta un minuto.',
  failed: 'Estamos teniendo problemas para conectar con los servicios. Inténtalo nuevamente.',
});

export interface BootSplashTiming {
  /** Sin terminar el arranque tras este plazo se avisa de que puede tardar (arranque en frío del backend). */
  readonly slowNoticeMs: number;
  /**
   * Plazo máximo de la pantalla de carga antes de ofrecer «Reintentar». Supera el arranque en frío medido de ms-users
   * (35-47 s, ver `AUTH_V2_COLD_START_BUDGET_MS`) para no declarar fallo en un arranque lento pero sano.
   */
  readonly failureMs: number;
  /** Duración del desvanecimiento antes de retirar el nodo (coincide con la transición CSS de `index.html`). */
  readonly fadeOutMs: number;
}

export const DEFAULT_BOOT_SPLASH_TIMING: BootSplashTiming = Object.freeze({
  slowNoticeMs: 5_000,
  failureMs: 60_000,
  fadeOutMs: 200,
});

export const BOOT_SPLASH_TIMING = new InjectionToken<BootSplashTiming>('BOOT_SPLASH_TIMING', {
  providedIn: 'root',
  factory: () => DEFAULT_BOOT_SPLASH_TIMING,
});

/** Aplica un estado visual a la pantalla de carga existente. No hace nada si ya no está en el documento. */
export function renderBootSplash(doc: Document, state: BootSplashState): void {
  const element = doc.getElementById(BOOT_SPLASH_ID);
  if (!element) return;

  element.dataset['state'] = state;
  element.setAttribute('aria-busy', String(state === 'loading' || state === 'slow'));

  if (state === 'done') return;

  const message = element.querySelector<HTMLElement>('[data-boot-message]');
  if (message && message.textContent !== BOOT_SPLASH_MESSAGES[state]) {
    message.textContent = BOOT_SPLASH_MESSAGES[state];
  }
}

/**
 * Fallo del arranque de Angular (p. ej. un error de `bootstrapApplication`). Devuelve la pantalla al respaldo de
 * `index.html`, cuyo «Reintentar» recarga el documento: el enrutador ya no existe y no hay otra recuperación posible.
 */
export function showBootFailure(doc: Document): void {
  const element = doc.getElementById(BOOT_SPLASH_ID);
  if (!element) return;

  delete element.dataset['owner'];
  renderBootSplash(doc, 'failed');
}

/**
 * Coordina la retirada de la pantalla de carga con la primera navegación del enrutador.
 *
 * - Inicio rápido: se retira en cuanto termina la primera navegación, sin esperas artificiales.
 * - Inicio lento: pasado `slowNoticeMs` se informa de que el servicio está arrancando; la navegación sigue su curso.
 * - Sin respuesta: pasado `failureMs` se muestra el error con «Reintentar». Reintentar repite la navegación inicial;
 *   la restauración de sesión que dispara su guard se une a la demanda en vuelo del `SessionCoordinator` (una sola por
 *   pestaña), así que no duplica peticiones ni sesiones. Si la navegación original termina mientras se muestra el
 *   error, la aplicación aparece igualmente.
 *
 * Las rutas que no esperan al backend (sin guards, como `/acceso/correo`) terminan su navegación de inmediato y
 * gestionan sus propias esperas: la pantalla no las bloquea.
 */
@Injectable({ providedIn: 'root' })
export class BootSplash {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly timing = inject(BOOT_SPLASH_TIMING);

  private element: HTMLElement | null = null;
  private retryButton: HTMLButtonElement | null = null;
  private subscription: Subscription | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private initialUrl: string | null = null;
  private finished = false;

  private readonly onRetryClick = () => this.retry();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.dispose());
  }

  /** Toma el control de la pantalla de `index.html`. Idempotente; sin pantalla en el documento no hace nada. */
  start(): void {
    if (this.element || this.finished) return;

    const element = this.document.getElementById(BOOT_SPLASH_ID);
    if (!element) {
      this.finished = true;
      return;
    }

    this.element = element;
    // Desde aquí el respaldo de `index.html` ya no recarga la página: Angular decide.
    element.dataset['owner'] = 'app';
    this.retryButton = element.querySelector<HTMLButtonElement>('[data-boot-retry]');
    this.retryButton?.addEventListener('click', this.onRetryClick);

    this.subscription = this.router.events.subscribe((event) => this.onRouterEvent(event));
    this.show('loading');
  }

  /** Estado visual vigente (útil para pruebas y diagnóstico). */
  get state(): BootSplashState {
    return (this.element?.dataset['state'] as BootSplashState | undefined) ?? 'done';
  }

  /** Repite la navegación inicial. Solo actúa desde el estado de error y como mucho una vez por pulsación. */
  retry(): void {
    if (this.finished || this.state !== 'failed' || this.element?.dataset['owner'] !== 'app') return;

    this.show('loading');
    const url = this.initialUrl ?? this.currentDocumentUrl();
    void this.router.navigateByUrl(url).catch(() => undefined);
  }

  private onRouterEvent(event: Event): void {
    if (this.finished) return;

    if (event instanceof NavigationStart) {
      this.initialUrl ??= event.url;
      return;
    }

    if (
      event instanceof NavigationEnd ||
      event instanceof NavigationSkipped ||
      event instanceof NavigationError
    ) {
      this.finish();
      return;
    }

    // Una redirección (p. ej. authGuard → /login) o un reintento que sustituye a la navegación anterior no son el
    // final del arranque: continúa una navegación nueva.
    if (
      event instanceof NavigationCancel &&
      event.code !== NavigationCancellationCode.Redirect &&
      event.code !== NavigationCancellationCode.SupersededByNewNavigation
    ) {
      this.finish();
    }
  }

  private show(state: 'loading' | 'slow' | 'failed'): void {
    this.clearTimers();
    renderBootSplash(this.document, state);

    if (state === 'loading') {
      this.timers.push(
        setTimeout(() => this.show('slow'), this.timing.slowNoticeMs),
        setTimeout(() => this.show('failed'), this.timing.failureMs),
      );
    } else if (state === 'slow') {
      const remaining = Math.max(0, this.timing.failureMs - this.timing.slowNoticeMs);
      this.timers.push(setTimeout(() => this.show('failed'), remaining));
    }
  }

  private finish(): void {
    if (this.finished) return;

    const element = this.element;
    this.dispose();
    if (!element) return;

    renderBootSplash(this.document, 'done');
    setTimeout(() => element.remove(), this.timing.fadeOutMs);
  }

  private dispose(): void {
    this.finished = true;
    this.clearTimers();
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.retryButton?.removeEventListener('click', this.onRetryClick);
    this.retryButton = null;
    this.element = null;
  }

  private clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  private currentDocumentUrl(): string {
    const { pathname, search, hash } = this.document.location;
    return `${pathname}${search}${hash}`;
  }
}
