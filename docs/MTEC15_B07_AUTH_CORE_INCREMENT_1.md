# MTEC-15 / B07 — Incremento 1: núcleo de autenticación Angular ↔ ms-users

**Fecha:** 2026-11-07. **Estado:** plan propuesto; nada de lo descrito está aprobado ni implementado. **D-07 (refresh entre pestañas) y D-11 (errores y reintentos) siguen pendientes de aprobación: las secciones 5, 6 y 8 son propuestas en discusión, no algoritmos autorizados.** **Alcance:** Google → intento con nonce → intercambio de credencial → JWT interno → bootstrap de sesión → perfil → refresh `rotate` → logout `current`. **Fuera de alcance:** Magic Link (D-02), actividad (D-03), pruebas y vínculos (D-14), `refresh continue` y `logout all` (D-10), Catalog y Notifications.

Cada paso lleva el id de la decisión abierta en el [registro de decisiones](MTEC15_B07_DECISION_REGISTER.md). Si una decisión cambia, el paso cambia con ella. El flujo está codificado en [`proposed-core-flow.json`](../contracts/examples/auth/proposed-core-flow.json) y comprobado contra el OpenAPI por `test_b07_reconciliation.py`. El comportamiento actual de ms-users está en [`observed-ms-users-2089897.json`](../contracts/examples/auth/observed-ms-users-2089897.json) y las diferencias en la [matriz](MTEC15_B07_RECONCILIATION_MATRIX.md).

## 1. Qué llama Angular y en qué orden

**Ingresar o crear cuenta** (D-06). Dos acciones separadas; cada una crea su propio intento.
1. `POST /v1/auth/attempts` `{method:"google", purpose:"login"|"register"}` con `withCredentials`, `X-MTEC-Client: web`. Guarda `attemptId`, `csrfToken`, `nonce`, `expiresAt` y recibe la cookie `__Host-mtec-attempt`.
2. Con ese `nonce`, `google.accounts.id.initialize({client_id, nonce, callback})` y `renderButton`. El nonce debe estar en `initialize`, así que el intento va **antes** que el botón; si el intento vence (5 min) o se consume, hay que crear otro intento y volver a llamar a `initialize`.
3. En el callback, `POST /v1/auth/google` `{attemptId, credential}` con `X-CSRF-Token` = `csrfToken` del intento y `withCredentials`.
4. La respuesta `AuthResponse` trae `token`, `csrfToken`, `user` y `session`, y fija la cookie `__Host-mtec-refresh`. Angular descarta la credencial Google y el CSRF del intento.
5. Con el bearer interno, `GET /v1/me/profile`.

**Después de ingresar:** el refresh se programa antes del `exp` del JWT (nunca después de `session.expiresAt`); el aviso de sesión usa `session.warningAt`, corrigiendo el reloj con `session.serverTime`. El aviso no renueva nada.

**Salir:** `POST /v1/auth/logout` `{scope:"current"}` con `X-CSRF-Token` de la sesión. Angular limpia la memoria sin esperar la respuesta, llama a `disableAutoSelect()` de GIS y navega a `/login`.

## 2. JWT interno en memoria

- `AuthSessionStore` (nuevo servicio) guarda en `signal`s: `accessToken`, `csrfToken`, `user`, `session`. Nada va a `localStorage`, `sessionStorage` ni IndexedDB; se elimina la clave `google_token` (D-01).
- El `exp` se lee del JWT solo para programar el refresh. No es autoridad: manda el servidor.
- El interceptor adjunta `Authorization: Bearer` únicamente a las rutas de negocio y de perfil, y nunca a las rutas de cookie ni a JWKS/metadata. No se envía ninguna subscription key desde la SPA (MTEC-41).
- `withCredentials: true` solo en las cinco rutas de cookie. Hoy `ApiClientService` no lo configura (A-04).

## 3. El `userId` real

`AuthResponse.user.userId` (y `SessionResponse.user.userId` tras recargar) es la única fuente (D-08). Cambios:
- `GoogleAuthService.user` deja de derivarse del Google `sub`; su `id` pasa a ser el `userId` interno.
- (Seguimiento Jira: MTEC-10; no se modificó Jira.) `profile.ts:25` y `my-publications.ts:29` dejan de usar `'USR-001'`. Perfil: `GET/PUT /v1/me/profile`, sin id en la ruta.
- "Mis publicaciones" no tiene contrato de Catalog que acepte el principal. Mientras no exista, la pantalla queda bloqueada tras el flag; no se inventa un id.

