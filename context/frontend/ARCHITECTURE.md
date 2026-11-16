# Frontend: arquitectura

## Arranque y navegación

`main.ts` usa `bootstrapApplication(App, appConfig)`. `app.config.ts` configura router, `HttpClient`, interceptor y `provideZonelessChangeDetection`. Las rutas se cargan de forma eager y el wildcard vuelve a `/`.

Pantalla de carga inicial: `src/index.html` contiene `#mtec-boot` (marca, spinner y `role="status"`, CSS en línea) visible desde el primer pintado. `core/boot/boot-splash.ts` (`BootSplash`, registrado con `provideAppInitializer`) la retira al terminar la primera navegación —que en rutas con `authGuard`/`guestGuard` espera a `restoreSession()`—, avisa de arranque lento a los 5 s y ofrece «Reintentar» a los 60 s (`BOOT_SPLASH_TIMING`). Reintentar repite la navegación inicial y se une a la demanda en vuelo del `SessionCoordinator`. Si Angular no llega a arrancar, un respaldo en línea de `index.html` muestra el error a los 20 s y su «Reintentar» recarga el documento.

## Capas observadas

```text
plantillas/componentes
        ↓
servicios feature (PublicationService, UserService, ChatService)
        ↓
ApiClientService
        ↓
apiKeyInterceptor
        ↓
Azure APIM
```

Los componentes coordinan además presentación, validación, formato y estado asíncrono. Los modelos son interfaces TypeScript sin validación runtime. Home delega filtrado puro a `HomeFilterService`, persistencia local a `RecentSearchService` y recorrido paginado a `PublicationService`.

## Manejo de errores

El interceptor centraliza únicamente 401 autenticados: invalida el mismo token que llevaba la solicitud y delega la navegación a la fuente de sesión. Cada componente mantiene flags y mensajes; algunos exponen mensajes del API (`Profile`), mientras otros usan texto genérico. No hay retry automático, timeout, caché compartida ni telemetría observados. Home permite reintento manual y cancela su carga anterior para invalidar respuestas obsoletas.

## Autenticación

Google GIS entrega un credential. `GoogleAuthService.signIn` lo almacena y lee claims; no realiza una solicitud de validación. `AuthTokenService` solo comprueba estructura y `exp`, no firma/audiencia/emisor. La seguridad final depende de la API externa, cuya configuración no se puede verificar aquí.

`AuthTokenService` conserva la sesión en `sessionStorage`, programa un temporizador desde `exp` y expone claims reactivos. `GoogleAuthService.user` se deriva de esos claims, por lo que expiración, logout y 401 actualizan la UI y los guards sin mantener una copia independiente. Esto no sustituye la validación criptográfica obligatoria en la API.

