# Backend: contratos API

## Adaptador de lectura ms-catalog en pruebas

**Verificado en codigo:** MTEC-32 agrega un router optativo de lectura a
`app/ms-catalog`, sin modificar `app/backend` ni el arranque normal. Alcance,
respuestas, limites de autenticacion y pruebas manuales en el
[README del servicio](../../app/ms-catalog/README.md#mtec-32--incremento-de-lectura-http-en-pruebas).
El OpenAPI de catalogo sigue Proposed; no hay conformidad productiva.

**Extension local MTEC-32:** la composicion optativa incorpora POST/PUT de
publicaciones, aprobados como interfaces el 2026-11-09.

**Autenticacion con JWT interno, Verificado localmente (2026-11-10):** con las
variables `CATALOG_*`, `npm start` expone listado, detalle, alta y actualizacion
autenticados con el JWT interno de ms-users (Google o Magic Link), segun Catalog
OpenAPI 0.3.0-draft. Propietario = `sub`; `vendedor.id` puede ser `null`; el alta
devuelve 503 `SELLER_PROFILE_UNAVAILABLE` si no obtiene el perfil propio en ms-users.
Almacenamiento solo en memoria. **No desplegado; sin prueba E2E.** Valores de
staging, decisiones pendientes y rotacion en el [README](../../app/ms-catalog/README.md#autenticacion-real-con-el-jwt-interno-de-ms-users).

## Contrato implementado localmente

### `GET /api/health`

- Autenticación: ninguna.
- Parámetros: ninguno.
- Respuesta verificada por código: HTTP 200, JSON `{ "status": "ok" }`.
- Evidencia: `app/backend/src/app.ts:9-13`.

No hay contrato explícito para 404 o errores.

## Contratos no implementados aquí

El frontend solicita `/publicaciones`, `/publicaciones/{id}`, `/usuarios/{id}/publicaciones`, `/usuarios/{id}`, `/chats` y `/chats/{id}/mensajes`. Ninguno está registrado en `app/backend/src/app.ts`. Consulte [contratos de integración](../integration/FRONTEND_BACKEND.md).

