# MTEC-15 / B07 — Incremento 1: núcleo de autenticación Angular ↔ ms-users

**Fecha:** 2026-11-07. **Estado:** plan propuesto; nada de lo descrito está aprobado ni implementado. **Alcance:** Google → intento con nonce → intercambio de credencial → JWT interno → bootstrap de sesión → perfil → refresh `rotate` → logout `current`. **Fuera de alcance:** Magic Link (D-02), actividad (D-03), pruebas y vínculos (D-14), `refresh continue` y `logout all` (D-10), Catalog y Notifications.

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
- `profile.ts:25` y `my-publications.ts:29` dejan de usar `'USR-001'`. Perfil: `GET/PUT /v1/me/profile`, sin id en la ruta.
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

## 5. Recuperar la sesión tras recargar (D-01, D-07)

1. La memoria está vacía.
2. `GET /v1/auth/session` con la cookie. `200` → `user`, `session`, `csrfToken` (sin JWT). `401 REFRESH_INVALID` → no hay sesión: `/login`, sin reintento.
3. Dentro del lock entre pestañas, `POST /v1/auth/refresh` `{mode:"rotate"}` con el `csrfToken` recién obtenido. `200` → `token` y `csrfToken` nuevos.
4. El `authGuard` espera ambos pasos antes de dejar pasar. `GET /v1/auth/session` no cuenta como actividad.

## 6. Dos pestañas y respuestas perdidas (D-07, política C)

La política C implica que cada generación de refresh se consume una sola vez y que un 401 aislado no revoca a la ganadora.

- **Una sola rotación en vuelo por pestaña** (cola de promesas) y **un lock entre pestañas** con `navigator.locks` (fallback: lock con `BroadcastChannel`).
- **Dentro del lock, antes de rotar**, `GET /v1/auth/session` para tomar el `csrfToken` vigente. Sin esto, la pestaña que perdió la carrera envía un CSRF de la generación anterior, y Java lo trata como prueba inválida (`401 REFRESH_INVALID`).
- **No se comparten credenciales entre pestañas.** El canal solo emite "se rotó"; cada pestaña obtiene su propio JWT al necesitarlo. Compartir el JWT exige aprobación expresa.
- **`401 REFRESH_INVALID` en una pestaña:** no cierra la sesión. `GET /v1/auth/session` decide: `200` → otra pestaña ganó, se toma el CSRF nuevo y, como máximo, **una** rotación nueva; `401` → reautenticar.
- **Respuesta perdida** (red o timeout): no se repite la misma petición. Se consulta `GET /v1/auth/session`. Si la cookie nueva llegó, la sesión está viva y se hace una rotación nueva con el CSRF devuelto. Si el servidor consumió la generación y la cookie nueva no llegó, no hay gracia: reautenticar.
- **Sin bucles:** máximo una rotación por demanda; sin reintentos automáticos del refresh.

Los reintentos de peticiones de negocio tras un `401 AUTH_REQUIRED` (D-11) son distintos: se rota una vez y se repite la petición original **una** vez. Debe aclararse en la revisión de Angular para que no se lea como un retry automático del refresh.

## 7. Cómo se dejan de usar `USR-001` y el token Google

| Antes | Después |
|---|---|
| `AuthTokenService` guarda el ID Token de Google en `sessionStorage` | `AuthSessionStore` en memoria con el JWT interno |
| `GoogleAuthService.signIn(credential)` guarda el credential como sesión | `AuthApiService.exchange(attemptId, credential)` y descarta el credential |
| El interceptor envía ese bearer a toda la base de la API | Bearer solo a rutas de negocio/perfil |
| `restoreSession()` decodifica el token almacenado | Bootstrap + refresh (sección 5) |
| `USR-001`, Google `sub` | `AuthResponse.user.userId` |

## 8. Errores del servidor en Angular (D-11)

- Se interpreta el envelope `{error:{code,message,details,correlationId,timestamp}}`. Angular lee `error.error.code`, nunca `message` (A-07).
- La tabla completa de acciones está en `errorMap` de [`proposed-core-flow.json`](../contracts/examples/auth/proposed-core-flow.json) y cubre los 21 códigos del OpenAPI más los 9 que Java emite fuera del enum. Un código desconocido produce un error genérico y nunca habilita un fallback a identidad Google.
- Resumen: `CSRF_INVALID`, `ATTEMPT_CONSUMED`, `ATTEMPT_EXPIRED` → crear otro intento. `REFRESH_INVALID` → verificar con `GET /session` (sección 6). `AUTH_REQUIRED` en negocio → una rotación y un reintento. `AUTH_TEMPORARILY_UNAVAILABLE` → mensaje de no disponible (también para `register` con el registro apagado). `FORBIDDEN` → denegación, nunca dispara refresh.
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
- Modificados: `core/auth/auth-token.service.ts` (se retira `sessionStorage`; puede eliminarse), `core/api/api-key.interceptor.ts` (bearer solo en rutas de negocio; un reintento tras 401), `core/api/api-client.service.ts` (`withCredentials` por ruta), `features/auth/services/google-auth.service.ts`, `features/auth/login.ts` y `login.html` (acciones "Ingresar" y "Crear cuenta", nonce en `initialize`), `features/auth/auth.guard.ts`, `features/profile/profile.ts`, `features/profile/services/user.service.ts`, `features/publications/my-publications/my-publications.ts`, `environments/environment.example.ts` (flag).

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
6. **AT-REFRESH-1/2/4.** Dos pestañas refrescando a la vez producen una sola rotación ganadora; la perdedora toma el CSRF nuevo vía `/session` y la sesión sigue abierta. Nunca hay dos refresh simultáneos desde una pestaña.
7. **Respuesta perdida.** Con la respuesta del refresh descartada, se llama a `/session` y no se repite el refresh; con la cookie vieja consumida, la UI pide reautenticar.
8. **AT-LOGOUT-1.** Logout llama a `/logout` con CSRF, limpia memoria y no deja credenciales; una segunda llamada sin cookie responde 204.
9. **AT-PROFILE-2 / D-11.** Un `401 AUTH_REQUIRED` en negocio provoca una rotación y un reintento; el segundo 401 reautentica, sin bucle.
10. **Bloqueos.** Ningún test de Angular llama a las operaciones de `operationsAngularMustNotCall`; un `grep` de CI las rechaza.
11. **Flags.** Con `authCoreV2=false` el comportamiento y las pruebas actuales no cambian.
12. **Ningún secreto.** Ninguna petición lleva `Ocp-Apim-Subscription-Key` ni el valor se compila en el bundle.

Las pruebas contra ms-users real (nonce de GIS, cookies reales, preflight, SameSite) requieren hosts same-site HTTPS y no pueden cerrarse con mocks: siguen pendientes de D-04.

## 12. Orden recomendado

1. El RP responde D-01, D-06, D-07, D-08 y D-11 (las demás no bloquean).
2. Angular implementa contra un mock cuyas respuestas son las del fixture observado, con el flag apagado.
3. Si D-06(c) o D-11 se aprueban en su variante de cambio de Java, ms-users los implementa en su PR, con el OpenAPI y la matriz actualizados.
4. Prueba integrada en un entorno de pruebas con hosts reales (D-04), sin tocar el de producción.
5. Solo entonces se solicitan las conformidades B07 al responsable de cada equipo.
