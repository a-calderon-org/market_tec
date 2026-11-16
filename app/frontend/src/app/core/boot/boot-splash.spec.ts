import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanActivateFn, provideRouter, Router, Routes } from '@angular/router';
import { vi } from 'vitest';
import { AuthApiPort } from '../auth/v2/auth-api.port';
import { AuthApiError, type AuthResponse, type SessionResponse } from '../auth/v2/auth-contract';
import { InMemoryLock, SignalHub } from '../auth/v2/auth-v2.testing';
import { MockAuthApiAdapter } from '../auth/v2/mock-auth-api.adapter';
import { SessionLock } from '../auth/v2/session-lock';
import { SessionSignalChannel } from '../auth/v2/session-signal-channel';
import { DEFAULT_FEATURE_FLAGS, FEATURE_FLAGS } from '../feature-flags';
import { authGuard, guestGuard } from '../../features/auth/auth.guard';
import {
  BOOT_SPLASH_ID,
  BOOT_SPLASH_MESSAGES,
  BOOT_SPLASH_TIMING,
  BootSplash,
  showBootFailure,
} from './boot-splash';

const TIMING = { slowNoticeMs: 5_000, failureMs: 60_000, fadeOutMs: 200 };
/** Las pruebas corren en Node (Vitest + jsdom); el proyecto no declara `@types/node`, así que se tipa lo mínimo. */
declare const process: {
  cwd(): string;
  getBuiltinModule(id: 'node:fs'): { readFileSync(path: string, encoding: 'utf8'): string };
};
const INDEX_HTML = process.getBuiltinModule('node:fs').readFileSync(`${process.cwd()}/src/index.html`, 'utf8');

@Component({ template: '<p>pantalla</p>' })
class Screen {}

/** Copia en el documento de prueba la pantalla de carga REAL de `src/index.html`. */
function mountSplashFromIndexHtml(): HTMLElement {
  const parsed = new DOMParser().parseFromString(INDEX_HTML, 'text/html');
  const splash = parsed.getElementById(BOOT_SPLASH_ID);
  if (!splash) throw new Error('index.html no contiene la pantalla de carga');

  const element = document.importNode(splash, true) as HTMLElement;
  document.body.prepend(element);
  return element;
}

function splash(): HTMLElement | null {
  return document.getElementById(BOOT_SPLASH_ID);
}

function message(): string {
  return splash()?.querySelector('[data-boot-message]')?.textContent?.trim() ?? '';
}

