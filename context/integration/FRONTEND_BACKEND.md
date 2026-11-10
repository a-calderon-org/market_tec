# Integración frontend-backend

**Extension MTEC-32 de escritura:** POST/PUT locales preservan el body de alta
Angular y agregan imagenes opcionales; vendedor/propietario se resuelven desde
composicion confiable. No se cambio el cliente Angular ni su destino. Ver
[contrato Catalog en revision](../../contracts/openapi/catalog.json) y
[pruebas de servicio](../../app/ms-catalog/README.md).

**MTEC-32, Verificado localmente:** ms-catalog valida el JWT interno de ms-users y,
configurado, expone listado, detalle, alta y actualizacion en su arranque normal.
No esta desplegado, no cambia APIM y no hay prueba E2E con Angular; ver
[autenticacion real](../../app/ms-catalog/README.md#autenticacion-real-con-el-jwt-interno-de-ms-users).

## Topología real

La SPA no apunta automáticamente a `app/backend`. Todas las peticiones feature usan `environment.apiBaseUrl`; CI lo obtiene de `MARKET_TEC_API_URL`. El backend local solo tiene `/api/health` y no participa en esas llamadas.

## Contratos consumidos por el frontend

| Método y ruta relativa | Solicitud | Respuesta esperada | Consumidor |
|---|---|---|---|
| `GET /publicaciones?page&pageSize` | enteros; Home solicita inicialmente 100 y continúa con el tamaño efectivo indicado por `pageSize` hasta completar | `PaginatedResponse<Publication>` | Home |
| `GET /publicaciones/{id}` | id string | `PublicationDetail` | Detalle |
| `POST /publicaciones` | `CreatePublication` | cuerpo ignorado (`void`) | Alta |
| `GET /usuarios/{id}/publicaciones` | id string | `PaginatedResponse<UserPublication>` | Mis publicaciones |
| `GET /usuarios/{id}` | id string | `User` | Perfil |
| `PUT /usuarios/{id}` | `UpdateUser` | `UpdateUserResponse` | Perfil |
| `GET /v1/me/profile` (solo `authCoreV2` + adaptador `http`) | — (JWT interno) | `UserProfileV1` → `User` | Perfil |
| `PUT /v1/me/profile` (solo `authCoreV2` + adaptador `http`) | `UpdateUser` (3 campos) | `UpdateUserResponseV1` → `UpdateUserResponse` | Perfil |
| `GET /chats` | — | `PaginatedResponse<Chat>` | Mensajería |
| `POST /chats/{id}/mensajes` | `{ texto }` | cuerpo ignorado (`void`) | Mensajería |

Los tipos completos están en `features/*/models` y `shared/paginated-response.model.ts`. No hay OpenAPI ni esquemas compartidos. Todos los contratos de negocio están verificados únicamente como consumidores/mocks locales y dependen de un servicio externo no disponible.

El contrato disponible no documenta parámetros server-side de búsqueda, categoría, precio u orden. **Verificado en el cliente:** Home usa únicamente `page` y `pageSize`, recorre secuencialmente todas las páginas indicadas por los metadatos y rechaza una carga incompleta. **No determinado:** el límite real de `pageSize`, el volumen máximo del catálogo y la estabilidad de `totalRecords` en APIM; por eso el filtrado global es correcto en el cliente, pero menos escalable que un contrato server-side.

`Publication.categoria` es un `string` abierto: no existe enum, catálogo de categorías ni mapeo de respuesta versionado. `PublicationService` conserva el valor recibido. **Verificado en código y pruebas:** Home genera sus controles desde esos valores y compara la clave exacta. **No determinado en APIM:** un GET de inspección con la subscription key local respondió 401 sin bearer, por lo que no se confirmaron valores productivos, capitalización, tildes ni categorías adicionales.

## Cabeceras

Para destinos cuyo `URL.origin` coincide exactamente con `apiBaseUrl` y cuyo pathname es la ruta base o un descendiente delimitado por `/`, el interceptor añade `Authorization: Bearer <token>` si existe un token vigente. No envía `Ocp-Apim-Subscription-Key`. Una base vacía, nula, con protocolo no HTTP(S) o malformada falla cerrada y no adjunta credenciales; las solicitudes ajenas continúan sin bearer. Un 401 autenticado invalida únicamente el token enviado y redirige a login, por lo que respuestas tardías no cierran una sesión posterior.

**Verificado en Azure el 2026-11-04:** `markettec-api-v1` conserva `subscriptionRequired=true`; su política de API restringe CORS a localhost y al hostname de producción, valida bearer mediante Google OpenID y limita a 120 llamadas por 60 segundos. Las pruebas a `/publicaciones` y `/chats` respondieron 404 incluso con la subscription key de la API; por tanto, no demuestran el comportamiento de JWT ni compatibilidad funcional. El cambio de cliente no debe desplegarse hasta adaptar y verificar APIM. La política observada valida Google ID tokens, no un JWT interno.

**Decisión de admisión aprobada para MTEC-41:** la SPA usará APIM directamente sin clave en JavaScript, con excepciones públicas por ruta exacta y JWT interno para operaciones protegidas. **Despliegue inicial del 2026-11-09:** `ms-users@08ccf05` implementa emisor/JWKS internos y las 22 rutas del OpenAPI detrás de flags apagados; la API sin clave `markettec-users-v1` se desplegó en staging con la autenticación cerrada (solo sesión/refresh/logout llegan a ms-users, con flags apagados; D-04 no se cumple con los hosts por defecto); detalle en [`docs/MTEC12_41_MS_USERS_STAGING_HANDOFF.md`](../../docs/MTEC12_41_MS_USERS_STAGING_HANDOFF.md). **Límite del control en APIM:** APIM usa Consumption y su política `rate-limit` solo aplica a solicitudes con subscription key. [Microsoft documenta](https://learn.microsoft.com/en-us/azure/api-management/rate-limit-policy) esa dependencia y [excluye `rate-limit-by-key` de Consumption](https://learn.microsoft.com/en-us/azure/api-management/rate-limit-by-key-policy). Antes de desactivar `subscriptionRequired` se requieren emisor y backend operativos, controles de abuso compatibles con el plan, rutas que respondan y pruebas de acceso/denegación. En ese despliegue inicial no se aplicó un cambio de admisión en Azure.

**Staging posterior:** el [paquete versionado de APIM](../../infra/apim/staging/README.md) registra el perfil de Google y Magic Link para `ms-users@be4595c`, con evidencia de protección contra abuso vinculada al OpenAPI de Users.

## Compatibilidad

La forma de las interfaces está **verificada solo en consumidores y mocks de pruebas**. No se ejecutó contra APIM y no puede afirmarse compatibilidad dinámica. El servidor local no registra esas rutas, pero README lo presenta como reservado y declara APIM mocks como arquitectura actual de Fase I; no se considera por sí solo un defecto de integración High.

Con `authCoreV2` y el adaptador `http`, la autenticación (`/v1/auth/attempts`, `/v1/auth/google`, `/v1/auth/google/registrations`, `/v1/auth/session`, `/v1/auth/refresh`, `/v1/auth/logout`, `/v1/auth/email/requests`, `/v1/auth/email/confirm`) usa `HttpBackend` con `withCredentials` y nunca lleva bearer. Conciliación por operación en [`docs/MTEC10_AUTH_V2_HTTP_INTEROPERABILITY.md`](../../docs/MTEC10_AUTH_V2_HTTP_INTEROPERABILITY.md).

La solicitud de Magic Link pasa el dominio del correo a minúsculas y conserva la parte local, igual que `Email.normalized()` en ms-users. Angular comparte el CSRF del intento por `localStorage` durante diez minutos para que otra pestaña pueda confirmar con la cookie del navegador. Al leer un valor caducado, lo elimina. Una confirmación exitosa o un rechazo definitivo limpia el CSRF si todavía corresponde al intento enviado. El `attemptId` y el token del enlace se manejan en memoria.

Publicaciones con `authCoreV2`: `ApiClientService` usa `environment.catalogApiBaseUrl` (proxy same-origin `/api/catalog/v1`, `app/frontend/api/catalog-proxy`) en lugar de `apiBaseUrl` (ms-users). Solo salen `GET /publicaciones`, `GET /publicaciones/{id}` y `POST /publicaciones`, con el ID Token de Google retenido en memoria en `X-MTEC-Google-Authorization`; nunca el JWT interno. El proxy añade la clave APIM desde `MTEC_CATALOG_SUBSCRIPTION_KEY`, reenvía a `MTEC_CATALOG_UPSTREAM` (`markettec-api-v1`) y descarta cookies, CSRF y `X-MTEC-Authorization`. Tras recargar la página no hay token de Google: publicaciones exige volver a iniciar sesión con Google. Una sesión institucional por Magic Link (sin Google) no tiene ese token: publicaciones para esos usuarios requiere adaptar el microservicio dueño del catálogo. «Mis publicaciones» y chats siguen bloqueados (el mock de APIM no conoce la identidad interna).
