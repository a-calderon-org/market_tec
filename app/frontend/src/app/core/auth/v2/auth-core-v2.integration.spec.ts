import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { GoogleAuthService } from '../../../features/auth/services/google-auth.service';
import { User } from '../../../features/profile/models/user.model';
import { Profile } from '../../../features/profile/profile';
import { UserService } from '../../../features/profile/services/user.service';
import { MyPublications } from '../../../features/publications/my-publications/my-publications';
import { PublicationService } from '../../../features/publications/services/publication.service';
import { AuthTokenService } from '../auth-token.service';
import { DEFAULT_FEATURE_FLAGS, FEATURE_FLAGS } from '../../feature-flags';
import { AuthApiPort } from './auth-api.port';
import { AuthSessionService } from './auth-session.service';
import { InMemoryLock, SignalHub } from './auth-v2.testing';
import { MOCK_USER, MockAuthApiAdapter, MockAuthBackend } from './mock-auth-api.adapter';
import { failClosedAuthApiPort, provideAuthCoreV2 } from './provide-auth-core-v2';
import { SessionLock } from './session-lock';
import { SessionSignalChannel } from './session-signal-channel';

const profileUser: User = {
  id: 'usr_mock_0001',
  nombreUsuario: 'mock.student',
  nombre: 'Mock',
  apellidos: 'Student',
  correo: 'mock.student@estudiantec.cr',
  fotoPerfil: 'profile.jpg',
  fechaRegistro: '2026-03-15T10:30:00Z',
  verificado: true,
  estado: 'activo',
};

const GOOGLE_SUB = 'google-sub-777';
const GOOGLE_EMAIL = 'google.person@estudiantec.cr';