## 4. Cookies HttpOnly, Origin y CSRF

| Elemento | Regla |
|---|---|
| Cookie de intento `__Host-mtec-attempt` | La fija ms-users; Angular no la lee. Se limpia al completar el intercambio. |
| Cookie de refresh `__Host-mtec-refresh` | HttpOnly; Angular no la ve. Se rota en cada refresh. |
| `Origin` | Lo envía el navegador. ms-users compara con una lista exacta de orígenes HTTPS; sin Origin permitido responde 403 `ORIGIN_DENIED`. |
| `X-MTEC-Client: web` | En todos los POST de autenticación y en `GET /v1/auth/session`. |
| CSRF | Intento → `csrfToken` del intento. Sesión → `csrfToken` de `AuthResponse`/`SessionResponse`. Siempre en `X-CSRF-Token`, solo en memoria. |
| SameSite | Java emite `Lax`. Solo válido con hosts *same-site* HTTPS; los flags de topología verificada siguen apagados hasta tener evidencia (D-04). |

## 5. Recuperar la sesión tras recargar (propuesta, D-01 y D-07)

1. La memoria está vacía.
2. Se entra en la sección crítica entre pestañas (sección 6). Dentro de ella: `GET /v1/auth/session` con la cookie. `200` → `user`, `session`, `csrfToken` (sin JWT). `401 REFRESH_INVALID` → no hay sesión: `/login`, sin reintento.
3. Todavía dentro de la sección crítica, un único `POST /v1/auth/refresh` `{mode:"rotate"}` con ese `csrfToken`. `200` → `token` y `csrfToken` nuevos, que se aplican a la memoria antes de salir de la sección.
4. El `authGuard` espera ambos pasos. `GET /v1/auth/session` no cuenta como actividad.

## 6. Dos pestañas y respuestas perdidas (D-07, PENDIENTE; política C)

La política C implica que cada generación de refresh se consume una sola vez y que un 401 aislado no revoca a la ganadora. Lo siguiente es lo que se propone discutir; no está aprobado.

- **Un refresh en vuelo por pestaña** (cola de promesas) y **un único `POST /v1/auth/refresh` por demanda de token**.
- **Exclusión mutua real entre pestañas** (candidato: Web Locks) que cubre juntas las tres operaciones: bootstrap (`GET /session`), refresh y aplicación del resultado a la memoria. `BroadcastChannel` se usa solo para señales (p. ej. "se rotó", "logout"); no es un mutex suficiente.
- **El CSRF se obtiene dentro de la sección crítica**, nunca antes de adquirirla. Si no, la pestaña que esperaba el lock envía el CSRF de la generación anterior y Java lo trata como prueba inválida.
- **No se comparten credenciales entre pestañas.** Cada pestaña obtiene su propio JWT al necesitarlo; compartirlo exige aprobación expresa.
- **Tras un fallo del refresh** (`401 REFRESH_INVALID`, timeout o error de red) se hace `GET /v1/auth/session` **solo para reconciliar el estado**. No se encadena otro POST automáticamente. Si responde `200`, la sesión sigue viva; el siguiente refresh solo ocurre ante una **nueva** demanda de token, dentro de la sección crítica. Si responde `401`, o no se puede recuperar una sesión válida, se reautentica. Con la cookie consumida y la nueva sin llegar no hay gracia (política C).
- **Un `401 REFRESH_INVALID` no cierra por sí mismo la sesión** en otra pestaña: se reconcilia con `GET /session` antes de descartar el estado.
- **Coordinación con logout:** un logout, propio o de otra pestaña, cancela refresh y restauraciones pendientes y marca la sesión local como cerrada, de modo que una restauración tardía no reponga credenciales.
- **Sin bucles ni reintentos automáticos del refresh.**

## 7. Cómo se dejan de usar `USR-001` y el token Google

| Antes | Después |
|---|---|
| `AuthTokenService` guarda el ID Token de Google en `sessionStorage` | `AuthSessionStore` en memoria con el JWT interno |
| `GoogleAuthService.signIn(credential)` guarda el credential como sesión | `AuthApiService.exchange(attemptId, credential)` y descarta el credential |
| El interceptor envía ese bearer a toda la base de la API | Bearer solo a rutas de negocio/perfil |
| `restoreSession()` decodifica el token almacenado | Bootstrap + refresh (sección 5) |
| `USR-001`, Google `sub` | `AuthResponse.user.userId` |

