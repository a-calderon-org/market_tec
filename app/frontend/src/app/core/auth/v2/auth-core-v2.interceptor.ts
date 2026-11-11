import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { apiVersionlessPath } from '../../api/api-url';
import {
  CATALOG_GOOGLE_AUTHORIZATION_HEADER,
  catalogApiBase,
  isCatalogOperation,
} from '../../api/catalog-api';
import { GoogleCatalogCredential } from './google-catalog-credential';
import { isBearerRoute } from './bearer-routes';
import { blockedOwnOriginPath, isExplicitStaticRead } from './business-destination';
import {
  AUTH_V2_BUSINESS_TRANSPORT,
  BusinessTransportBlockedError,
  isRestrictedBusinessOperation,
} from './business-transport';
import { AuthRequiredError } from './auth-contract';
import { AuthSessionService } from './auth-session.service';
import { bearerHeaderName } from './auth-v2-config';
import { FEATURE_FLAGS } from '../../feature-flags';

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
 * - Con el adaptador HTTP real (`restricted`) solo salen hacia la API las
 *   operaciones exactas de `isRestrictedBusinessOperation` (GET/PUT `/me/profile`);
 *   cualquier otra ruta o método del mismo origen se bloquea antes de `next()`.
 * - Publicaciones: las operaciones exactas de `isCatalogOperation` hacia `catalogApiBaseUrl` salen con el ID
 *   Token de Google en memoria (`GoogleCatalogCredential`), nunca con el JWT interno. Sin token, no salen.
 *   Con `catalogInternalJwt` (ms-catalog propio) salen en cambio con el JWT interno, nunca con el de Google,
 *   e incluyen `PUT /publicaciones/{id}`.
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

  const transport = inject(AUTH_V2_BUSINESS_TRANSPORT);

  const catalogBase = catalogApiBase();
  const catalogInternalJwt = inject(FEATURE_FLAGS).catalogInternalJwt === true;

  // Publicaciones con el ms-catalog propio (`catalogInternalJwt`): lista exacta de operaciones, solo con el JWT
  // interno de ms-users (sesión Google o Magic Link) y solo hacia `catalogApiBaseUrl`. Nunca el ID Token de Google.
  if (transport !== 'blocked' && catalogInternalJwt && isCatalogOperation(req.url, req.method, catalogBase, true)) {
    return sendWithInternalJwt(req, next, bearerHeaderName(catalogBase));
  }

  // Publicaciones (proxy same-origin del catálogo heredado): lista exacta de operaciones, solo con el ID Token de
  // Google retenido en memoria. Nunca el JWT interno; las cookies de ms-users las descarta el proxy.
  if (transport !== 'blocked' && !catalogInternalJwt && isCatalogOperation(req.url, req.method, catalogBase)) {
    const googleToken = inject(GoogleCatalogCredential).current();

    if (!googleToken) {
      return throwError(() => new AuthRequiredError('token-unavailable'));
    }

    return next(req.clone({ setHeaders: { [CATALOG_GOOGLE_AUTHORIZATION_HEADER]: `Bearer ${googleToken}` } }));
  }

  // Modo HTTP real: lista exacta de operaciones; lo demás del mismo origen, bloqueado.
  if (transport === 'restricted' && !isExplicitStaticRead(req.url, req.method)) {
    const blocked =
      route !== null
        ? !isRestrictedBusinessOperation(req.method, route)
        : blockedOwnOriginPath(req.url, environment.apiBaseUrl) !== null;

    if (blocked) {
      return throwError(
        () => new BusinessTransportBlockedError(`${req.method} ${route ?? req.url}`),
      );
    }
  }

  // El bloqueo se evalúa ANTES de cualquier retorno temprano: con la API base vacía,
  // raíz o fuera de su prefijo, `route` puede ser null (o cubrirlo todo) aunque la URL
  // sea de negocio.
  if (transport === 'blocked') {
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

  return sendWithInternalJwt(req, next, bearerHeaderName(environment.apiBaseUrl));
};

/** Adjunta el JWT interno vigente (revalidado justo antes de `next`) en `headerName`; nunca reejecuta un 401. */
function sendWithInternalJwt(
  req: Parameters<HttpInterceptorFn>[0],
  next: Parameters<HttpInterceptorFn>[1],
  headerName: string,
): ReturnType<HttpInterceptorFn> {
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

      return next(req.clone({ setHeaders: { [headerName]: `Bearer ${token}` } })).pipe(
        catchError((error: unknown) => {
          // `INVALID_CREDENTIALS` (cambio de contraseña con la actual errónea): ms-users ya aceptó el JWT y solo
          // rechazó la contraseña escrita; no es una pérdida de sesión.
          if (error instanceof HttpErrorResponse && error.status === 401
            && error.error?.error?.code !== 'INVALID_CREDENTIALS') {
            session.handleBusinessUnauthorized(token);
          }

          return throwError(() => error);
        }),
      );
    }),
  );
}
