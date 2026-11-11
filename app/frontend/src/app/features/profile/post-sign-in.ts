import { Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { needsNames } from './profile-completion';
import { UserService } from './services/user.service';

/**
 * Destino tras un inicio de sesión o registro con ms-users: `/registro/datos` si a la cuenta le faltan nombre o
 * apellidos, la portada en otro caso. Si el perfil no se puede consultar se entra igualmente: completar los datos
 * nunca bloquea el acceso.
 */
export async function landingAfterSignIn(injector: Injector): Promise<string> {
  try {
    const user = await firstValueFrom(injector.get(UserService).getMyProfile());

    return needsNames(user) ? '/registro/datos' : '/';
  } catch {
    return '/';
  }
}
