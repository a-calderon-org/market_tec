# MTEC-10 / MTEC-15 — Conciliación Angular Auth Core V2 ↔ ms-users (HTTP)

**Fecha:** 2026-11-08. **Estado:** conciliación técnica del cliente. **No** es aprobación de B07, D-04 ni D-06.

## Alcance y método

- **Backend observado:** `a-calderon-org/ms-users-market-tec` `main@08ccf056c975f6ec5d918c4cf76143fb04def7b2`. Se leyeron `GoogleAuthController`, `SessionBootstrapController`, `SessionRefreshController`, `SessionLogoutController`, `UserProfileController`, `ApiErrors`, `BearerRequests`, `ProtectedApiCorsFilter`, `NotFoundController`, `ProfileDetails` y `application.yml`.
- **Contrato comparado:** `contracts/openapi/users.json` `0.3.0-draft` (sin cambios en este incremento).
- **Cliente:** `app/frontend/src/app/core/auth/v2/http-auth-api.adapter.ts`, `features/profile/services/user.service.ts` y `features/profile/models/user-profile-v1.ts`.
- **Evidencia:** `http-auth-api.adapter.spec.ts` (HttpTestingController). Las formas de request y response replican los records Java.
- **Etiquetas:** **Verificado** = leído en Java y cubierto por una prueba Angular. **No verificado** = requiere navegador real o un despliegue que todavía no existe.

## Reglas comunes observadas en Java (Verificado)

| Aspecto | Comportamiento Java | Comportamiento Angular |
|---|---|---|
| Flags | Cada controlador existe solo con su flag (`users.google.http.enabled`, `users.session.http.enabled`, `users.session.refresh.enabled`, `users.session.logout.enabled`, `users.api.http.enabled`). Todos son `false` por defecto. Si el flag está apagado, la ruta cae en `NotFoundController` y responde `404 ROUTE_NOT_FOUND`. | Los códigos 404 y 503 se presentan como "no disponible". No se crea ninguna sesión local. |
| Origen | Exige `request.isSecure()` y un `Origin` presente en la allow-list HTTPS canónica. Si no, responde `403 ORIGIN_DENIED`. | `Origin` lo pone el navegador; Angular nunca lo escribe. |
| Cliente | Exige `X-MTEC-Client: web` (400 en Google y 403 en sesión/refresh/logout cuando falta). | Lo envía en las cinco rutas de autenticación y en el perfil. |
| Sobre de error | `{"error":{"code","message","details","correlationId","timestamp"}}`. `message` es siempre genérico. | `readEnvelopeCode` lee solo `error.code`. `AuthApiError(status, code)`. |
| Cookies | `__Host-mtec-attempt` (300 s) y `__Host-mtec-refresh` son `HttpOnly; Secure; Path=/; SameSite=Lax`. | Angular nunca las lee ni las escribe. Pide `withCredentials: true` solo en las rutas de autenticación. |
| Códigos no emitidos | Java no emite `REGISTRATION_REQUIRED` ni `ACCESS_TOKEN_EXPIRED`. Un JWT inválido produce `401 AUTH_REQUIRED`. | Angular no los interpreta ni los inventa. |

## Operaciones

### 1. Crear intento Google — `POST /v1/auth/attempts` (Verificado)

- **Request:** `{"method":"google","purpose":"login"|"register"}`. `method` es obligatorio y `purpose` opcional (por defecto `login`). Un campo extra produce `400`.
- **Headers:** `Content-Type: application/json` y `X-MTEC-Client: web`. No lleva CSRF ni bearer.
- **Cookies:** la respuesta fija `__Host-mtec-attempt`.
- **Response 200:** `{attemptId(32 hex), method, purpose, expiresAt, csrfToken(64 hex), nonce}`.
- **Códigos:** 400 `INVALID_REQUEST`, 403 `ORIGIN_DENIED`, 503 `AUTH_TEMPORARILY_UNAVAILABLE` (`register` con `users.google.registration.enabled=false`), 404 con el flag apagado.
- **Divergencia con el OpenAPI:** el draft marca `purpose` como obligatorio y Java no. Angular siempre lo envía.
- **Angular:** valida el formato de `attemptId` y `csrfToken`, y que `purpose` sea el pedido. Entrega `nonce` a `google.accounts.id.initialize`. Mantiene el CSRF del intento solo en memoria.

### 2. Intercambiar credencial Google — `POST /v1/auth/google` y `/v1/auth/google/registrations` (Verificado)

