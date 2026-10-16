# Frontend: arquitectura

## Arranque y navegación

`main.ts` usa `bootstrapApplication(App, appConfig)`. `app.config.ts` configura router, `HttpClient`, interceptor y `provideZonelessChangeDetection`. Las rutas se cargan de forma eager y el wildcard vuelve a `/`.

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

El interceptor centraliza únicamente 401. Cada componente mantiene flags y mensajes; algunos exponen mensajes del API (`Profile`), mientras otros usan texto genérico. No hay retry automático, timeout, caché compartida ni telemetría observados. Home permite reintento manual y cancela su carga anterior para invalidar respuestas obsoletas.

## Autenticación

Google GIS entrega un credential. `GoogleAuthService.signIn` lo almacena y lee claims; no realiza una solicitud de validación. `AuthTokenService` solo comprueba estructura y `exp`, no firma/audiencia/emisor. La seguridad final depende de la API externa, cuya configuración no se puede verificar aquí.

