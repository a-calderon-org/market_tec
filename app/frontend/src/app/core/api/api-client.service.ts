import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AUTH_V2_BUSINESS_TRANSPORT,
  BusinessTransportBlockedError
} from '../auth/v2/business-transport';
import { FEATURE_FLAGS } from '../feature-flags';
import { catalogApiBase } from './catalog-api';

@Injectable({
  providedIn: 'root'
})
export class ApiClientService {
  private readonly http = inject(HttpClient);
  private readonly authCoreV2 = inject(FEATURE_FLAGS).authCoreV2;
  /**
   * authCoreV2: `apiBaseUrl` es ms-users (sesión y perfil) y no atiende publicaciones; el negocio va al proxy del
   * catálogo. Sin `catalogApiBaseUrl` se conserva `apiBaseUrl` y el interceptor sigue bloqueando el negocio.
   */
  private readonly baseUrl = (this.authCoreV2 && catalogApiBase()) || environment.apiBaseUrl;
  private readonly businessTransport = inject(AUTH_V2_BUSINESS_TRANSPORT);

  /**
   * Con authCoreV2 y sin adaptador HTTP real (sesión simulada) no se emite ninguna
   * petición de negocio, ni siquiera sin Authorization: enviar el userId o el
   * cuerpo a un destino real ya es una fuga. Con authCoreV2=false no cambia nada.
   */
  private blocked(endpoint: string): Observable<never> | null {
    return this.authCoreV2 && this.businessTransport === 'blocked'
      ? throwError(() => new BusinessTransportBlockedError(endpoint))
      : null;
  }

  get<T>(
    endpoint: string,
    params?: HttpParams
  ): Observable<T> {
    return this.blocked(endpoint) ?? this.http.get<T>(
      `${this.baseUrl}${endpoint}`,
      { params }
    );
  }

  post<T>(endpoint: string, body: unknown): Observable<T> {
    return this.blocked(endpoint) ?? this.http.post<T>(
      `${this.baseUrl}${endpoint}`,
      body
    );
  }

  put<T>(endpoint: string, body: unknown): Observable<T> {
    return this.blocked(endpoint) ?? this.http.put<T>(
      `${this.baseUrl}${endpoint}`,
      body
    );
  }

  delete<T>(endpoint: string): Observable<T> {
    return this.blocked(endpoint) ?? this.http.delete<T>(
      `${this.baseUrl}${endpoint}`
    );
  }
}