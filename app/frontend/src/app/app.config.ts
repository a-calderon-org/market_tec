import {ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { apiKeyInterceptor } from './core/api/api-key.interceptor';
import { provideAuthCoreV2 } from './core/auth/v2/provide-auth-core-v2';
import { BootSplash } from './core/boot/boot-splash';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([apiKeyInterceptor])
    ),
    // Inerte mientras FEATURE_FLAGS.authCoreV2 sea false (valor por defecto).
    ...provideAuthCoreV2(),
    // Retira la pantalla de carga de index.html al terminar la primera navegación (sin bloquear el arranque).
    provideAppInitializer(() => inject(BootSplash).start())
  ]
};