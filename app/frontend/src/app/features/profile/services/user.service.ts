import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { ApiClientService } from '../../../core/api/api-client.service';
import { UpdateUser, UpdateUserResponse, User } from '../models/user.model';

/**
 * El identificador no puede viajar como un único segmento de ruta (`.` o `..`):
 * `encodeURIComponent` no los altera y el navegador/URL los colapsa, de modo que
 * `/usuarios/..` acabaría en otro recurso. No se envía ninguna petición.
 */
export class InvalidPathSegmentError extends Error {
  constructor() {
    super('Identificador no válido como segmento de ruta.');
    this.name = 'InvalidPathSegmentError';
  }
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly apiClient =
    inject(ApiClientService);

  /**
   * El `userId` es opaco: se codifica como UN solo segmento de ruta para que `/`,
   * `?` o `#` no se interpreten como separadores. La ruta con identificador es la
   * vigente hoy; su reconciliación definitiva (p. ej. `/me/profile`) corresponde a B07.
   */
  private userPath(
    id: string
  ): string | null {
    // Los segmentos de punto no se neutralizan con codificación: se rechazan.
    if (id === '.' || id === '..') {
      return null;
    }

    return `/usuarios/${encodeURIComponent(id)}`;
  }

  getUser(
    id: string
  ): Observable<User> {
    const path = this.userPath(id);

    return path === null
      ? throwError(() => new InvalidPathSegmentError())
      : this.apiClient.get<User>(path);
  }

  updateUser(
    id: string,
    user: UpdateUser
  ): Observable<UpdateUserResponse> {
    const path = this.userPath(id);

    return path === null
      ? throwError(() => new InvalidPathSegmentError())
      : this.apiClient.put<UpdateUserResponse>(path, user);
  }
}