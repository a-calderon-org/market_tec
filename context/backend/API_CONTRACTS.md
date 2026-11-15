# Backend: contratos API

## API de publicaciones de ms-catalog

`GET /v1/publicaciones?propias=true` devuelve la página de publicaciones del
propietario identificado por el JWT interno. El filtro `estado` se admite en
esta consulta, junto con búsqueda, categoría y orden.

`DELETE /v1/publicaciones/{id}` elimina la publicación propia y devuelve `204` sin cuerpo. La propiedad se obtiene del JWT interno. Una publicación inexistente devuelve `404` y un cambio concurrente devuelve `409`.

`PUT /v1/publicaciones/{publicationId}` admite un cuerpo con solo `estado` para que
el propietario cambie su publicación a `activo`, `pausada` o `vendida`. Devuelve el
detalle actualizado y conserva el contenido y las imágenes.

**Verificado en código:** `npm start` monta listado, detalle, alta y actualización
con configuración explícita. El [contrato Catalog](../../contracts/openapi/catalog.json)
define DTO, respuestas y filtros. La [guía de ms-catalog](../../app/ms-catalog/README.md#mtec-32--api-http-de-publicaciones)
documenta el arranque con Cosmos y las pruebas pendientes en staging.

## Contrato implementado localmente

### `GET /api/health`

- Autenticación: ninguna.
- Parámetros: ninguno.
- Respuesta verificada por código: HTTP 200, JSON `{ "status": "ok" }`.
- Evidencia: `app/backend/src/app.ts:9-13`.

No hay contrato explícito para 404 o errores.

## Contratos no implementados aquí

El frontend solicita `/publicaciones`, `/publicaciones/{id}`, `/usuarios/{id}/publicaciones`, `/usuarios/{id}`, `/chats` y `/chats/{id}/mensajes`. Ninguno está registrado en `app/backend/src/app.ts`. Consulte [contratos de integración](../integration/FRONTEND_BACKEND.md).