- **Request:** exactamente `{"attemptId","credential"}`. Cualquier otro campo produce `400`.
- **Headers:** `X-MTEC-Client: web` y `X-CSRF-Token` = `csrfToken` del intento (Java lo compara con el SHA-256 del secreto de la cookie).
- **Cookies:** requiere `__Host-mtec-attempt`. La respuesta borra esa cookie y fija `__Host-mtec-refresh`.
- **JWT:** la response entrega el JWT interno en `token`. El ID Token de Google solo viaja en el cuerpo de esta petición.
- **Response 200 (`AuthResponse`):** `{token, tokenType:"Bearer", expiresAt, user{userId,email,nombre,fotoPerfil}, session{11 campos}, csrfToken}`.
- **Códigos:** 400 `INVALID_REQUEST`, 401 `AUTH_PROOF_INVALID` (prueba inválida, conflicto de identidad o usuario de dominio inválido), 403 `CSRF_INVALID`/`ORIGIN_DENIED`, 409 `ATTEMPT_CONSUMED`, 410 `ATTEMPT_EXPIRED`, 503 (registro deshabilitado).
- **Angular:**
  - Elige la ruta según el `purpose` del intento: `register` usa `/registrations`.
  - Intercambia el credential una sola vez. Ignora callbacks de GIS de intentos sustituidos o consumidos.
  - Sin reintentos.
  - Navega solo si la sesión se aplicó.
  - Un 401 de login no se convierte en registro: la UI muestra un mensaje genérico con la acción "Crear cuenta con Google".
- **Pendiente:** D-06 (semántica contractual de login/registro y `REGISTRATION_REQUIRED`).

### 3. Consultar sesión — `GET /v1/auth/session` (Verificado)

- **Request:** sin cuerpo. Headers: `X-MTEC-Client: web`. Lleva la cookie `__Host-mtec-refresh`. No lleva CSRF ni bearer.
- **Response 200 (`SessionResponse`):** `{session, user, csrfToken}`. **No entrega JWT.**
- **Códigos:** 401 `REFRESH_INVALID`, 403 `ORIGIN_DENIED`/`FORBIDDEN`.
- **Divergencia con el OpenAPI:** el draft no declara `Origin` como parámetro de esta ruta. Java lo exige igualmente.
- **Angular:** solo se llama dentro del Web Lock (`SessionCoordinator`). Si llegara un `token`, se ignora.

### 4. Refresh — `POST /v1/auth/refresh` (Verificado)

- **Request:** exactamente `{"mode":"rotate"}`. Java rechaza `continue` con 400, aunque el draft lo enumere.
- **Headers:** `X-MTEC-Client: web` y `X-CSRF-Token` (64 hex, el último emitido).
- **Cookies:** lleva `__Host-mtec-refresh` y la respuesta la rota.
- **Response 200:** `AuthResponse` con un JWT y un CSRF nuevos.
- **Códigos:** 400 `INVALID_REQUEST`, 401 `REFRESH_INVALID` (cookie o CSRF ausentes o inválidos, generación anterior según la política C), 403.
- **Angular:**
  - Envía un POST por demanda, dentro del lock.
  - Ante un error, timeout o respuesta perdida, solo reconcilia con `GET /session` y nunca envía un segundo POST.
  - Las demandas concurrentes comparten la misma operación. Si la cookie corresponde a otro usuario o a otra sesión, invalida la generación local y exige autenticación explícita.

### 5. Logout — `POST /v1/auth/logout` (Verificado)

- **Request:** exactamente `{"scope":"current"}`. El draft admite `all` y `reauthenticationProofId`; Java no.
- **Headers:** `X-MTEC-Client: web` y `X-CSRF-Token` (obligatorio si existe la cookie; si falta, `403 CSRF_INVALID`).
- **Cookies:** la respuesta borra `__Host-mtec-refresh`.
- **Response:** `204`.
- **Angular:**
  - Cierra primero la sesión local: limpia el JWT, el CSRF y el usuario, y aborta las peticiones de sesión en vuelo.
  - Avisa a las demás pestañas por `BroadcastChannel`.
  - Con Web Locks, consulta `GET /v1/auth/session` y envía el POST con el CSRF actual solo si la cookie sigue apuntando a la sesión que se cerró. Sin Web Locks intenta el POST con el CSRF local. Un fallo remoto conserva el cierre local y puede dejar activa la cookie.

### 6. Leer perfil propio — `GET /v1/me/profile` (Verificado)

