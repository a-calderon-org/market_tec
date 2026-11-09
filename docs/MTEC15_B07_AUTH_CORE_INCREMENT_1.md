# MTEC-15 / B07 — Incremento 1: núcleo de autenticación Angular ↔ ms-users

**Fecha:** 2026-11-07. **Estado:** plan propuesto; ni el flujo completo ni B07 están aprobados. Verificado en el código local (sin confirmar ni desplegar): Angular implementa el núcleo (store en memoria, coordinador D-07, interceptor D-11) tras `authCoreV2=false` y solo contra un mock provisional en `app/frontend/src/app/core/auth/v2/`; no existe adaptador HTTP real, ni integración con ms-users, ni pruebas multi-tab en navegador.

- **Política aprobada (MTEC-40, 2026-11-07):** D-07 como política de diseño del refresh entre pestañas y de la respuesta perdida, y el núcleo conservador de D-11: ninguna petición de negocio se reintenta automáticamente tras un `401`, incluidos los `GET` y todas las mutaciones. Texto canónico en [ADR-004](../context/decisions/ADR-004-seguridad-autenticacion.md#decisiones-d-07-y-d-11-de-mtec-40--2026-11-07).
- **Implementación pendiente:** Angular, coordinación entre pestañas, pruebas (incluidas las de Web Locks en los navegadores soportados) y conformidades de Angular, ms-users y seguridad.
- **Contrato pendiente:** aprobación de B07, catálogo de errores (códigos Java nuevos, enum OpenAPI, `ACCESS_TOKEN_EXPIRED`), DTO públicos nuevos, semántica OpenAPI y posibles cambios en Java/APIM.

Las secciones 5 y 6 describen la política D-07 aprobada; la sección 8 separa la política D-11 aprobada de las propuestas de catálogo, que siguen pendientes.

**Alcance:** Google → intento con nonce → intercambio de credencial → JWT interno → bootstrap de sesión → perfil → refresh `rotate` → logout `current`. **Fuera de alcance:** Magic Link (D-02), actividad (D-03), pruebas y vínculos (D-14), `refresh continue` y `logout all` (D-10), Catalog y Notifications.

Cada paso lleva el id de su decisión en el [registro de decisiones](MTEC15_B07_DECISION_REGISTER.md). Si una decisión cambia, el paso cambia con ella. El flujo está codificado en [`proposed-core-flow.json`](../contracts/examples/auth/proposed-core-flow.json) y comprobado contra el OpenAPI por `test_b07_reconciliation.py`. El comportamiento actual de ms-users está en [`observed-ms-users-2089897.json`](../contracts/examples/auth/observed-ms-users-2089897.json) y las diferencias en la [matriz](MTEC15_B07_RECONCILIATION_MATRIX.md).

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
- (Seguimiento Jira: MTEC-10; no se modificó Jira.) `profile.ts:25` y `my-publications.ts:29` dejan de usar `'USR-001'`. Perfil: `GET/PUT /v1/me/profile`, sin id en la ruta. Estado del código local: `UserService` conserva `/usuarios/{id}` (con el `userId` codificado como un solo segmento con `encodeURIComponent`); la reconciliación definitiva de la ruta con `/me/profile` corresponde a B07 y no se sustituye de forma unilateral. Con `authCoreV2=true` y solo el mock, las operaciones de negocio fallan cerradas sin emitir HTTP.
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

## 5. Recuperar la sesión tras recargar (D-01 propuesta; D-07 política de diseño aprobada)

1. La memoria está vacía.
2. Solo si hay Web Locks y se adquiere el lock, se entra en la sección crítica entre pestañas (sección 6). Dentro de ella: `GET /v1/auth/session` con la cookie. `200` → `user`, `session`, `csrfToken` (sin JWT). `401` (cookie ausente, inválida o sesión expirada) → no hay sesión: se sale de la sección, `/login`, sin POST y sin reintento.
3. Todavía dentro de la sección crítica y solo con sesión válida (`200`), como máximo un `POST /v1/auth/refresh` `{mode:"rotate"}` con ese `csrfToken`. `200` → `token` y `csrfToken` nuevos, que se aplican a la memoria antes de salir de la sección.
4. Sin Web Locks ni exclusión mutua equivalente demostrada, no se ejecuta ni el POST ni la rotación: se solicita reautenticación segura (sección 6). Los tres escenarios se detallan en el criterio de aceptación 5.
5. El `authGuard` espera estos pasos. `GET /v1/auth/session` no cuenta como actividad.

## 6. Dos pestañas y respuestas perdidas (D-07: política de diseño aprobada; implementación PENDIENTE; política C)

La política C implica que cada generación de refresh se consume una sola vez y que un 401 aislado no revoca a la ganadora. Lo siguiente es la política de diseño aprobada el 2026-11-07. No está implementada ni verificada en los navegadores soportados.

- **Un refresh en vuelo por pestaña** (cola de promesas) y **un único `POST /v1/auth/refresh` por demanda de token**.
- **Exclusión mutua entre pestañas con Web Locks** (`navigator.locks`) que cubre juntas las tres operaciones: bootstrap (`GET /session`), refresh y aplicación del resultado a la memoria. `BroadcastChannel` se usa solo para señales (p. ej. "se rotó", "logout"); nunca es mutex ni transporta credenciales.
- **Sin exclusión mutua garantizada** (p. ej. un navegador sin Web Locks), el cliente degrada de forma segura a reautenticación y no envía el POST de refresh fuera del lock.
- **El CSRF se obtiene dentro de la sección crítica**, nunca antes de adquirirla. Si no, la pestaña que esperaba el lock envía el CSRF de la generación anterior y Java lo trata como prueba inválida.
- **No se comparten credenciales entre pestañas.** Cada pestaña obtiene su propio JWT al necesitarlo.
- **Tras un fallo del refresh** (`401 REFRESH_INVALID`, timeout o error de red) se hace `GET /v1/auth/session` **solo para reconciliar el estado**. No se encadena otro POST automáticamente. Si responde `200`, la cookie es válida en ese instante (no prueba una rotación ni la emisión de un access JWT); el siguiente refresh solo ocurre ante una **nueva** demanda de token, dentro de la sección crítica. Si responde `401`, o no se puede recuperar una sesión válida, se reautentica. Con la cookie consumida y la nueva sin llegar no hay gracia (política C).
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

## 8. Errores del servidor en Angular (D-11: política de reintentos aprobada; catálogo de errores PENDIENTE)

**Política aprobada (D-11, 2026-11-07).** Ninguna petición de negocio se reintenta automáticamente tras un `401` en MarketTec v1: ni los `GET` ni ninguna mutación (`PUT /v1/me/profile` incluido). Angular maneja el error y la recuperación de sesión (sección 6) sin repetir silenciosamente la petición fallida; ante ese 401 se informa o se reautentica. No se aprueban por implicación: códigos de error Java nuevos, `ACCESS_TOKEN_EXPIRED`, DTO públicos nuevos, cambios de semántica OpenAPI ni reintentos futuros por operación.

**Propuestas de catálogo, aún PENDIENTES de aprobación:**

- El envelope es `{error:{code,message,details,correlationId,timestamp}}`. En Angular `HttpErrorResponse.error` es el cuerpo, así que el código se lee con `error.error?.error?.code`, nunca de `message` (A-07).
- Se distinguen cuatro casos: **error de red/CORS** (`status === 0`, sin cuerpo), **401**, **403** y **envelope inesperado** (cuerpo ausente, no objeto, o sin `error.code` textual). Un envelope inesperado o un código desconocido produce un error genérico y nunca habilita un fallback a identidad Google.
- La tabla de acciones propuestas está en `errorMap` de [`proposed-core-flow.json`](../contracts/examples/auth/proposed-core-flow.json) y cubre los 21 códigos del OpenAPI más los 9 que Java emite fuera del enum.
- `CSRF_INVALID`, `ATTEMPT_CONSUMED`, `ATTEMPT_EXPIRED` → crear otro intento. `REFRESH_INVALID` → reconciliar con `GET /session` (sección 6). `AUTH_TEMPORARILY_UNAVAILABLE` → mensaje de no disponible (también para `register` con el registro apagado). `FORBIDDEN` → denegación; nunca dispara refresh.
- **`401 AUTH_REQUIRED` en una petición de negocio** (política aprobada): no se repite la petición, sea `GET` o mutación. Si hace falta recuperar la sesión, se sigue la sección 6 (un único POST de refresh por demanda, dentro de la sección crítica); la petición original no se reenvía y cualquier nueva solicitud la inicia el usuario o el llamador de forma explícita.
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

**Angular** (`market_tec/app/frontend/src/app`), en un PR propio, tras aprobar D-01, D-06 y D-08 y el catálogo de D-11 (D-07 y el núcleo de D-11 ya están aprobados como política):
- Nuevos: `core/auth/auth-session.store.ts`, `core/auth/auth-api.service.ts`, `core/auth/refresh-coordinator.ts` (Web Locks), `core/auth/auth-error.mapper.ts`, y sus `*.spec.ts`.
- Modificados: `core/auth/auth-token.service.ts` (se retira `sessionStorage`; puede eliminarse), `core/api/api-key.interceptor.ts` (bearer solo en rutas de negocio; no repite ninguna petición tras un `401` (D-11, política aprobada); el mapeo por código depende del catálogo de D-11, pendiente), `core/api/api-client.service.ts` (`withCredentials` por ruta), `features/auth/services/google-auth.service.ts`, `features/auth/login.ts` y `login.html` (acciones "Ingresar" y "Crear cuenta", nonce en `initialize`), `features/auth/auth.guard.ts`, `features/profile/profile.ts`, `features/profile/services/user.service.ts`, `features/publications/my-publications/my-publications.ts`, `environments/environment.example.ts` (flag).

**ms-users** (`ms-users-market-tec`), solo si el RP aprueba las decisiones indicadas; ninguno es requisito para empezar Angular contra un mock:
- D-06(c): `GoogleAuthController.java` y `GoogleLoginService.java` emiten `REGISTRATION_REQUIRED` tras prueba Google válida de una identidad desconocida; prueba nueva en `GoogleAuthControllerTest`.
- D-09: `GoogleAuthController.java` exige `purpose`; unifica el código de `X-MTEC-Client` ausente.
- D-11 (catálogo, pendiente de aprobación): `ApiErrors.java` y `BearerRequests.java`; el OpenAPI incorpora los códigos de Java o Java se alinea al enum.

**Contrato** (este repositorio): ampliar el enum de errores y fijar la ortografía de `AuthMethod` (M-34) solo cuando el RP lo apruebe.

## 11. Criterios de aceptación

Verificables en cuanto exista la implementación; cada criterio nombra la prueba de la matriz.

1. **AT-GOOGLE-1.** Un login válido produce `AuthResponse` con `session.serverTime < expiresAt ≤ session.expiresAt` y `expiresAt − serverTime ≤ 240`; Angular guarda el token solo en memoria. Se comprueba que `localStorage` y `sessionStorage` quedan sin claves de sesión.
2. **AT-ANGULAR-USERID-1.** Ninguna petición lleva el Google `sub` ni `USR-001`; `GET /v1/me/profile` usa el bearer y la UI muestra `user.userId`.
3. **AT-ATTEMPT-1/3.** El botón se inicializa con el `nonce` del intento. Con `purpose=register` y registro apagado, la UI muestra "no disponible".
4. **AT-GOOGLE-2/3.** `CSRF_INVALID`, `ATTEMPT_CONSUMED` y `ATTEMPT_EXPIRED` crean un intento nuevo sin reutilizar el anterior.
5. **AT-SESSION-1/2 y recarga (D-07, política aprobada; verificable al implementar).** El POST de refresh depende de la exclusión mutua y de que exista sesión; hay tres escenarios:
   - **Escenario A: Web Locks disponible y lock adquirido.** Angular entra en la sección crítica compartida entre pestañas, ejecuta `GET /v1/auth/session` y toma el CSRF vigente dentro del lock. Con sesión válida (`200`), ejecuta como máximo un `POST /v1/auth/refresh` por demanda y aplica el resultado a la memoria antes de liberar el lock. Una restauración posterior a un logout no repone credenciales. Un `200` de `GET /session` prueba solo la validez actual de la cookie; no es una rotación ni entrega un access JWT.
   - **Escenario B: Web Locks no disponible y sin exclusión mutua equivalente demostrada.** No se intenta rotación automática: no se emite `POST /v1/auth/refresh`. Angular solicita reautenticación segura. `BroadcastChannel` no sustituye al mutex.
   - **Escenario C: cookie ausente o inválida, o sesión expirada** (`401` en `GET /session`). No se emite `POST /v1/auth/refresh`; Angular solicita reautenticación y va a `/login` sin reintentos.

   En los tres escenarios rige la política C: sin gracia y sin segundo POST automático después de un error.
6. **AT-REFRESH-1/2/4 (D-07, política aprobada; verificable al implementar).** Con dos pestañas refrescando a la vez, la sección crítica serializa bootstrap, refresh y aplicación del resultado; la pestaña que espera obtiene el CSRF dentro de la sección. Nunca hay dos refresh simultáneos desde una pestaña ni un segundo POST encadenado tras un fallo.
7. **Fallo del refresh (D-07, política aprobada; verificable al implementar).** Con la respuesta descartada, un `401 REFRESH_INVALID` o un timeout, la UI llama a `GET /session` solo para reconciliar y no emite otro POST; si no hay sesión recuperable, pide reautenticar. Un logout en otra pestaña impide una restauración tardía.
8. **AT-LOGOUT-1.** Logout llama a `/logout` con CSRF, limpia memoria y no deja credenciales; una segunda llamada sin cookie responde 204.
9. **AT-PROFILE-2 / D-11 (política de reintentos aprobada).** Un `401 AUTH_REQUIRED` en negocio no provoca la repetición automática de ninguna petición, ni `GET` ni mutación (`PUT /v1/me/profile` incluido): el mock recibe una sola solicitud. La recuperación de sesión, si ocurre, sigue D-07 (un POST de refresh por demanda). La lectura del código con `error.error?.error?.code` y la distinción red/CORS, 401, 403 y envelope inesperado dependen del catálogo de D-11, **PENDIENTE**.
10. **Bloqueos.** Ningún test de Angular llama a las operaciones de `operationsAngularMustNotCall`; un `grep` de CI las rechaza.
11. **Flags.** Con `authCoreV2=false` el comportamiento y las pruebas actuales no cambian. Eso conserva el cliente legado **con sus riesgos** (token de Google en `sessionStorage`, `USR-001`); el flag no certifica la seguridad del frontend.
12. **Ningún secreto.** Ninguna petición lleva `Ocp-Apim-Subscription-Key` ni el valor se compila en el bundle.

Las pruebas contra ms-users real (nonce de GIS, cookies reales, preflight, SameSite) requieren hosts same-site HTTPS y no pueden cerrarse con mocks: siguen pendientes de D-04.

## 12. Orden recomendado

1. El RP responde D-01, D-06, D-08 y el catálogo de D-11 (las demás no bloquean; D-07 y el núcleo de D-11 se aprobaron el 2026-11-07).
2. Angular implementa contra un mock cuyas respuestas son las del fixture observado, con el flag apagado.
3. Si D-06(c) o el catálogo de D-11 se aprueban en su variante de cambio de Java, ms-users los implementa en su PR, con el OpenAPI y la matriz actualizados.
4. Prueba integrada en un entorno de pruebas con hosts reales (D-04), sin tocar el de producción.
5. Solo entonces se solicitan las conformidades B07 al responsable de cada equipo.
