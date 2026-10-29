import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthTokenService } from '../auth/auth-token.service';

export const apiKeyInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isAuthorizedApiUrl(req.url, environment.apiBaseUrl)) {
    return next(req);
  }

  const authToken = inject(AuthTokenService);
  const token = authToken.getToken();
  const headers: Record<string, string> = {};

  if (environment.subscriptionKey) {
    headers['Ocp-Apim-Subscription-Key'] = environment.subscriptionKey;
  }

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
      if (error instanceof HttpErrorResponse && error.status === 401 && token) {
        authToken.invalidateToken(token);
      }

      return throwError(() => error);
    })
  );
};

function isAuthorizedApiUrl(requestUrl: string, configuredBaseUrl: unknown): boolean {
  if (typeof configuredBaseUrl !== 'string' || !configuredBaseUrl.trim()) {
    return false;
  }

  try {
    const documentBase = document.baseURI;
    const apiUrl = new URL(configuredBaseUrl, documentBase);
    const destination = new URL(requestUrl, documentBase);

    if (
      !['http:', 'https:'].includes(apiUrl.protocol) ||
      !['http:', 'https:'].includes(destination.protocol) ||
      apiUrl.username ||
      apiUrl.password ||
      apiUrl.search ||
      apiUrl.hash ||
      destination.username ||
      destination.password ||
      destination.origin !== apiUrl.origin
    ) {
      return false;
    }

    const allowedPath = normalizePath(apiUrl.pathname);
    const destinationPath = normalizePath(destination.pathname);

    return (
      allowedPath === '/' ||
      destinationPath === allowedPath ||
      destinationPath.startsWith(`${allowedPath}/`)
    );
  } catch {
    return false;
  }
}

function normalizePath(pathname: string): string {
  const withoutTrailingSlashes = pathname.replace(/\/+$/, '');

  return withoutTrailingSlashes || '/';
}
