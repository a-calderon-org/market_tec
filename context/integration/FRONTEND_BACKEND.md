# Integración frontend-backend

## Topología real

La SPA no apunta automáticamente a `app/backend`. Todas las peticiones feature usan `environment.apiBaseUrl`; CI lo obtiene de `MARKET_TEC_API_URL`. El backend local solo tiene `/api/health` y no participa en esas llamadas.

## Contratos consumidos por el frontend

| Método y ruta relativa | Solicitud | Respuesta esperada | Consumidor |
|---|---|---|---|
| `GET /publicaciones?page&pageSize` | enteros | `PaginatedResponse<Publication>` | Home |
| `GET /publicaciones/{id}` | id string | `PublicationDetail` | Detalle |
| `POST /publicaciones` | `CreatePublication` | cuerpo ignorado (`void`) | Alta |
| `GET /usuarios/{id}/publicaciones` | id string | `PaginatedResponse<UserPublication>` | Mis publicaciones |
| `GET /usuarios/{id}` | id string | `User` | Perfil |
| `PUT /usuarios/{id}` | `UpdateUser` | `UpdateUserResponse` | Perfil |
| `GET /chats` | — | `PaginatedResponse<Chat>` | Mensajería |
| `POST /chats/{id}/mensajes` | `{ texto }` | cuerpo ignorado (`void`) | Mensajería |

Los tipos completos están en `features/*/models` y `shared/paginated-response.model.ts`. No hay OpenAPI ni esquemas compartidos. Todos los contratos de negocio están verificados únicamente como consumidores/mocks locales y dependen de un servicio externo no disponible.

## Cabeceras

Para URLs que empiezan con `apiBaseUrl`, el interceptor añade `Ocp-Apim-Subscription-Key` siempre y `Authorization: Bearer <token>` si existe. Un 401 limpia el token y redirige a login. CORS debe permitir el origen y ambas cabeceras, pero las políticas APIM no están disponibles.

## Compatibilidad

La forma de las interfaces está **verificada solo en consumidores y mocks de pruebas**. No se ejecutó contra APIM y no puede afirmarse compatibilidad dinámica. El servidor local no registra esas rutas, pero README lo presenta como reservado y declara APIM mocks como arquitectura actual de Fase I; no se considera por sí solo un defecto de integración High.