/** Deja correr promesas y temporizadores de Angular sin adelantar los plazos de la pantalla. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
}

describe('pantalla de carga inicial (index.html)', () => {
  it('se pinta desde el documento, antes de <app-root> y de cualquier script de Angular', () => {
    const body = INDEX_HTML.slice(INDEX_HTML.indexOf('<body>'));

    expect(body.indexOf(`id="${BOOT_SPLASH_ID}"`)).toBeGreaterThan(-1);
    expect(body.indexOf(`id="${BOOT_SPLASH_ID}"`)).toBeLessThan(body.indexOf('<app-root>'));
    // El CSS que la hace visible está en línea en <head>: no depende de styles.css ni del bundle.
    expect(INDEX_HTML.slice(0, INDEX_HTML.indexOf('</head>'))).toContain('.mtec-boot {');
  });

  it('es accesible y muestra la marca, el spinner y el mensaje inicial', () => {
    const element = mountSplashFromIndexHtml();

    try {
      const status = element.querySelector('[role="status"]');
      expect(status?.textContent?.trim()).toBe(BOOT_SPLASH_MESSAGES.loading);
      expect(status?.getAttribute('aria-live')).toBe('polite');
      expect(element.getAttribute('aria-busy')).toBe('true');
      expect(element.querySelector('.mtec-boot__spinner')?.getAttribute('aria-hidden')).toBe('true');
      expect(element.querySelector('.mtec-boot__wordmark')?.textContent).toContain('MarketTec');
      expect(element.querySelector('[data-boot-retry]')?.textContent?.trim()).toBe('Reintentar');
    } finally {
      element.remove();
    }
  });

  it('el respaldo previo a Angular usa el mismo mensaje de error que Angular', () => {
    expect(INDEX_HTML).toContain(BOOT_SPLASH_MESSAGES.failed);
  });

  it('no revela detalles internos de la infraestructura', () => {
    for (const text of [INDEX_HTML, ...Object.values(BOOT_SPLASH_MESSAGES)]) {
      expect(text).not.toMatch(/azure|apim|container apps|ms-users|ms-catalog|ms-notifications/i);
    }
  });
});

describe('BootSplash', () => {
  let backendCalls: number;
  let releaseBackend: (authenticated: boolean) => void;
  let backend: Promise<boolean>;
  let releaseLogin: () => void;
  let loginGate: Promise<boolean>;

  /** Simula la restauración de sesión de los guards reales: espera al backend y redirige a /login si no hay sesión. */
  const sessionGuard: CanActivateFn = () => {
    backendCalls++;
    const router = TestBed.inject(Router);
    return backend.then((ok) => ok || router.createUrlTree(['/login']));
  };

  const routes: Routes = [
    { path: '', component: Screen, canActivate: [sessionGuard] },
    // Como guestGuard: /login también espera la comprobación de sesión.
    { path: 'login', component: Screen, canActivate: [() => loginGate] },
    { path: 'acceso/correo', component: Screen },
  ];

  function configure(): { service: BootSplash; router: Router } {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: BOOT_SPLASH_TIMING, useValue: TIMING }],
    });

    return { service: TestBed.inject(BootSplash), router: TestBed.inject(Router) };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    backendCalls = 0;
    backend = new Promise<boolean>((done) => (releaseBackend = done));
    loginGate = new Promise<boolean>((done) => (releaseLogin = () => done(true)));
    mountSplashFromIndexHtml();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    splash()?.remove();
    vi.useRealTimers();
  });

  it('inicio rápido: desaparece al terminar la primera navegación, sin retrasos artificiales', async () => {
    const { service, router } = configure();
    service.start();
    expect(splash()?.dataset['owner']).toBe('app');

    releaseBackend(true);
    await router.navigateByUrl('/');
    await settle();

    expect(splash()?.dataset['state']).toBe('done');
    expect(splash()?.getAttribute('aria-busy')).toBe('false');
    expect(vi.getTimerCount()).toBe(1); // solo el desvanecimiento; ningún aviso pendiente

    await vi.advanceTimersByTimeAsync(TIMING.fadeOutMs);
    expect(splash()).toBeNull();
    expect(router.url).toBe('/');
  });

  it('no bloquea rutas que no esperan al backend', async () => {
    const { service, router } = configure();
    service.start();

    await router.navigateByUrl('/acceso/correo');
    await settle();

    expect(backendCalls).toBe(0);
    expect(splash()?.dataset['state']).toBe('done');
  });

  it('una redirección del guard no la retira antes de tiempo', async () => {
    const { service, router } = configure();
    service.start();

    const navigation = router.navigateByUrl('/');
    await settle();
    expect(splash()?.dataset['state']).toBe('loading');

    releaseBackend(false);
    await settle();
    expect(splash()?.dataset['state']).toBe('loading');

    releaseLogin();
    await navigation;
    await settle();

    expect(router.url).toBe('/login');
    expect(splash()?.dataset['state']).toBe('done');
  });

  it('respuesta lenta: avisa del arranque y luego muestra la aplicación', async () => {
    const { service, router } = configure();
    service.start();
    const navigation = router.navigateByUrl('/');
    await settle();

    await vi.advanceTimersByTimeAsync(TIMING.slowNoticeMs);
    expect(splash()?.dataset['state']).toBe('slow');
    expect(message()).toBe(BOOT_SPLASH_MESSAGES.slow);
    expect(splash()?.getAttribute('aria-busy')).toBe('true');

    releaseBackend(true);
    await navigation;
    await settle();

    expect(splash()?.dataset['state']).toBe('done');
    await vi.advanceTimersByTimeAsync(TIMING.fadeOutMs);
    expect(splash()).toBeNull();
  });

  it('sin respuesta: no deja un spinner indefinido y ofrece Reintentar', async () => {
    const { service, router } = configure();
    service.start();
    void router.navigateByUrl('/');
    await settle();

    await vi.advanceTimersByTimeAsync(TIMING.failureMs);

    expect(splash()?.dataset['state']).toBe('failed');
    expect(message()).toBe(BOOT_SPLASH_MESSAGES.failed);
    expect(splash()?.getAttribute('aria-busy')).toBe('false');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('si la operación original termina mientras se muestra el error, la aplicación aparece', async () => {
    const { service, router } = configure();
    service.start();
    const navigation = router.navigateByUrl('/');
    await settle();
    await vi.advanceTimersByTimeAsync(TIMING.failureMs);
    expect(splash()?.dataset['state']).toBe('failed');

    releaseBackend(true);
    await navigation;
    await settle();

    expect(splash()?.dataset['state']).toBe('done');
  });

  it('Reintentar repite la navegación inicial una sola vez y vuelve a cargar', async () => {
    const { service, router } = configure();
    service.start();
    void router.navigateByUrl('/');
    await settle();
    await vi.advanceTimersByTimeAsync(TIMING.failureMs);
    expect(backendCalls).toBe(1);

    const button = splash()?.querySelector<HTMLButtonElement>('[data-boot-retry]');
    button?.click();
    button?.click(); // la segunda pulsación ya no está en estado de error: se ignora
    await settle();

    expect(backendCalls).toBe(2);
    expect(splash()?.dataset['state']).toBe('loading');
    expect(message()).toBe(BOOT_SPLASH_MESSAGES.loading);

    releaseBackend(true);
    await settle();

    expect(router.url).toBe('/');
    expect(splash()?.dataset['state']).toBe('done');
  });

  it('Reintentar vuelve a aplicar los plazos: otro fallo vuelve a mostrar el error', async () => {
    const { service, router } = configure();
    service.start();
    void router.navigateByUrl('/');
    await settle();
    await vi.advanceTimersByTimeAsync(TIMING.failureMs);

    service.retry();
    await settle();
    await vi.advanceTimersByTimeAsync(TIMING.slowNoticeMs);
    expect(splash()?.dataset['state']).toBe('slow');
    await vi.advanceTimersByTimeAsync(TIMING.failureMs - TIMING.slowNoticeMs);
    expect(splash()?.dataset['state']).toBe('failed');
  });

  it('Reintentar no hace nada mientras se sigue cargando', async () => {
    const { service, router } = configure();
    service.start();
    void router.navigateByUrl('/');
    await settle();

    service.retry();
    await settle();

    expect(backendCalls).toBe(1);
  });

  it('start es idempotente y no hace nada sin pantalla en el documento', () => {
    splash()?.remove();
    const { service } = configure();

    expect(() => {
      service.start();
      service.start();
    }).not.toThrow();
    expect(service.state).toBe('done');
  });

  it('un fallo del arranque de Angular devuelve el control al respaldo que recarga la página', () => {
    const { service } = configure();
    service.start();

    showBootFailure(document);

    expect(splash()?.dataset['state']).toBe('failed');
    expect(splash()?.dataset['owner']).toBeUndefined();
    expect(message()).toBe(BOOT_SPLASH_MESSAGES.failed);
  });
});

