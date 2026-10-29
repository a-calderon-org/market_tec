# Integración frontend-backend

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
| `GET /chats` | — | `PaginatedResponse<Chat>` | Mensajería |
| `POST /chats/{id}/mensajes` | `{ texto }` | cuerpo ignorado (`void`) | Mensajería |

Los tipos completos están en `features/*/models` y `shared/paginated-response.model.ts`. No hay OpenAPI ni esquemas compartidos. Todos los contratos de negocio están verificados únicamente como consumidores/mocks locales y dependen de un servicio externo no disponible.

El contrato disponible no documenta parámetros server-side de búsqueda, categoría, precio u orden. **Verificado en el cliente:** Home usa únicamente `page` y `pageSize`, recorre secuencialmente todas las páginas indicadas por los metadatos y rechaza una carga incompleta. **No determinado:** el límite real de `pageSize`, el volumen máximo del catálogo y la estabilidad de `totalRecords` en APIM; por eso el filtrado global es correcto en el cliente, pero menos escalable que un contrato server-side.

`Publication.categoria` es un `string` abierto: no existe enum, catálogo de categorías ni mapeo de respuesta versionado. `PublicationService` conserva el valor recibido. **Verificado en código y pruebas:** Home genera sus controles desde esos valores y compara la clave exacta. **No determinado en APIM:** un GET de inspección con la subscription key local respondió 401 sin bearer, por lo que no se confirmaron valores productivos, capitalización, tildes ni categorías adicionales.

## Cabeceras

Para destinos cuyo `URL.origin` coincide exactamente con `apiBaseUrl` y cuyo pathname es la ruta base o un descendiente delimitado por `/`, el interceptor añade `Ocp-Apim-Subscription-Key` si está configurada y `Authorization: Bearer <token>` si existe un token vigente. Una base vacía, nula, con protocolo no HTTP(S) o malformada falla cerrada y no adjunta credenciales; las solicitudes ajenas continúan sin esas cabeceras. Un 401 autenticado invalida únicamente el token enviado y redirige a login, por lo que respuestas tardías no cierran una sesión posterior. CORS debe permitir el origen y ambas cabeceras, pero las políticas APIM no están disponibles.

## Compatibilidad

La forma de las interfaces está **verificada solo en consumidores y mocks de pruebas**. No se ejecutó contra APIM y no puede afirmarse compatibilidad dinámica. El servidor local no registra esas rutas, pero README lo presenta como reservado y declara APIM mocks como arquitectura actual de Fase I; no se considera por sí solo un defecto de integración High.