## 8. Errores del servidor en Angular (D-11, PENDIENTE)

- El envelope es `{error:{code,message,details,correlationId,timestamp}}`. En Angular `HttpErrorResponse.error` es el cuerpo, así que el código se lee con `error.error?.error?.code`, nunca de `message` (A-07).
- Se distinguen cuatro casos: **error de red/CORS** (`status === 0`, sin cuerpo), **401**, **403** y **envelope inesperado** (cuerpo ausente, no objeto, o sin `error.code` textual). Un envelope inesperado o un código desconocido produce un error genérico y nunca habilita un fallback a identidad Google.
- La tabla de acciones propuestas está en `errorMap` de [`proposed-core-flow.json`](../contracts/examples/auth/proposed-core-flow.json) y cubre los 21 códigos del OpenAPI más los 9 que Java emite fuera del enum.
- `CSRF_INVALID`, `ATTEMPT_CONSUMED`, `ATTEMPT_EXPIRED` → crear otro intento. `REFRESH_INVALID` → reconciliar con `GET /session` (sección 6). `AUTH_TEMPORARILY_UNAVAILABLE` → mensaje de no disponible (también para `register` con el registro apagado). `FORBIDDEN` → denegación; nunca dispara refresh.
- **`401 AUTH_REQUIRED` en una petición de negocio no dispara automáticamente refresh y repetición de cualquier petición.** El primer incremento solo puede proponer, sujeto a aprobación, un reintento de un `GET` expresamente permitido, **una sola vez**, tras comprobar que el principal y la sesión son los mismos. `PUT /v1/me/profile` y las demás mutaciones quedan excluidas de cualquier política genérica de replay; ante ese 401 se informa o se reautentica.
- `Retry-After` (p. ej. en 429) no es autorización para otro refresh automático.
- Las respuestas 401 de Java traen `WWW-Authenticate: Bearer` aunque el fallo sea de cookie o prueba; Angular no lo usa para decidir.

## 9. Qué impide la exposición prematura

| Capa | Control | Estado |
|---|---|---|
| Angular | Flag `authCoreV2`, apagado por defecto; si está apagado se conserva el comportamiento actual de la aplicación. | A crear en el incremento, con default `false`. |
| ms-users | Todos los flags de HTTP/Google/JWT/sesión apagados; el perfil `sql-*` es obligatorio. | Sin cambios. |
| ms-users | `users.email.enabled` y `users.auth-methods.linking.enabled` apagados, también en pruebas. | Sin cambios (D-02, D-14). |
| ms-users | `users.google.registration.enabled` lo decide el RP (D-06). | Sin cambios. |
| ms-users | `same-site-verified` y `https-topology-verified` solo con hosts reales y prueba de navegador (D-04). | Sin cambios. |
| APIM | `approvals.abuse_protection` y `approvals.ms_users_contract` siguen en `null`; no se despliega ninguna política. | Sin cambios. |
| Contrato | OpenAPI `0.3.0-draft`, `x-contract-status: draft-pending-team-approval`. | Sin cambios. |

No se activa ningún flag, no se despliega y no se toca Azure como parte de este incremento.

## 10. Archivos previstos

**Angular** (`market_tec/app/frontend/src/app`), en un PR propio, tras aprobar D-01, D-06, D-07, D-08 y D-11:
- Nuevos: `core/auth/auth-session.store.ts`, `core/auth/auth-api.service.ts`, `core/auth/refresh-coordinator.ts`, `core/auth/auth-error.mapper.ts`, y sus `*.spec.ts`.
- Modificados: `core/auth/auth-token.service.ts` (se retira `sessionStorage`; puede eliminarse), `core/api/api-key.interceptor.ts` (bearer solo en rutas de negocio; el manejo de `401 AUTH_REQUIRED` depende de D-11, decisión pendiente, y no prescribe todavía ningún reintento), `core/api/api-client.service.ts` (`withCredentials` por ruta), `features/auth/services/google-auth.service.ts`, `features/auth/login.ts` y `login.html` (acciones "Ingresar" y "Crear cuenta", nonce en `initialize`), `features/auth/auth.guard.ts`, `features/profile/profile.ts`, `features/profile/services/user.service.ts`, `features/publications/my-publications/my-publications.ts`, `environments/environment.example.ts` (flag).

