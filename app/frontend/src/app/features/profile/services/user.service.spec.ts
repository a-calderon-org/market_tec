import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { vi } from 'vitest';
import { ApiClientService } from '../../../core/api/api-client.service';
import { UpdateUser, UpdateUserResponse, User } from '../models/user.model';
import { InvalidPathSegmentError, UserService } from './user.service';

describe('UserService', () => {
  let service:
    UserService;

  const apiClientMock = {
    get:
      vi.fn(),

    put:
      vi.fn()
  };

  beforeEach(() => {
    apiClientMock
      .get
      .mockReset();

    apiClientMock
      .put
      .mockReset();

    TestBed.configureTestingModule({
      providers: [
        UserService,
        {
          provide:
            ApiClientService,

          useValue:
            apiClientMock
        }
      ]
    });

    service =
      TestBed.inject(
        UserService
      );
  });

  it('should create the service', () => {
    expect(
      service
    ).toBeTruthy();
  });

  it('should get a user by id', async () => {
    const user:
      User = {
        id:
          'USR-001',

        nombreUsuario:
          'sebastianMR',

        nombre:
          'Sebastián',

        apellidos:
          'Murillo Rojas',

        correo:
          'sebastian.murillo@estudiantec.cr',

        fotoPerfil:
          'profile.jpg',

        fechaRegistro:
          '2026-03-15T10:30:00Z',

        verificado:
          true,

        estado:
          'activo'
      };

    apiClientMock
      .get
      .mockReturnValue(
        of(user)
      );

    const result =
      await firstValueFrom(
        service.getUser(
          'USR-001'
        )
      );

    expect(
      apiClientMock.get
    ).toHaveBeenCalledWith(
      '/usuarios/USR-001'
    );

    expect(
      result
    ).toEqual(user);
  });

  it('should update a user', async () => {
    const payload:
      UpdateUser = {
        nombreUsuario:
          'sebastianMR',

        nombre:
          'Sebastián',

        apellidos:
          'Murillo Rojas'
      };

    const response:
      UpdateUserResponse = {
        id:
          'USR-001',

        nombreUsuario:
          'sebastianMR',

        nombre:
          'Sebastián',

        apellidos:
          'Murillo Rojas',

        correo:
          'sebastian.murillo@estudiantec.cr',

        fotoPerfil:
          'profile.jpg',

        fechaRegistro:
          '2026-03-15T10:30:00Z',

        fechaActualizacion:
          '2026-09-25T21:45:00Z',

        verificado:
          true,

        estado:
          'activo',

        message:
          'Perfil actualizado correctamente.'
      };

    apiClientMock
      .put
      .mockReturnValue(
        of(response)
      );

    const result =
      await firstValueFrom(
        service.updateUser(
          'USR-001',
          payload
        )
      );

    expect(
      apiClientMock.put
    ).toHaveBeenCalledWith(
      '/usuarios/USR-001',
      payload
    );

    expect(
      result
    ).toEqual(response);
  });

  describe('codificación del identificador opaco (P2-01)', () => {
    const hostile = 'a/b?c#d';
    const encoded = 'a%2Fb%3Fc%23d';

    it('getUser codifica el userId como un único segmento', async () => {
      apiClientMock.get.mockReturnValue(of({}));

      await firstValueFrom(service.getUser(hostile));

      expect(apiClientMock.get).toHaveBeenCalledWith(`/usuarios/${encoded}`);
    });

    it('updateUser codifica el userId como un único segmento', async () => {
      apiClientMock.put.mockReturnValue(of({}));
      const payload: UpdateUser = { nombreUsuario: 'u', nombre: 'n', apellidos: 'a' };

      await firstValueFrom(service.updateUser(hostile, payload));

      expect(apiClientMock.put).toHaveBeenCalledWith(`/usuarios/${encoded}`, payload);
    });

    it('la ruta resultante no interpreta /, ? ni # como separadores', async () => {
      apiClientMock.get.mockReturnValue(of({}));
      await firstValueFrom(service.getUser(hostile));

      const path = apiClientMock.get.mock.calls[0][0] as string;
      const url = new URL(path, 'https://api.example.test/v1');

      expect(url.pathname).toBe(`/usuarios/${encoded}`);
      expect(url.pathname.split('/').filter(Boolean)).toEqual(['usuarios', encoded]);
      expect(url.search).toBe('');
      expect(url.hash).toBe('');
    });

    for (const dots of ['.', '..']) {
      it(`P2: el segmento "${dots}" se rechaza sin emitir ninguna petición (getUser y updateUser)`, async () => {
        // Prueba de que el riesgo es real: codificar no impide el colapso del segmento.
        expect(encodeURIComponent(dots)).toBe(dots);
        expect(
          new URL(`/usuarios/${encodeURIComponent(dots)}`, 'https://api.example.test/v1').pathname,
        ).toBe(dots === '.' ? '/usuarios/' : '/');

        const payload: UpdateUser = { nombreUsuario: 'u', nombre: 'n', apellidos: 'a' };

        await expect(firstValueFrom(service.getUser(dots))).rejects.toBeInstanceOf(
          InvalidPathSegmentError,
        );
        await expect(firstValueFrom(service.updateUser(dots, payload))).rejects.toBeInstanceOf(
          InvalidPathSegmentError,
        );
        expect(apiClientMock.get).not.toHaveBeenCalled();
        expect(apiClientMock.put).not.toHaveBeenCalled();
      });
    }

    it('P2: los identificadores que solo contienen puntos junto a otros caracteres no se rechazan', async () => {
      apiClientMock.get.mockReturnValue(of({}));

      for (const id of ['...', 'a.b', '.a', 'a..']) {
        await firstValueFrom(service.getUser(id));
        expect(apiClientMock.get).toHaveBeenLastCalledWith(`/usuarios/${encodeURIComponent(id)}`);
      }
    });

    it('los identificadores internos habituales no cambian', async () => {
      apiClientMock.get.mockReturnValue(of({}));

      await firstValueFrom(service.getUser('usr_mock_0001'));

      expect(apiClientMock.get).toHaveBeenCalledWith('/usuarios/usr_mock_0001');
    });
  });
});
