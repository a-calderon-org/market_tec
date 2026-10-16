# Frontend: gestión de estado

## Estado global por servicios singleton

- `GoogleAuthService.user`: identidad derivada del token.
- `AuthTokenService`: token en `sessionStorage` bajo `google_token`.
- `ThemeService`: preferencia en `localStorage` y `data-theme` del documento.
- `PublicationFeedbackService`: aviso efímero de creación con temporizador de seis segundos.
- `RecentSearchService`: últimas diez búsquedas ejecutadas, normalizadas y sin duplicados triviales en `localStorage`; degrada a memoria si el almacenamiento falla.

## Estado por componente

Signals y `computed` mantienen carga, error, filtros, selección y datos. Los formularios usan Reactive Forms. Las suscripciones HTTP completan tras una respuesta; no se observó store externo.

## Persistencia y sincronización

- Mensajes enviados se agregan a `sessionMessages` en memoria y desaparecen al recargar.
- Filtros, página y selección no se serializan en URL. Home separa el texto editable de la consulta registrada en el historial.
- **Verificado:** seleccionar una búsqueda reciente reutiliza `executeSearch`, la mueve al inicio, reinicia la página y cierra el panel. Eliminar enfoca el campo antes de retirar el botón, conserva abierto el panel mientras queden entradas y no cambia la consulta activa. El cierre por foco solo ocurre cuando existe un destino exterior conocido; el puntero exterior se maneja a nivel de documento.
- Perfil y “mis publicaciones” usan `USR-001`, no `GoogleAuthService.user().id`.
- **Verificado:** Home solicita inicialmente hasta 100 publicaciones y continúa con el `pageSize` efectivo informado por APIM, descarta IDs repetidos, falla si no logra reunir `totalRecords` y conserva el catálogo completo en un signal. `filteredPublications` aplica búsqueda, categoría, precios y orden; `publications` pagina después ese resultado en grupos de 12. Los totales se derivan de las coincidencias.
- **Verificado:** `categories` deriva claves únicas del catálogo y `selectedCategory` guarda una de esas claves sin normalización contractual. La comparación sigue siendo igualdad exacta sobre `publication.categoria`; esto evita que etiquetas hardcodeadas queden desacopladas de los datos.
- **Verificado:** cualquier cambio de criterio vuelve a página 1; cambiar página conserva criterios y no emite otra solicitud. Reintentar cancela la carga anterior antes de iniciar otra.
- La expiración del token se detecta al volver a llamar `getToken`; no existe temporizador y el signal `GoogleAuthService.user` no se limpia automáticamente en ese punto.

