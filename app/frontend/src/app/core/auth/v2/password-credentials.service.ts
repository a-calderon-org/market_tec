import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { versionedApiUrl } from '../../api/api-url';
import { AuthApiError, INVALID_RESPONSE_CODE, PasswordStatus } from './auth-contract';
import { AuthSessionStore } from './auth-session.store';
import { toAuthApiError } from './http-auth-api.adapter';

/**
 * Contraseña institucional de la cuenta autenticada (`/v1/me/password`, ms-users). El JWT interno lo adjunta el
 * interceptor del núcleo v2 (ruta de negocio explícita); el CSRF de sesión viaja solo en las escrituras. El propietario
 * lo deriva el servidor del JWT: el navegador no envía ningún `userId`. Las contraseñas no se guardan ni se registran.
 */
@Injectable({ providedIn: 'root' })
export class PasswordCredentialsService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(AuthSessionStore);

  /** `GET`: ¿ya tiene contraseña y puede configurarse la primera ahora? */
  async status(): Promise<PasswordStatus> {
    const body = await this.call(() => this.http.get<unknown>(this.url(), { headers: this.headers(false) }));
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as Record<string, unknown>)['configured'] !== 'boolean' ||
      typeof (body as Record<string, unknown>)['setupAvailable'] !== 'boolean'
    ) {
      throw new AuthApiError(0, INVALID_RESPONSE_CODE);
    }
    const parsed = body as { configured: boolean; setupAvailable: boolean };

    return { configured: parsed.configured, setupAvailable: parsed.setupAvailable };
  }

  /** `POST`: primera contraseña. Solo con la concesión de un solo uso que deja el enlace confirmado (403 si no). */
  async setInitial(newPassword: string): Promise<void> {
    await this.call(() => this.http.post<unknown>(this.url(), { newPassword }, { headers: this.headers(true) }));
  }

  private async call<T>(request: () => Parameters<typeof firstValueFrom<T>>[0]): Promise<T> {
    try {
      return await firstValueFrom(request());
    } catch (error) {
      throw toAuthApiError(error);
    }
  }

  private url(): string {
    return versionedApiUrl(environment.apiBaseUrl, '/me/password');
  }

  private headers(mutating: boolean): HttpHeaders {
    let headers = new HttpHeaders({ 'X-MTEC-Client': 'web' });
    const csrf = this.store.csrfToken();
    if (mutating && csrf) headers = headers.set('X-CSRF-Token', csrf);

    return headers;
  }
}
