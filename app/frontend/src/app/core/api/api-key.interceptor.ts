import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthTokenService } from '../auth/auth-token.service';

export const apiKeyInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }

  const authToken = inject(AuthTokenService);
  const router = inject(Router);
  const token = authToken.getToken();
  const headers: Record<string, string> = {
    'Ocp-Apim-Subscription-Key': environment.subscriptionKey
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const authenticatedRequest = req.clone({
    setHeaders: {
      ...headers
    }
  });

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401
      ) {
        authToken.clearToken();
        void router.navigate(['/login']);
      }

      return throwError(() => error);
    })
  );
};
