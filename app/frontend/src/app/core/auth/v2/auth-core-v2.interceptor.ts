import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { apiVersionlessPath } from '../../api/api-url';
import { isBearerRoute } from './bearer-routes';
import { blockedOwnOriginPath, isExplicitStaticRead } from './business-destination';
import { AUTH_V2_BUSINESS_TRANSPORT, BusinessTransportBlockedError } from './business-transport';
import { AuthRequiredError } from './auth-contract';
import { AuthSessionService } from './auth-session.service';

/**
 * Interceptor del núcleo v2 (flag `authCoreV2`), política D-11:
 *
 * - Adjunta el JWT interno en memoria SOLO a rutas de negocio de la API que
 *   están reconocidas explícitamente (`isBearerRoute`). Rutas de sesión, refresh,
 *   logout, intercambio Google, `/.well-known/*`, rutas desconocidas y otros
 *   orígenes pasan sin `Authorization`, con la API base en la raíz o con `/v1`.
 * - Con el transporte de negocio bloqueado (sesión simulada, sin adaptador HTTP
 *   real) NINGUNA petición hacia la API configurada sale: falla cerrado. Esto cubre
 *   también a `HttpClient` directo con la API base vacía o fuera de su prefijo: las
 *   rutas de negocio y las no clasificables del mismo origen se bloquean antes de
 *   cualquier `next()` (ver `blockedOwnOriginPath`), también los prefijos de API
 *   solos (`/api`, `/v1/`). Pasan sin credenciales: lecturas GET/HEAD de estáticos
 *   explícitos (`/favicon.ico`, `/assets/*`), `/auth/*`, `/.well-known/*` y otros orígenes.
 * - NO envía `Ocp-Apim-Subscription-Key` ni ninguna clave de APIM.
 * - `401` de negocio: se propaga el error y se gestiona la pérdida de sesión; la
 *   petición original NUNCA se reejecuta (GET, POST, PUT, PATCH ni DELETE).
 * - `403` es una denegación: se propaga tal cual, sin refresh ni reintento.
 * - No se interpreta `AUTH_REQUIRED` ni se asume un código `ACCESS_TOKEN_EXPIRED`.
 *
 * Si no hay JWT vigente, solicita uno como máximo una vez por demanda antes del
 * primer envío (no es una repetición de un 401). Si no se obtiene, la petición
 * no se envía y falla con `AuthRequiredError`. Justo antes de `next()` se
 * revalida, de forma síncrona, que el JWT siga siendo el de la misma generación
 * de sesión (un logout intermedio impide el despacho).
 */
export const authCoreV2Interceptor: HttpInterceptorFn = (req, next) => {
  const route = apiVersionlessPath(req.url, environment.apiBaseUrl);

  const transportBlocked = inject(AUTH_V2_BUSINESS_TRANSPORT) === 'blocked';

  // El bloqueo se evalúa ANTES de cualquier retorno temprano: con la API base vacía,
  // raíz o fuera de su prefijo, `route` puede ser null (o cubrirlo todo) aunque la URL
  // sea de negocio.
  if (transportBlocked) {
    // Única excepción: lecturas GET/HEAD de estáticos explícitos del propio frontend
    // (`/favicon.ico`, `/assets/*`), sin credenciales. Nunca autoriza escrituras.
    if (isExplicitStaticRead(req.url, req.method)) {
      return next(req);
    }

    const target = route ?? blockedOwnOriginPath(req.url, environment.apiBaseUrl);

    if (target !== null) {
      return throwError(() => new BusinessTransportBlockedError(`${req.method} ${target}`));
    }
  }

  // Otro origen o recurso que no es de la API: jamás lleva credenciales de la SPA.
  if (route === null) {
    return next(req);
  }

  if (!isBearerRoute(route)) {
    return next(req);
  }

  const session = inject(AuthSessionService);

  return from(session.acquireAccessCredential()).pipe(
    switchMap((credential) => {
      // Sin ningún punto asíncrono entre esta revalidación y el despacho de `next`.
      const token = credential ? session.revalidate(credential) : null;

      if (!token) {
        const reason =
          session.status() === 'reauthentication-required'
            ? 'reauthentication-required'
            : session.status() === 'closed'
              ? 'cancelled'
              : credential
                ? 'cancelled'
                : 'token-unavailable';

        return throwError(() => new AuthRequiredError(reason));
      }

      return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })).pipe(
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 401) {
            session.handleBusinessUnauthorized(token);
          }

          return throwError(() => error);
        }),
      );
    }),
  );
};