describe('BootSplash con la restauración de sesión real (authCoreV2)', () => {
  let getSessionCalls: number;
  let refreshCalls: number;
  let answerGetSession: (error: AuthApiError) => void;

  class SlowSessionAdapter extends MockAuthApiAdapter {
    override getSession(): Promise<SessionResponse> {
      // Solo la primera consulta queda pendiente (arranque en frío); las siguientes contestan «sin sesión».
      if (getSessionCalls++ > 0) return Promise.reject(new AuthApiError(401, 'SESSION_INVALID'));
      return new Promise<SessionResponse>((_, reject) => (answerGetSession = reject));
    }

    override refresh(): Promise<AuthResponse> {
      refreshCalls++;
      return Promise.reject(new AuthApiError(401, 'REFRESH_INVALID'));
    }
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    getSessionCalls = 0;
    refreshCalls = 0;
    mountSplashFromIndexHtml();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Screen, canActivate: [authGuard] },
          { path: 'login', component: Screen, canActivate: [guestGuard] },
        ]),
        { provide: BOOT_SPLASH_TIMING, useValue: TIMING },
        { provide: FEATURE_FLAGS, useValue: { ...DEFAULT_FEATURE_FLAGS, authCoreV2: true } },
        { provide: AuthApiPort, useFactory: () => new SlowSessionAdapter() },
        { provide: SessionLock, useFactory: () => new InMemoryLock() },
        { provide: SessionSignalChannel, useFactory: () => new SignalHub().channelFor({}) },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    splash()?.remove();
    vi.useRealTimers();
  });

  it('Reintentar se une a la restauración en vuelo: no duplica peticiones ni sesiones', async () => {
    const splashService = TestBed.inject(BootSplash);
    const router = TestBed.inject(Router);
    splashService.start();

    void router.navigateByUrl('/');
    await settle();
    await vi.advanceTimersByTimeAsync(TIMING.failureMs);
    expect(splash()?.dataset['state']).toBe('failed');

    splash()?.querySelector<HTMLButtonElement>('[data-boot-retry]')?.click();
    await settle();

    expect(getSessionCalls).toBe(1);
    expect(refreshCalls).toBe(0);
    expect(splash()?.dataset['state']).toBe('loading');

    // El backend contesta que no hay sesión: el flujo de siempre (guestGuard incluido) lleva a /login.
    answerGetSession(new AuthApiError(401, 'SESSION_INVALID'));
    await settle();
    await settle();

    expect(router.url).toBe('/login');
    expect(refreshCalls).toBe(0);
    expect(splash()?.dataset['state']).toBe('done');
  });
});
