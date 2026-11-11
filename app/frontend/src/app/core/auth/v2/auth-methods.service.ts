import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { versionedApiUrl } from '../../api/api-url';
import { AuthApiError, INVALID_RESPONSE_CODE } from './auth-contract';
import { toAuthApiError } from './http-auth-api.adapter';

export type AuthMethodProvider = 'google' | 'institutional_email';

/** Identidad vinculada a la cuenta (`AuthApiController.MethodResponse`). */
export interface AuthMethod {
  readonly provider: AuthMethodProvider;
  readonly email: string;
  readonly status: string;
}

/**
 * Métodos de acceso vinculados a la cuenta autenticada (`GET /v1/me/auth-methods`, ms-users). Es el estado real de
 * las identidades, no el método del último inicio de sesión. Solo lectura: la SPA no vincula métodos.
 */
@Injectable({ providedIn: 'root' })
export class AuthMethodsService {
  private readonly http = inject(HttpClient);

  async list(): Promise<readonly AuthMethod[]> {
    let body: unknown;
    try {
      body = await firstValueFrom(
        this.http.get<unknown>(versionedApiUrl(environment.apiBaseUrl, '/me/auth-methods'), {
          headers: new HttpHeaders({ 'X-MTEC-Client': 'web' }),
        }),
      );
    } catch (error) {
      throw toAuthApiError(error);
    }

    const methods = (body as { methods?: unknown } | null)?.methods;
    if (!Array.isArray(methods)) throw new AuthApiError(0, INVALID_RESPONSE_CODE);

    return methods.map((item) => {
      const value = item as Record<string, unknown> | null;
      if (
        typeof value !== 'object' ||
        value === null ||
        (value['provider'] !== 'google' && value['provider'] !== 'institutional_email') ||
        typeof value['email'] !== 'string' ||
        typeof value['status'] !== 'string'
      ) {
        throw new AuthApiError(0, INVALID_RESPONSE_CODE);
      }

      return {
        provider: value['provider'] as AuthMethodProvider,
        email: value['email'] as string,
        status: value['status'] as string,
      };
    });
  }
}
