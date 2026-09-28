import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { vi } from 'vitest';
import { ApiClientService } from '../../../core/api/api-client.service';
import { UpdateUser, UpdateUserResponse, User } from '../models/user.model';
import { UserService } from './user.service';

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
});