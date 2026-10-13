# Frontend: gestión de estado

## Estado global por servicios singleton

- `GoogleAuthService.user`: identidad derivada del token.
- `AuthTokenService`: token en `sessionStorage` bajo `google_token`.
- `ThemeService`: preferencia en `localStorage` y `data-theme` del documento.
- `PublicationFeedbackService`: aviso efímero de creación con temporizador de seis segundos.

## Estado por componente

Signals y `computed` mantienen carga, error, filtros, selección y datos. Los formularios usan Reactive Forms. Las suscripciones HTTP completan tras una respuesta; no se observó store externo.

## Persistencia y sincronización

- Mensajes enviados se agregan a `sessionMessages` en memoria y desaparecen al recargar.
- Filtros, página y selección no se serializan en URL.
- Perfil y “mis publicaciones” usan `USR-001`, no `GoogleAuthService.user().id`.
- La búsqueda/estadísticas operan sobre los `items` ya recibidos, no sobre el total remoto.
- La expiración del token se detecta al volver a llamar `getToken`; no existe temporizador y el signal `GoogleAuthService.user` no se limpia automáticamente en ese punto.

