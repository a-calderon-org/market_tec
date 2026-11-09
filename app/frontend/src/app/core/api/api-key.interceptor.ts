import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthTokenService } from '../auth/auth-token.service';
import { authCoreV2Interceptor } from '../auth/v2/auth-core-v2.interceptor';
import { FEATURE_FLAGS } from '../feature-flags';
import { isAuthorizedApiUrl } from './api-url';

export const apiKeyInterceptor: HttpInterceptorFn = (req, next) => {
  if (inject(FEATURE_FLAGS).authCoreV2) {
    return authCoreV2Interceptor(req, next);
  }

  if (!isAuthorizedApiUrl(req.url, environment.apiBaseUrl)) {
    return next(req);
  }

  const authToken = inject(AuthTokenService);
  const token = authToken.getToken();
  const authenticatedRequest = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && token) {
        authToken.invalidateToken(token);
      }

      return throwError(() => error);
    })
  );
};
