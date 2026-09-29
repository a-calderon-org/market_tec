import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { Profile } from './profile';
import { User } from './models/user.model';
import { UserService } from './services/user.service';
import { GoogleAuthService } from '../auth/services/google-auth.service';

describe('Profile', () => {
  let fixture:
    ComponentFixture<Profile>;

  let component:
    Profile;

  let router:
    Router;

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

  const userServiceMock = {
    getUser:
      vi.fn(),

    updateUser:
      vi.fn()
  };

  beforeEach(async () => {
    userServiceMock
      .getUser
      .mockReset();

    userServiceMock
      .updateUser
      .mockReset();

    userServiceMock
      .getUser
      .mockReturnValue(
        of(user)
      );

    await TestBed
      .configureTestingModule({
        imports: [
          Profile
        ],

        providers: [
          provideRouter([]),
          { provide: GoogleAuthService, useValue: { logout: vi.fn().mockResolvedValue(undefined) } },

          {
            provide:
              UserService,

            useValue:
              userServiceMock
          }
        ]
      })
      .compileComponents();

    router =
      TestBed.inject(
        Router
      );

    vi.spyOn(
      router,
      'navigate'
    ).mockResolvedValue(true);

    fixture =
      TestBed.createComponent(
        Profile
      );

    component =
      fixture.componentInstance;

    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(
      component
    ).toBeTruthy();
  });

  it('should load the current user', () => {
    expect(
      userServiceMock
        .getUser
    ).toHaveBeenCalledWith(
      'USR-001'
    );

    expect(
      component.user()
    ).toEqual(user);
  });

  it('should populate the form with user data', () => {
    expect(
      component.profileForm
        .getRawValue()
    ).toEqual({
      nombre:
        'Sebastián',

      apellidos:
        'Murillo Rojas',

      nombreUsuario:
        'sebastianMR'
    });
  });

  it('should calculate the full name', () => {
    expect(
      component.fullName()
    ).toBe(
      'Sebastián Murillo Rojas'
    );
  });

  it('should calculate user initials', () => {
    expect(
      component.initials()
    ).toBe(
      'SM'
    );
  });

  it('should not submit an invalid form', () => {
    component.profileForm
      .controls
      .nombre
      .setValue('');

    component.saveProfile();

    expect(
      userServiceMock
        .updateUser
    ).not.toHaveBeenCalled();
  });

  it('should update the profile', () => {
    userServiceMock
        .updateUser
        .mockReturnValue(
        of({
            ...user,

            nombre:
            'Sebastián',

            fechaActualizacion:
            '2026-09-25T21:45:00Z',

            message:
            'Perfil actualizado correctamente.'
        })
        );

    component.profileForm
        .setValue({
        nombre:
            ' Sebastián ',

        apellidos:
            ' Murillo Rojas ',

        nombreUsuario:
            'sebastianMR'
        });

    component.saveProfile();

    expect(
        userServiceMock
        .updateUser
    ).toHaveBeenCalledWith(
        'USR-001',
        {
        nombre:
            'Sebastián',

        apellidos:
            'Murillo Rojas',

        nombreUsuario:
            'sebastianMR'
        }
    );

    expect(
        component.saveSuccess()
    ).toBe(true);

    expect(
        component.saving()
    ).toBe(false);
  });

  it('should show an error when update fails', () => {
    userServiceMock
      .updateUser
      .mockReturnValue(
        throwError(
          () => ({
            error: {
              message:
                'No fue posible actualizar.'
            }
          })
        )
      );

    component.profileForm
      .controls
      .nombre
      .setValue(
        'Sebastián'
      );

    component.profileForm
      .controls
      .apellidos
      .setValue(
        'Murillo Rojas'
      );

    component.profileForm
      .controls
      .nombreUsuario
      .setValue(
        'sebastianMR'
      );

    component.saveProfile();

    expect(
      component.saveError()
    ).toBe(true);

    expect(
      component.saving()
    ).toBe(false);
  });

  it('should use initials when the image fails', () => {
    component.onImageError();

    expect(
      component.imageFailed()
    ).toBe(true);
  });

  it('should set error state when user loading fails', () => {
    userServiceMock
      .getUser
      .mockReturnValue(
        throwError(
          () =>
            new Error(
              'API error'
            )
        )
      );

    component.loadUser();

    expect(
      component.error()
    ).toBe(true);

    expect(
      component.loading()
    ).toBe(false);

    expect(
      component.user()
    ).toBeNull();
  });

  it('should navigate to login when logging out', async () => {
    await component.logout();

    expect(
      router.navigate
    ).toHaveBeenCalledWith(
      ['/login']
    );
  });
});
