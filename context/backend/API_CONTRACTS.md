# Backend: contratos API

## API de publicaciones de ms-catalog

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