/** ID Token de Google ficticio con forma de JWT (solo para verificar que no se confunde con la sesión). */
function googleCredential(): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${encode({ alg: 'none' })}.${encode({
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: GOOGLE_SUB,
    email: GOOGLE_EMAIL,
    name: 'Google Person',
  })}.signature`;
}

function stubGoogleIdentity() {
  const captured: { options?: { nonce?: string; callback: (r: { credential: string }) => void } } =
    {};

  window.google = {
    accounts: {
      id: {
        initialize: (options) => (captured.options = options as never),
        renderButton: (element: HTMLElement) => element.appendChild(document.createElement('div')),
        disableAutoSelect: vi.fn(),
      },
    },
  };

  return captured;
}

async function renderAndSignIn(
  service: GoogleAuthService,
  credential = googleCredential(),
): Promise<void> {
  const captured = stubGoogleIdentity();
  const element = document.createElement('div');
  document.body.appendChild(element);

  try {
    let received: string | undefined;
    await service.renderButton(element, (value) => (received = value));
    expect(captured.options?.nonce).toBe('mock-nonce');

    captured.options!.callback({ credential });
    expect(received).toBe(credential);
    await service.signIn(received!);
  } finally {
    element.remove();
  }
}

describe('feature flag authCoreV2', () => {
  it('está apagado por defecto y la configuración por defecto es inmutable', () => {
    expect(TestBed.inject(FEATURE_FLAGS).authCoreV2).toBe(false);
    expect(DEFAULT_FEATURE_FLAGS.authCoreV2).toBe(false);
    expect(Object.isFrozen(DEFAULT_FEATURE_FLAGS)).toBe(true);
  });

  it('el puerto de autenticación es el mock en dev y falla cerrado cuando no es dev', () => {
    TestBed.configureTestingModule({ providers: provideAuthCoreV2() });

    expect(TestBed.inject(AuthApiPort)).toBeInstanceOf(MockAuthApiAdapter);
    expect(() => failClosedAuthApiPort()).toThrow(/producci/);
  });
});

describe('authCoreV2=false conserva el flujo anterior', () => {
  const router = { navigate: vi.fn().mockResolvedValue(true) };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        // Si el flujo legado tocara el núcleo v2, esta inyección fallaría.
        {
          provide: AuthApiPort,
          useFactory: () => {
            throw new Error('authCoreV2 no debe inyectarse con el flag apagado');
          },
        },
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(AuthTokenService).clearToken();
    delete window.google;
  });

  it('el ID Token de Google sigue siendo la sesión y la identidad sigue siendo su sub', async () => {
    const service = TestBed.inject(GoogleAuthService);
    const credential = googleCredential();

    await service.signIn(credential);

    expect(sessionStorage.getItem('google_token')).toBe(credential);
    expect(service.user()?.id).toBe(GOOGLE_SUB);
    expect(await service.restoreSession()).toBe(true);
  });

  it('el perfil sigue usando el identificador heredado', () => {
    const userService = { getUser: vi.fn().mockReturnValue(of(profileUser)), updateUser: vi.fn() };
    TestBed.overrideProvider(UserService, { useValue: userService });
    TestBed.configureTestingModule({ providers: [provideRouter([])] });

    TestBed.createComponent(Profile).detectChanges();

    expect(userService.getUser).toHaveBeenCalledWith('USR-001');
  });
});

describe('authCoreV2=true (mock provisional)', () => {
  let backend: MockAuthBackend;
  const router = { navigate: vi.fn().mockResolvedValue(true) };

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    router.navigate.mockClear();
    backend = new MockAuthBackend();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: FEATURE_FLAGS, useValue: { authCoreV2: true } },
        { provide: AuthApiPort, useValue: new MockAuthApiAdapter(backend) },
        { provide: SessionLock, useValue: new InMemoryLock() },
        { provide: SessionSignalChannel, useValue: new SignalHub().channelFor({}) },
      ],
    });
  });

  afterEach(() => {
    delete window.google;
    vi.restoreAllMocks();
  });

  describe('identidad interna', () => {
    it('usa el userId interno y opaco, no el sub de Google, el correo ni USR-001', async () => {
      const service = TestBed.inject(GoogleAuthService);

      await renderAndSignIn(service);

      expect(service.user()?.id).toBe(MOCK_USER.userId);
      expect(service.user()?.id).not.toBe(GOOGLE_SUB);
      expect(service.user()?.id).not.toBe(GOOGLE_EMAIL);
      expect(service.user()?.id).not.toBe('USR-001');
      // El correo y el nombre vienen de la sesión interna, no de los claims de Google.
      expect(service.user()?.email).toBe(MOCK_USER.email);
      expect(service.user()?.email).not.toBe(GOOGLE_EMAIL);
    });

    it('el ID Token de Google se descarta: no es el access JWT ni queda en el estado de sesión', async () => {
      const service = TestBed.inject(GoogleAuthService);
      const credential = googleCredential();

      await renderAndSignIn(service, credential);

      const token = await TestBed.inject(AuthSessionService).getAccessToken();
      expect(token).toMatch(/^mock-access-/);
      expect(token).not.toBe(credential);
      expect(JSON.stringify(service.user())).not.toContain(credential);
    });

    it('un intento de Google se consume una sola vez', async () => {
      const service = TestBed.inject(GoogleAuthService);
      await renderAndSignIn(service);

      await expect(service.signIn(googleCredential())).rejects.toThrow(/expir/);
    });

    it('restaura la sesión tras recargar (memoria vacía) con GET /session y un único refresh', async () => {
      backend.startSession();
      const service = TestBed.inject(GoogleAuthService);

      expect(service.user()).toBeNull();
      expect(await service.restoreSession()).toBe(true);

      expect(service.user()?.id).toBe(MOCK_USER.userId);
      expect(backend.stats).toMatchObject({ sessionGets: 1, refreshPosts: 1 });
    });

    it('sin sesión, restoreSession devuelve false', async () => {
      expect(await TestBed.inject(GoogleAuthService).restoreSession()).toBe(false);
    });

    it('logout limpia la identidad y no deja restaurar', async () => {
      const service = TestBed.inject(GoogleAuthService);
      await renderAndSignIn(service);
      const disableAutoSelect = window.google!.accounts.id.disableAutoSelect;

      await service.logout();

      expect(service.user()).toBeNull();
      expect(disableAutoSelect).toHaveBeenCalled();
      expect(await service.restoreSession()).toBe(false);
      expect(backend.hasSession).toBe(false);
    });

    it('un ID Token heredado en sessionStorage no se acepta como sesión y se elimina', () => {
      sessionStorage.setItem('google_token', googleCredential());

      const service = TestBed.inject(GoogleAuthService);
      TestBed.inject(AuthSessionService);

      expect(service.user()).toBeNull();
      expect(sessionStorage.getItem('google_token')).toBeNull();
    });
  });

  describe('sin almacenamiento persistente', () => {
    it('JWT, CSRF y credenciales no se escriben en localStorage ni sessionStorage', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const service = TestBed.inject(GoogleAuthService);
      await renderAndSignIn(service);
      await TestBed.inject(AuthSessionService).getAccessToken();
      backend.scriptRefresh('refresh-invalid');
      await TestBed.inject(AuthSessionService).logout();

      expect(setItem).not.toHaveBeenCalled();
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
    });

    it('ninguna cookie accesible desde JavaScript contiene credenciales', async () => {
      await renderAndSignIn(TestBed.inject(GoogleAuthService));

      expect(document.cookie).not.toMatch(/mock-access|mock-csrf|google/i);
    });
  });

  describe('rutas migradas sin cambiar contratos pendientes', () => {
    it('Perfil consulta con el userId interno de la sesión (no con USR-001)', async () => {
      const userService = {
        getUser: vi.fn().mockReturnValue(of(profileUser)),
        updateUser: vi.fn(),
      };
      TestBed.overrideProvider(UserService, { useValue: userService });
      await renderAndSignIn(TestBed.inject(GoogleAuthService));

      TestBed.createComponent(Profile).detectChanges();

      expect(userService.getUser).toHaveBeenCalledTimes(1);
      expect(userService.getUser).toHaveBeenCalledWith(MOCK_USER.userId);
      expect(userService.getUser).not.toHaveBeenCalledWith('USR-001');
    });

    it('Perfil sin sesión no consulta nada y muestra el error', () => {
      const userService = { getUser: vi.fn(), updateUser: vi.fn() };
      TestBed.overrideProvider(UserService, { useValue: userService });

      const fixture = TestBed.createComponent(Profile);
      fixture.detectChanges();

      expect(userService.getUser).not.toHaveBeenCalled();
      expect(fixture.componentInstance.error()).toBe(true);
      expect(fixture.componentInstance.loading()).toBe(false);
    });

    it('Mis publicaciones queda sin consultar con USR-001 (contrato Catalog pendiente)', async () => {
      const publicationService = { getUserPublications: vi.fn() };
      TestBed.overrideProvider(PublicationService, { useValue: publicationService });
      await renderAndSignIn(TestBed.inject(GoogleAuthService));

      const fixture = TestBed.createComponent(MyPublications);
      fixture.detectChanges();

      expect(publicationService.getUserPublications).not.toHaveBeenCalled();
      expect(fixture.componentInstance.error()).toBe(true);
      expect(fixture.componentInstance.loading()).toBe(false);
    });
  });
});
