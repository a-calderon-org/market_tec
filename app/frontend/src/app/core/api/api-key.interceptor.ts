import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const apiKeyInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }

  const requestWithApiKey = req.clone({
    setHeaders: {
      'Ocp-Apim-Subscription-Key': environment.subscriptionKey
    }
  });

  return next(requestWithApiKey);
};