**ms-users** (`ms-users-market-tec`), solo si el RP aprueba las decisiones indicadas; ninguno es requisito para empezar Angular contra un mock:
- D-06(c): `GoogleAuthController.java` y `GoogleLoginService.java` emiten `REGISTRATION_REQUIRED` tras prueba Google válida de una identidad desconocida; prueba nueva en `GoogleAuthControllerTest`.
- D-09: `GoogleAuthController.java` exige `purpose`; unifica el código de `X-MTEC-Client` ausente.
- D-11: `ApiErrors.java` y `BearerRequests.java`; el OpenAPI incorpora los códigos de Java o Java se alinea al enum.

**Contrato** (este repositorio): ampliar el enum de errores y fijar la ortografía de `AuthMethod` (M-34) solo cuando el RP lo apruebe.

## 11. Criterios de aceptación

Verificables en cuanto exista la implementación; cada criterio nombra la prueba de la matriz.

1. **AT-GOOGLE-1.** Un login válido produce `AuthResponse` con `session.serverTime < expiresAt ≤ session.expiresAt` y `expiresAt − serverTime ≤ 240`; Angular guarda el token solo en memoria. Se comprueba que `localStorage` y `sessionStorage` quedan sin claves de sesión.
2. **AT-ANGULAR-USERID-1.** Ninguna petición lleva el Google `sub` ni `USR-001`; `GET /v1/me/profile` usa el bearer y la UI muestra `user.userId`.
3. **AT-ATTEMPT-1/3.** El botón se inicializa con el `nonce` del intento. Con `purpose=register` y registro apagado, la UI muestra "no disponible".
4. **AT-GOOGLE-2/3.** `CSRF_INVALID`, `ATTEMPT_CONSUMED` y `ATTEMPT_EXPIRED` crean un intento nuevo sin reutilizar el anterior.
5. **AT-SESSION-1/2 y recarga.** Recargar con cookie válida restaura sesión con una llamada a `/session` y una a `/refresh`; sin cookie, `/login` sin reintentos.
6. **AT-REFRESH-1/2/4 (sujeto a D-07).** Con dos pestañas refrescando a la vez, la sección crítica serializa bootstrap, refresh y aplicación del resultado; la pestaña que espera obtiene el CSRF dentro de la sección. Nunca hay dos refresh simultáneos desde una pestaña ni un segundo POST encadenado tras un fallo.
7. **Fallo del refresh (sujeto a D-07).** Con la respuesta descartada, un `401 REFRESH_INVALID` o un timeout, la UI llama a `GET /session` solo para reconciliar y no emite otro POST; si no hay sesión recuperable, pide reautenticar. Un logout en otra pestaña impide una restauración tardía.
8. **AT-LOGOUT-1.** Logout llama a `/logout` con CSRF, limpia memoria y no deja credenciales; una segunda llamada sin cookie responde 204.
9. **AT-PROFILE-2 / D-11 (sujeto a aprobación).** Un `401 AUTH_REQUIRED` en negocio no provoca refresco ni repetición automática de peticiones. Si D-11 aprueba un reintento, solo aplica a `GET` permitidos, una vez y con el mismo principal y sesión; `PUT /v1/me/profile` nunca se repite. El código se lee con `error.error?.error?.code` y se distingue red/CORS, 401, 403 y envelope inesperado.
10. **Bloqueos.** Ningún test de Angular llama a las operaciones de `operationsAngularMustNotCall`; un `grep` de CI las rechaza.
11. **Flags.** Con `authCoreV2=false` el comportamiento y las pruebas actuales no cambian. Eso conserva el cliente legado **con sus riesgos** (token de Google en `sessionStorage`, `USR-001`); el flag no certifica la seguridad del frontend.
12. **Ningún secreto.** Ninguna petición lleva `Ocp-Apim-Subscription-Key` ni el valor se compila en el bundle.

Las pruebas contra ms-users real (nonce de GIS, cookies reales, preflight, SameSite) requieren hosts same-site HTTPS y no pueden cerrarse con mocks: siguen pendientes de D-04.

## 12. Orden recomendado

1. El RP responde D-01, D-06, D-07, D-08 y D-11 (las demás no bloquean).
2. Angular implementa contra un mock cuyas respuestas son las del fixture observado, con el flag apagado.
3. Si D-06(c) o D-11 se aprueban en su variante de cambio de Java, ms-users los implementa en su PR, con el OpenAPI y la matriz actualizados.
4. Prueba integrada en un entorno de pruebas con hosts reales (D-04), sin tocar el de producción.
5. Solo entonces se solicitan las conformidades B07 al responsable de cada equipo.
