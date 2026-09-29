import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { GoogleAuthService } from './services/google-auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(GoogleAuthService);
  const router = inject(Router);
  return await auth.restoreSession() || router.createUrlTree(['/login']);
};
