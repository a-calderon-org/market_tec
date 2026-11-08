import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { defer, map, Observable, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiClientService } from '../../../core/api/api-client.service';
import { versionedApiUrl } from '../../../core/api/api-url';
import { AuthRequiredError } from '../../../core/auth/v2/auth-contract';
import { AuthSessionService, SessionIdentity } from '../../../core/auth/v2/auth-session.service';
import { FEATURE_FLAGS } from '../../../core/feature-flags';
import { toUpdateUserResponse, toUser } from '../models/user-profile-v1';
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

  private readonly http = inject(HttpClient);

  /** Solo existe con authCoreV2=true; el flujo legado no la instancia. */
  private readonly session = inject(FEATURE_FLAGS).authCoreV2
    ? inject(AuthSessionService)
    : null;

  /**
   * authCoreV2: `GET /v1/me/profile`. El servidor deriva el usuario del JWT
   * interno; el navegador no envía ningún `userId`. Sin sesión activa no se emite
   * la petición. Si la sesión cambia (logout o cambio de usuario) mientras la
   * respuesta está pendiente, el resultado se descarta con `AuthRequiredError`.
   */
  getMyProfile(): Observable<User> {
    return this.ownProfile((identity) =>
      this.http
        .get<unknown>(this.meProfileUrl(), { headers: this.webClientHeaders() })
        .pipe(map((body) => this.fresh(identity, () => toUser(body, identity.userId)))),
    );
  }

  /** authCoreV2: `PUT /v1/me/profile` con exactamente los tres campos editables. */
  updateMyProfile(user: UpdateUser): Observable<UpdateUserResponse> {
    const body: UpdateUser = {
      nombreUsuario: user.nombreUsuario,
      nombre: user.nombre,
      apellidos: user.apellidos,
    };

    return this.ownProfile((identity) =>
      this.http
        .put<unknown>(this.meProfileUrl(), body, { headers: this.webClientHeaders() })
        .pipe(
          map((response) =>
            this.fresh(identity, () => toUpdateUserResponse(response, identity.userId)),
          ),
        ),
    );
  }

  private ownProfile<T>(request: (identity: SessionIdentity) => Observable<T>): Observable<T> {
    return defer(() => {
      const identity = this.session?.currentIdentity() ?? null;

      return identity
        ? request(identity)
        : throwError(() => new AuthRequiredError('token-unavailable'));
    });
  }

  private fresh<T>(identity: SessionIdentity, mapper: () => T): T {
    if (!this.session?.isCurrentIdentity(identity)) {
      throw new AuthRequiredError('cancelled');
    }

    return mapper();
  }

  private meProfileUrl(): string {
    return versionedApiUrl(environment.apiBaseUrl, '/me/profile');
  }

  private webClientHeaders(): HttpHeaders {
    return new HttpHeaders({ 'X-MTEC-Client': 'web' });
  }

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