- **Request:** sin cuerpo. Headers: `Authorization: Bearer <JWT interno>` (exactamente uno). Angular añade `X-MTEC-Client: web`, que el OpenAPI declara y Java ignora.
- **Cookies:** ninguna (`withCredentials: false`).
- **CORS:** lo gestiona `ProtectedApiCorsFilter` (permite `Authorization`, `X-MTEC-Client`, `X-CSRF-Token` y `Content-Type`).
- **Response 200 (`UserProfileV1`):** `{id, nombreUsuario, nombre, apellidos, correo, fotoPerfil, fechaRegistro(ISO), createdAt(epoch), verificado, estado:"activo"}`.
- **Códigos:** 401 `AUTH_REQUIRED` (con `WWW-Authenticate: Bearer`), 403 `FORBIDDEN`/`USER_DEACTIVATED`, 404 `USER_NOT_FOUND`.
- **Angular:**
  - `toUser` mapea los campos y descarta `createdAt`.
  - Exige que `id` coincida con el `userId` de la sesión.
  - Sin sesión activa no emite la petición.
  - Si la sesión cambia mientras la petición está en vuelo, descarta el resultado.
  - Un 401 no se reintenta (D-11).

### 7. Editar perfil propio — `PUT /v1/me/profile` (Verificado)

- **Request:** exactamente `{nombreUsuario, nombre, apellidos}`, los tres en texto. Java valida: `nombreUsuario` ≤ 80 y no vacío, `nombre` ≤ 100 y no vacío, `apellidos` ≤ 160 y puede quedar vacío, sin caracteres de control.
- **Headers:** bearer. **No exige CSRF** (a diferencia de `/v1/auth/session/activity` y `/v1/me/auth-methods`).
- **Response 200 (`UpdateUserResponseV1`):** los campos del perfil sin `createdAt`, más `fechaActualizacion` y `message`.
- **Códigos:** 400 `INVALID_REQUEST`, 401 `AUTH_REQUIRED`, 403, 404, 409 `CONCURRENT_MODIFICATION`/`IDENTITY_CONFLICT`.
- **Angular:**
  - Construye el cuerpo con exactamente los tres campos.
  - Los validadores del formulario son más estrictos que los de Java, y eso no causa rechazos.
  - Mensaje específico para 409 `CONCURRENT_MODIFICATION`.
  - Sin reintento.
- **Pendiente:** decidir si una mutación con bearer debe exigir CSRF (B05/B06). Hoy Java no lo exige.

## Configuración y activación

| Modo | Selección | `AuthApiPort` | Transporte de negocio |
|---|---|---|---|
| Apagado (por defecto) | `authCoreV2=false` | No se instancia | Legado sin cambios |
| Mock | `authCoreV2=true` (adaptador `mock`, por defecto) | `MockAuthApiAdapter` solo en builds de desarrollo; en producción falla cerrado | `blocked` |
| HTTP real | `authCoreV2=true`, `authCoreV2Adapter='http'`, `authCoreV2HttpTopologyVerified=true` y `apiBaseUrl` absoluta HTTPS sin credenciales, query ni fragmento (`http://localhost` solo en desarrollo) | `HttpAuthApiAdapter` | `restricted`: solo `GET`/`PUT /me/profile` |

Si falta alguna condición del modo HTTP, la aplicación falla cerrada: no hay sesión real ni simulada. El frontend no envía `Ocp-Apim-Subscription-Key` y no contiene secretos.

## Riesgos y pendientes

1. **D-04 (No verificado):** hosts reales, *same-site* HTTPS, CORS con credenciales y cookies `__Host-` en un navegador. Sin esa evidencia, `authCoreV2HttpTopologyVerified` y los flags `*-verified` de Java deben seguir en `false`.
2. **APIM (No verificado):** el OpenAPI declara `apimSubscriptionKey` en `/v1/me/profile`. Si la ruta pública pasa por APIM con suscripción obligatoria, el navegador no puede cumplirla sin exponer la clave. La política de APIM queda pendiente (MTEC-12).
3. **D-06:** semántica de registro y de los errores de login. La UI expone dos acciones y no deduce si la cuenta existe.
4. **Otros módulos:** `ms-publications`, `chats` y `notificaciones` no validan el JWT interno. Con el modo HTTP quedan bloqueados en el cliente. "Mis publicaciones" muestra un estado explícito de no disponible.
5. **Pruebas pendientes de integración:** Web Locks y `BroadcastChannel` reales entre pestañas, GIS real con nonce, y cookies y CORS contra un ms-users desplegado en HTTPS.
