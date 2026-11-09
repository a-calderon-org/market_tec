# MTEC-12 / MTEC-41 — APIM para ms-users: entrega para staging

**Fecha:** 2026-11-08; despliegue en staging 2026-11-09 (§11). **Estado:** `markettec-users-v1` **desplegada** en la
APIM `markettec-api` con la autenticación cerrada: solo sesión, refresh y logout se reenvían a ms-users, que responde
404 porque sus flags siguen apagados. No aprueba B07 ni D-04 y no activa ningún flag.

**Bases verificadas:** MarketTec `main@27d2b693e9124fd5e6fdab6d4e904921769139ef` (PR #35), ms-users
`main@08ccf056c975f6ec5d918c4cf76143fb04def7b2` (PR #25). Las 22 rutas de controlador de ese SHA coinciden con
[`infra/apim/backend-routes.json`](../infra/apim/backend-routes.json) (lectura estática de `@*Mapping`, sin prefijo de
clase). OpenAPI Users `0.3.0-draft`.

## 1. Qué está en Git y qué no

| Elemento | Estado |
| --- | --- |
| Rutas Java de las 8 operaciones | **Verificado** en el código de ms-users `08ccf05` (detrás de flags apagados) |
| Contrato B07 | **Pendiente de aprobación**; el OpenAPI sigue declarando `apimSubscriptionKey` (ver §8) |
| Perfil de liberación `ms-users-google-v1` | **Implementado** en [`release_profiles.py`](../infra/apim/release_profiles.py) |
| Comprobación de la cadena Angular → APIM → Java | **Implementada** en [`route_check.py`](../infra/apim/route_check.py) y ejecutada en cada generación |
| Políticas por operación, política de API (CORS) y definición de API | **Desplegadas en staging** (paquete parcial, §11) |
| Políticas validadas en un gateway de Azure | **Verificado** para las 22 políticas y la de API (Azure las aceptó; §11.4) |
| `subscriptionRequired=false` en la API nueva | **Verificado** en Azure |
| Aprobaciones (`approvals.*`), `target` | `null`; sin evidencia |
| JWT interno (JWKS, issuer, audience) | **No configurado** en ms-users; perfil denegado en APIM |
| Activación de autenticación | **No aprobada**; `authCoreV2=false` y flags Java en `false` |

## 2. Rutas

Angular construye `versionedApiUrl(environment.apiBaseUrl, '/auth/google')`: añade `/v1` salvo que la base ya
termine en `/v1`. La API candidata usa el sufijo `users/v1`, conserva las plantillas públicas existentes
(`/auth/google`, …) y el backend de APIM apunta al **origen desnudo** de ms-users (sin ruta), porque los
controladores ya llevan `/v1`.

**`environment.apiBaseUrl` = `https://<host-apim>/users`** (también vale `https://<host-apim>/users/v1`).

| Operación | Navegador | Operación APIM | Rewrite → ms-users |
| --- | --- | --- | --- |
| Intento Google | `POST https://<host-apim>/users/v1/auth/attempts` | `/auth/attempts` | `POST /v1/auth/attempts` |
| Login Google | `POST …/users/v1/auth/google` | `/auth/google` | `POST /v1/auth/google` |
| Registro Google | `POST …/users/v1/auth/google/registrations` | `/auth/google/registrations` | `POST /v1/auth/google/registrations` |
| Sesión | `GET …/users/v1/auth/session` | `/auth/session` | `GET /v1/auth/session` |
| Refresh | `POST …/users/v1/auth/refresh` | `/auth/refresh` | `POST /v1/auth/refresh` |
| Logout | `POST …/users/v1/auth/logout` | `/auth/logout` | `POST /v1/auth/logout` |
| Perfil | `GET`/`PUT …/users/v1/me/profile` | `/me/profile` | `GET`/`PUT /v1/me/profile` |

Si el operador elige otro sufijo o base, `route_check.resolve()` debe pasar con los valores reales; detecta `/v1`
ausente o duplicado, login/registro intercambiados, rewrites erróneos y operaciones enviadas a otro backend.

Con `authCoreV2` + adaptador `http`, Angular restringe las llamadas de negocio a `GET`/`PUT /me/profile`, de modo que
`apiBaseUrl` puede apuntar a esta API sin romper rutas heredadas en ese modo. Con `authCoreV2=false` no debe
cambiarse `apiBaseUrl` hacia esta API.

## 3. Operaciones permitidas y bloqueadas

* **Liberadas por el perfil (8):** las de la tabla anterior.
  * Sin aprobación `abuse_protection`, intento, login y registro siguen con denegación terminal 503
    `ADMISSION_DISABLED`: el perfil nunca levanta un bloqueo. Sesión, refresh, logout y perfil quedan habilitados.
* **No liberadas (14), denegación terminal 404 `OPERATION_NOT_RELEASED`, sin `<base />` ni backend:** Magic Link
  (`/auth/email/*`), pruebas de método (`/auth/proofs/*`), vínculo y listado de métodos (`/me/auth-methods`),
  actividad B03 (`/auth/session/activity`), `/usuarios/{userId}`, `/health`, `/.well-known/*`. APIM usa un
  snapshot JWKS revisado, no necesita exponer `/.well-known/jwks.json`.

Ampliar el perfil exige cambiar `release_profiles.py` (código revisado); editar `operations.json` no basta y
`security_reference.py` sigue rechazando cualquier rebaja.

## 4. Admisión sin subscription key (MTEC-41)

* **API separada** `markettec-users-v1` (nombre propuesto), `protocols=[https]`, `subscriptionRequired=false`. La API
  compartida `markettec-api-v1` **no se toca**: conserva su suscripción y su política histórica de Google para los
  servicios que aún dependen de ella.
* Solo existen operaciones con ruta exacta; las no liberadas responden 404 explícito. Las protegidas validan JWT
  interno; las de cookie solo comprueban formato/presencia y Origin/CSRF, ms-users valida sesión y CSRF.
* El navegador no recibe ninguna credencial nueva.

**Procedimiento del operador (no ejecutado):**

1. Crear la API `markettec-users-v1` con sufijo `users/v1`, HTTPS, `subscriptionRequired=false` y `serviceUrl` = origen
   HTTPS de ms-users (Container App `ca-ms-users-stg`), sin ruta. No añadirla a productos con suscripción salvo decisión revisada.
2. Importar las 22 operaciones con `api-definition.candidate.json` y los `*.candidate.xml` del paquete.
3. Aplicar `api-scope.candidate.xml` a la API.
4. Crear el named value `allowed-origins` con los mismos orígenes que `--allowed-origin`.
5. Exportar las políticas global, product (si la API pertenece a alguno) y API reales y regenerar con ellas.

**Rotación de clave histórica (operativo, separado):** el JavaScript desplegado contenía la clave primaria de
`Markettec-Subs` (verificado el 2026-11-04, [DEPENDENCIES.md](../context/frontend/DEPENDENCIES.md)). Debe regenerarse
la clave primaria (y la secundaria si se expuso) cuando ningún cliente legado dependa de ella. **MTEC-41 no está
resuelto** hasta verificar en Azure la API sin clave, las denegaciones y la rotación.

## 5. JWT interno, cookies, CORS y CSRF

* `validate-jwt`: `Authorization: Bearer`, firma obligatoria con claves RSA del snapshot JWKS de ms-users,
  `require-expiration-time`, `clock-skew=0`, un issuer y una audiencia; después `alg=RS256`, `typ=at+jwt`, `sub`,
  `jti`, `iat`, `sid` y TTL ≤ 240 s. Un Google ID Token falla por emisor, firma, `typ` y `sid`.
* Cada operación elimina `X-User-Id`, `X-Session-Id` y `X-Authenticated-User` antes de cualquier comprobación. No se
  elimina ni reescribe `Origin`, `Cookie`, `Set-Cookie`, `X-CSRF-Token`, `X-MTEC-Client` ni `Authorization`.
* La política de API declara CORS con credenciales y orígenes HTTPS literales (nunca `*`), métodos GET/POST/PUT y
  cabeceras `Content-Type`, `Authorization`, `X-CSRF-Token`, `X-MTEC-Client`, `X-Correlation-ID`.
  `<cors>` precede a `<base />` para que se evalúe antes del CORS heredado. La política conserva la herencia.
* **No determinado:** ms-users también emite cabeceras CORS. Debe comprobarse en el gateway el orden de la política
  efectiva y que cada respuesta a un origen permitido lleve un único `Access-Control-Allow-Origin` con ese origen.

**Requisitos D-04 (pendientes):** SPA y APIM en hosts HTTPS del mismo *site* registrable; cookies `__Host-`
(`Secure`, `Path=/`, sin `Domain`). Los hostnames no se inventan aquí.

## 6. Variables y entradas requeridas (sin valores)

**Generador:** `--release ms-users-google-v1`, `--allowed-origin` (uno por origen), `--jwks` (snapshot público
revisado), `--issuer`, `--audience`, `--upstream-global|product|api`.

**APIM:** named value `allowed-origins`; `serviceUrl` de ms-users.

**ms-users (App Service, MTEC-37):** perfil `sql-appservice` con `USERS_SQL_SERVER`, `USERS_SQL_DATABASE`
(`USERS_SQL_PORT`, `USERS_SQL_POOL_SIZE` opcionales) e identidad administrada asignada por el sistema con permisos
solo DML (migraciones fuera del arranque); `USERS_INTERNAL_JWT_ISSUER`, `USERS_INTERNAL_JWT_AUDIENCE`,
`USERS_INTERNAL_JWT_PUBLIC_JWKS_URI`, `USERS_INTERNAL_JWT_ACTIVE_KID`, `USERS_INTERNAL_JWT_KEYS_JSON` (secreto, Key
Vault); `USERS_CSRF_ACTIVE_KID`, `USERS_CSRF_KEYS_JSON` (secreto); `USERS_GOOGLE_AUDIENCES`,
`USERS_GOOGLE_LOGIN_AUDIENCE`; orígenes `USERS_API_HTTP_ALLOWED_ORIGINS`, `USERS_SESSION_HTTP_ALLOWED_ORIGINS`,
`USERS_GOOGLE_HTTP_ALLOWED_ORIGINS`; `USERS_SESSION_HTTP_PUBLIC_API_ORIGIN` y `USERS_GOOGLE_HTTP_PUBLIC_API_ORIGIN`
(el origen de APIM). Flags `*_ENABLED` y `*_VERIFIED` se mantienen en `false` hasta el paso 6 de §9.

`issuer`/`audience` deben coincidir exactamente entre ms-users y el generador; el JWKS del paquete debe ser el
publicado por ese ms-users.

## 7. Evidencia externa pendiente

1. Exportaciones reales global/product/API y revisión de la política efectiva.
2. Snapshot JWKS, issuer y audience revisados del entorno.
3. Evidencia `abuse_protection` compatible con Consumption (`rate-limit-by-key` no existe allí y `rate-limit` solo
   cuenta llamadas con suscripción): p. ej. límites en ms-users o WAF delante de APIM. Hasta entonces intento,
   login y registro quedan cerrados.
4. Evidencia `ms_users_contract` (B07) — no requerida por las 8 operaciones, sí por las de pruebas/vínculos.
5. Validación en gateway de cada política y expresión; aprobación del operador; revisión obligatoria en GitHub para
   `infra/apim/**`.
6. Hosts HTTPS definitivos y pruebas de navegador D-04.
7. Decisión revisada sobre el requisito de exportar `product` si la API no pertenece a ningún producto: el generador
   lo sigue exigiendo y no se ha relajado.

## 8. Discrepancia contractual (no resuelta aquí)

`contracts/openapi/users.json` declara `apimSubscriptionKey` en las operaciones de navegador. El modelo candidato no
la requiere. Cambiarlo es una modificación de contrato B07 que necesita aprobación; no se alteró.

## 9. Activación y rollback

1. Desplegar ms-users con flags apagados; `/health` responde.
2. Crear la API sin clave (§4) y aplicar el paquete con intento/login/registro aún denegados.
3. Pruebas de denegación: rutas no liberadas → 404; perfil sin bearer, con Google ID Token o con
   `X-User-Id` falsificado → 401; Origin ajeno → 403; OPTIONS desde origen ajeno sin `Access-Control-Allow-Origin`.
4. Registrar la evidencia `abuse_protection` y regenerar.
5. Activar en ms-users los flags de Google, sesión, refresh, logout y API HTTP; `*_VERIFIED` solo tras las pruebas D-04.
6. Activar en Angular `authCoreV2=true`, `authCoreV2Adapter='http'`, `authCoreV2HttpTopologyVerified=true` y la
   `apiBaseUrl` de §2 en un build de staging.

**Rollback:** volver Angular a `authCoreV2=false` y su `apiBaseUrl` anterior; apagar los flags de ms-users; volver a
la revisión anterior de la API o reemplazar sus políticas por denegación terminal. `markettec-api-v1` no cambia,
por lo que no requiere rollback.

## 10. Prueba E2E (navegador real, staging)

1. Abrir la SPA en el origen permitido; DevTools → Network con «Preserve log».
2. Login Google: `POST …/auth/attempts` (200, `Set-Cookie: __Host-mtec-attempt`), GIS con nonce, `POST …/auth/google`
   con `X-CSRF-Token` y `X-MTEC-Client: web` → 200 con token interno y `Set-Cookie: __Host-mtec-refresh`. Ninguna
   petición lleva `Ocp-Apim-Subscription-Key`.
3. `GET …/auth/session` → 200 con la sesión.
4. `GET …/me/profile` con `Authorization: Bearer <interno>` → 200; repetir con un Google ID Token → 401.
5. `PUT …/me/profile` → 200.
6. Esperar a que expire el token (≤ 240 s) o forzar refresh: `POST …/auth/refresh` con CSRF → 200 y cookie rotada.
7. `POST …/auth/logout` → 204; `GET …/auth/session` posterior sin sesión; `GET …/me/profile` con el token anterior
   tras su expiración → 401.
8. Repetir con el bloqueo de cookies de terceros del navegador activado (D-04).

## 11. Despliegue en staging (2026-11-09)

### 11.1 Recursos

| Elemento | Valor |
| --- | --- |
| APIM | `markettec-api` (Consumption, West US 2), suscripción `904ab275-d398-47a7-887a-4af1f3afbd6b`, rg `markettec-dev` |
| API | `markettec-users-v1`, revisión 1, sufijo `users/v1`, `protocols=[https]`, `subscriptionRequired=false`, en ningún producto |
| URL pública | `https://markettec-api.azure-api.net/users/v1` → `environment.apiBaseUrl` = `https://markettec-api.azure-api.net/users` |
| Backend (`serviceUrl`) | `https://ca-ms-users-stg.orangerock-c46177b6.canadacentral.azurecontainerapps.io` (sin ruta) |
| ms-users | Container App `ca-ms-users-stg` (suscripción `26db4383-…`, rg `acalderon-TEC`, Canada Central), imagen `ms-users:f574c712…`, revisión `ca-ms-users-stg--rf574c71p` |
| Named value | `allowed-origins` (no secreto) = `https://victorious-beach-0a55f0c1e.2.azurestaticapps.net` |
| Origen SPA | Static Web App `markettec` (Free), `https://victorious-beach-0a55f0c1e.2.azurestaticapps.net` |

La suscripción `26db4383-…` solo contiene la APIM `a-calderon-api-management`, que no es de MarketTEC (una API
`products-api-v1`); no se modificó. **Sin cambios:** `markettec-api-v1` (política idéntica antes/después, 12
operaciones, `subscriptionRequired=true`), política global (solo leída), suscripciones `master` y `Markettec-Subs`
(sin rotación), Container App, Azure SQL, firewall y Key Vault.

Las 22 rutas de `backend-routes.json` (`08ccf05`) siguen vigentes en `f574c71`: entre ambos SHA no cambia ningún
controlador (comparación de GitHub; solo Dockerfile, scripts y SQL).

### 11.2 Generación

```bash
python3 infra/apim/generate_policies.py --mode package --release ms-users-google-v1 \
  --allowed-origin https://victorious-beach-0a55f0c1e.2.azurestaticapps.net \
  --jwt-unconfigured --no-product-scope \
  --upstream-global <export global> --upstream-api <export API markettec-users-v1> --output-dir <dir nuevo>
```

* `--upstream-global` y `--upstream-api` son exportaciones reales de Azure tras crear la API y su política; la de API
  coincide con `api-scope.candidate.xml`. La global por defecto de Azure no tiene `<on-error>`; `policy_schema.py`
  lo acepta solo en el ámbito global.
* `--no-product-scope`: verificado que la APIM no tiene productos y que la API no pertenece a ninguno.
* `--jwt-unconfigured`: ms-users no define `USERS_INTERNAL_JWT_ISSUER`, `…_AUDIENCE` ni JWKS; las operaciones JWT
  quedan en denegación terminal 503 `INTERNAL_JWT_UNCONFIGURED`. No se inventó issuer, audience ni JWKS.

### 11.3 Operaciones en el gateway

| Estado | Operaciones | Respuesta APIM |
| --- | --- | --- |
| Reenviadas (3) | `GET /auth/session`, `POST /auth/refresh`, `POST /auth/logout` → `/v1/auth/...` | comprobaciones de gateway; después Java |
| Admisión cerrada (3) | `POST /auth/attempts`, `/auth/google`, `/auth/google/registrations` | 503 `ADMISSION_DISABLED` |
| JWT no configurado (2) | `GET`/`PUT /me/profile` | 503 `INTERNAL_JWT_UNCONFIGURED` |
| No liberadas (14) | §3 | 404 `OPERATION_NOT_RELEASED` |
| Sin operación | cualquier otra ruta o método (`/anything`, `/v1/auth/session`, `DELETE /me/profile`) | 404 de APIM, sin backend |

Las denegaciones terminales no ejecutan `<base />`, por lo que no llevan cabeceras CORS: el navegador no puede leer
su cuerpo (falla cerrado). La habilitación de las tres operaciones de cookie fue autorizada expresamente por el
responsable el 2026-11-09.

### 11.4 Pruebas ejecutadas en Azure (2026-11-09)

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | API y sufijo | **Verificado**: `users/v1`, HTTPS, revisión 1 |
| 2 | Sin subscription key | **Verificado**: todas las respuestas sin `Ocp-Apim-Subscription-Key`; `subscriptionRequired=false` |
| 3 | Backend real | **Verificado**: las 3 operaciones reenviadas devuelven el 404 JSON `ROUTE_NOT_FOUND` de ms-users con `correlationId`, idéntico a la llamada directa al Container App |
| 4 | Rewrites | **Verificado** en las 22 políticas exportadas de Azure (iguales al paquete) y por tráfico en las 3 reenviadas; las 5 restantes del perfil no se pueden probar por tráfico hasta habilitarlas |
| 5 | 14 excluidas | **Verificado**: 404 `OPERATION_NOT_RELEASED` generado por APIM |
| 6 | Intento/login/registro | **Verificado**: 503 `ADMISSION_DISABLED` aun con cookie y CSRF |
| 7 | Perfil sin JWT o con token falso | **Verificado**: 503 `INTERNAL_JWT_UNCONFIGURED` (todavía no 401: no hay `validate-jwt` sin JWKS) |
| 8 | Comprobaciones de cookie | **Verificado**: sin Origin → 403 `ORIGIN_DENIED`; sin cookie o con cookie mal formada/duplicada → 401 `REFRESH_INVALID`; sin `X-CSRF-Token` → 403 `CSRF_INVALID`; logout sin cookie llega a Java |
| 9 | CORS | **Verificado**: origen permitido → un único `Access-Control-Allow-Origin` con ese origen y `Allow-Credentials: true`; origen ajeno o `null` → `<cors terminate-unmatched-request>` corta con 200 vacío sin cabeceras CORS ni backend; preflight con método no permitido (DELETE) → sin cabeceras CORS; preflight a operación reenviada → 200 con `Max-Age: 600` y las cabeceras pedidas |
| 10 | Fugas | **Verificado** en una respuesta reenviada: sin `Server`, `X-Powered-By`, `Set-Cookie` ni cabeceras de identidad; solo `x-correlation-id` |
| 11 | Flags ms-users | **Verificado**: 13 de 13 en `false` antes y después |
| 12 | `/health` directo | **Verificado**: 200 por la URL HTTPS del Container App (en APIM sigue 404 `OPERATION_NOT_RELEASED`) |

**Hallazgo de validación de Azure:** APIM rechazó la primera versión de las políticas de cookie (`Usage of type
'System.Text.RegularExpressions.MatchCollection' is not supported within expressions`). El generador cuenta ahora
con `Regex.Split(...).Length - 1` y un patrón no capturante; hay prueba de regresión. Durante ~1 minuto
`getSessionState` existió sin política (reenvío sin rewrite a `/auth/session`, al que Java responde 404) hasta que se
aplicó una denegación terminal. Procedimiento: crear cada operación e inmediatamente su política; si Azure rechaza la política, aplicar `terminal_deny` a esa operación antes de continuar.

**No determinado:**

* Preflight a una operación en denegación terminal devuelve 404 de APIM; al habilitar el perfil debe repetirse el
  preflight `GET`/`PUT /me/profile` con `Authorization`.
* Cabeceras CORS de ms-users con sus flags activos: hoy no emite ninguna; puede duplicar `Access-Control-Allow-Origin`
  al activarse. Repetir la prueba 9 tras activar flags.
* La eliminación de `X-User-Id`/`X-Session-Id`/`X-Authenticated-User` está en las políticas desplegadas, pero no es
  observable desde fuera mientras Java responde 404.

### 11.5 D-04: cookies entre hosts

`azure-api.net` y `2.azurestaticapps.net` figuran en la Public Suffix List (comprobado 2026-11-09): SPA
(`victorious-beach-0a55f0c1e.2.azurestaticapps.net`) y APIM (`markettec-api.azure-api.net`) son *sites* distintos, así
que las cookies `__Host-` de APIM serían de terceros para la SPA y el bloqueo de cookies de terceros las descartaría.
**D-04 no se cumple** con hosts separados por defecto (alternativa adoptada: same-origin, §13.2). Con dominio propio harían falta dos dominios
personalizados (por ejemplo `app.<dominio>` en la SWA y `api.<dominio>` en APIM). La autenticación sigue cerrada.

### 11.6 Acceso directo al Container App

Cerrado el 2026-11-09 (§12). Antes, `ca-ms-users-stg` tenía ingreso externo sin restricciones ni autenticación de
plataforma y cualquier cliente podía evitar APIM. Alternativas descartadas en Consumption: restricción de IP (APIM
Consumption no tiene IP de salida fija), entorno interno + VNet (Consumption no se integra en VNet), secreto
compartido o mTLS (exigen validación propia en Java y gestión de secretos).

### 11.7 Bloqueos para habilitar Google

1. D-04: same-origin por la Function de SWA (§13.2), verificado en navegador con flags apagados; falta repetir la prueba con cookies emitidas por Java.
2. ~~Cierre del acceso directo al Container App~~: **Verificado** el 2026-11-09 (§12).
3. JWT interno: configurar en ms-users issuer, audience y claves, y revisar el JWKS publicado; regenerar sin
   `--jwt-unconfigured`. Detrás de la autenticación de Container Apps exige además desplegar el filtro de
   reubicación de ms-users y `USERS_GATEWAY_USER_TOKEN_RELOCATION_ENABLED=true` (§12.3).
4. `abuse_protection` compatible con Consumption (§7.3), con documento de evidencia real.
5. B07 / `ms_users_contract` y la discrepancia `apimSubscriptionKey` del OpenAPI (§8).
6. Repetir CORS con flags activos y el preflight del perfil (§11.4).

### 11.8 Coste y rollback

* Recursos nuevos: una API, 22 operaciones con sus políticas y un named value en la APIM Consumption existente. Sin
  coste fijo; las llamadas se facturan por uso de Consumption (con cuota gratuita mensual). Las pruebas despertaron el
  Container App unas pocas veces (escala 0–1). Sin sondeos periódicos.
* Rollback: eliminar la API `markettec-users-v1` y el named value `allowed-origins`, o reaplicar `terminal_deny` a las
  tres operaciones reenviadas. `markettec-api-v1` no depende de nada de lo anterior. Rollback de §12: §12.5.

## 12. Autenticación APIM → Container Apps (MTEC-12/D04, 2026-11-09)

### 12.1 Recursos

| Elemento | Valor |
| --- | --- |
| App registration (recurso) | `markettec-ms-users-stg-gateway`, appId `9ef55975-8943-4bc4-9e98-21457569d4cc`, `api://9ef55975-…`, single-tenant, tokens v2, **sin secreto ni redirect URI** |
| Rol | `Gateway.Invoke` (solo `Application`); service principal con `appRoleAssignmentRequired=true`; asignado **solo** a la identidad de APIM |
| Identidad de APIM | `markettec-api` system-assigned: objectId `5535ce75-2ca8-41c2-b84f-60c6cf21b05e`, appId `45fbf2c1-06ae-498f-a6bf-3d8f111a7415` |
| Autenticación de Container Apps | `authConfigs/current` de `ca-ms-users-stg`: proveedor Entra, emisor `https://login.microsoftonline.com/<tenant>/v2.0`, audiencia `api://9ef55975-…`, `allowedApplications` = appId de APIM, `allowedPrincipals.identities` = objectId de APIM, `Return401`, `excludedPaths=["/health"]`, token store desactivado |
| Políticas APIM | `getSessionState`, `refreshSession`, `logoutSession`: al final de `inbound`, `set-header X-MTEC-User-Authorization delete` + `authentication-managed-identity resource="api://9ef55975-…"`. Las 19 restantes, sin cambios (denegaciones terminales: no piden token) |
| Generación | §11.2 más `--gateway-auth-resource api://9ef55975-8943-4bc4-9e98-21457569d4cc` |

Ambas suscripciones están en el mismo tenant (`bfcf1d9d-…`). No hay VNet, Front Door ni Application Gateway. Coste
incremental: US$0 (Entra, identidad administrada y autenticación de Container Apps no se facturan; la petición de
token de APIM se cachea en el gateway).

### 12.2 Dos autorizaciones en la misma petición

La autenticación de Container Apps solo acepta el token Entra en `Authorization: Bearer` y `ms-users` exige
**exactamente un** `Authorization: Bearer` (`BearerRequests`). No caben ambos en el mismo encabezado, así que:

| Capa | Quién la verifica | Dónde viaja |
| --- | --- | --- |
| APIM → Container Apps | sidecar `http-auth` (audiencia, emisor, firma, appId y objectId de APIM) | `Authorization` (puesto por `authentication-managed-identity`, sobrescribe el del cliente) |
| JWT interno del usuario | `validate-jwt` en APIM y de nuevo `InternalTokenVerifier` en Java | APIM lo copia a `X-MTEC-User-Authorization` **después** de `validate-jwt` y **antes** de sustituir `Authorization`; Java lo lee como `Authorization` mediante `GatewayUserTokenFilter` |
| Cookies `__Host-` y CSRF | comprobaciones de APIM y Java | `Cookie` y `X-CSRF-Token`, intactos (Easy Auth no los usa; token store y sesiones `/.auth` desactivados) |

`X-MTEC-User-Authorization` no otorga nada por sí mismo: llega a Java solo a través de APIM (todo lo demás recibe 401
del sidecar) y su valor se verifica criptográficamente igual que antes. En las operaciones sin JWT, APIM elimina
cualquier copia enviada por el cliente. **Estado del contrato APIM ↔ ms-users para este encabezado: Proposed**
(requiere aprobación del responsable antes de activar operaciones JWT).

### 12.3 Estado del JWT interno

Hoy ninguna operación JWT llega a Java (`--jwt-unconfigured`, 503 `INTERNAL_JWT_UNCONFIGURED`), por lo que la
conservación del JWT de extremo a extremo es **No determinada en Azure** y está cubierta por pruebas: generador
(`GatewayAuthTest`: orden `validate-jwt` → reubicación → identidad) y ms-users (`GatewayUserTokenFilterTest`: el JWT
reubicado llega al controlador junto al token del gateway; el token del gateway nunca se lee como credencial; sigue
exigiendo un único Bearer verificado). Para activarlo: desplegar el PR de ms-users, poner
`USERS_GATEWAY_USER_TOKEN_RELOCATION_ENABLED=true`, regenerar con JWKS/issuer/audience y `--gateway-auth-resource`, y
repetir una llamada autenticada de prueba.

### 12.4 Pruebas en Azure (2026-11-09)

| # | Petición | Resultado |
| --- | --- | --- |
| 1 | Directa sin `Authorization` a `/v1/auth/session` | **Verificado** 401 (sidecar, sin llegar a Java) |
| 2 | Directa `POST /v1/auth/refresh` con cookie `__Host-mtec-refresh` y CSRF | **Verificado** 401 |
| 3 | Directa con `X-MS-CLIENT-PRINCIPAL*` falsificados | **Verificado** 401 |
| 4 | Directa con `X-User-Id`, `X-Authenticated-User`, `X-MTEC-User-Authorization` | **Verificado** 401 |
| 5 | Directa con token ARM del operador (audiencia distinta) | **Verificado** 401 |
| 6 | App Entra ajena sin rol pide token para `api://…` | **Verificado** Entra lo niega (`AADSTS501051`) |
| 7 | App Entra ajena **con** rol `Gateway.Invoke` y audiencia correcta, directa | **Verificado** 403 (`allowedApplications`/`allowedPrincipals`). App y asignación temporales eliminadas |
| 8 | Directa `/.auth/me`, `/healthx`, `/health/x`, `/health/../v1/...`, `/health%2F..%2F...` | **Verificado** 401 |
| 9 | Directa `/health` | **Verificado** 200 (excluida). Sondas: contenedor y sidecar `ready`, 0 reinicios |
| 10 | APIM → 3 operaciones reenviadas | **Verificado** llegan a Java (404 `ROUTE_NOT_FOUND` con `correlationId`, flags apagados) |
| 11 | APIM con `Authorization` de cliente y `X-MS-*`/`X-MTEC-User-Authorization` falsos | **Verificado** llega a Java con la identidad de APIM (el `Authorization` del cliente se sustituye). La eliminación en Java no es observable con flags apagados: **No determinado** por tráfico |
| 12 | Denegaciones existentes | **Verificado** `ADMISSION_DISABLED`, `INTERNAL_JWT_UNCONFIGURED`, `OPERATION_NOT_RELEASED`, `REFRESH_INVALID`; origen ajeno sigue cortado por CORS |
| 13 | Políticas almacenadas | **Verificado** idénticas a la exportación previa salvo las dos líneas nuevas; flags 13/13 `false`; escala 0–1 |

La respuesta 401 del sidecar solo expone `WWW-Authenticate: Bearer realm="<host>"`, `x-ms-middleware-request-id` y HSTS.

### 12.5 Rollback

Instantáneas previas (políticas de las 22 operaciones y del ámbito API, Container App y su `authConfigs` vacío)
tomadas antes de cambiar nada. Orden inverso, sin cortar tráfico:

1. Container Apps: `az containerapp auth update -n ca-ms-users-stg -g acalderon-TEC --subscription 26db4383-… --enabled false`.
2. APIM: reaplicar la política exportada de las 3 operaciones (sin las dos líneas nuevas).
3. Opcional: desactivar la identidad de APIM y borrar `markettec-ms-users-stg-gateway`.
4. Sonda: reactivar la revisión `ca-ms-users-stg--rf574c71p` (sonda anterior) o reaplicar `initialDelaySeconds=10`,
   `periodSeconds=10`.

No aplicar el paso 1 sin el 2 al revés: activar la autenticación sin `authentication-managed-identity` en APIM corta
las tres operaciones (401).

## 13. Arranque en frío y D-04

### 13.1 Arranque en frío (escala 0–1)

APIM no corta la espera: `forward-request` hereda el valor por defecto de 300 s (Azure documenta que más de 240 s
puede no respetarse) y el ingreso de Container Apps admite 240 s. Medido a través de APIM: 34,6 s y 45,1 s. Línea
temporal de los registros del sistema (2026-11-09 13:42): ~14 s programación y descarga de imagen, ~10 s creación del
contenedor, ~6 s Spring Boot, ~4 s de espera de la sonda Startup (`initialDelaySeconds=10`).

El fallo real estaba en Angular V2: el adaptador HTTP cortaba a 15 s y el coordinador de sesión a 10 s. Un corte del
primer `POST /refresh` mientras Java aún puede procesarlo arriesga perder la rotación del refresh token. Cambios:

* Angular: `AUTH_V2_COLD_START_BUDGET_MS = 70 s` (adaptador) y 75 s (coordinador), con prueba que los mantiene por
  encima del arranque observado y por debajo de 240 s. V2 sigue deshabilitado.
* Container App: sonda Startup `initialDelaySeconds 10→1`, `periodSeconds 10→3` (`failureThreshold` 30, ~90 s de
  margen). Revisión `ca-ms-users-stg--w8dnrtz`, misma imagen, flags y escala.
  **Verificado** con una muestra tras escalar a cero (14:04 UTC): 25,9 s a través de APIM con la autenticación de
  Container Apps activa (sidecar incluido). Una sola medición: la variación de la plataforma no está caracterizada.
* Sin sondeos periódicos ni `minReplicas=1`. **Inferido** (tarifa pública de reposo, no verificada en la factura):
  una réplica permanente de 0,5 vCPU / 1 GiB costaría ~US$10–12/mes tras la concesión gratuita, casi la mitad del
  presupuesto de US$25; solo con autorización expresa.

### 13.2 D-04: same-origin sin dominio propio (SWA Free + Functions administradas)

No hay dominio propio y el operador no puede adquirirlo ni solicitarlo (2026-11-09). En su lugar, la SPA y su API
comparten **un mismo origen**: la Function administrada `app/frontend/api` expone `https://<swa>/api/users/v1/...` y
reenvía a `https://markettec-api.azure-api.net/users/v1/...`. Las cookies `__Host-` que fija ms-users son cookies de
primera parte, solo de host, de la Static Web App: D-04 se cumple sin que intervenga la Public Suffix List. Coste: US$0
(SWA Free con Functions administradas, sin cambiar de plan).

| Capa | Control |
| --- | --- |
| Navegador → `/api/users/*` | Mismo origen, sin CORS. `withCredentials` y CSRF funcionan igual que antes |
| Function (`lib/proxy.js`) | Solo `GET`/`POST`/`PUT` en `/v1/<segmentos simples>`; rechaza `Sec-Fetch-Site` cross-site o same-site y cualquier `Origin` distinto de `MTEC_PUBLIC_ORIGIN`. Si un `GET` llega sin `Origin` y con `Sec-Fetch-Site: same-origin` (el navegador puede omitirlo), reenvía `Origin: MTEC_PUBLIC_ORIGIN`; sin esa cabecera no añade nada, y nunca a escrituras. Reenvía solo `Accept`, `Authorization`, `Content-Type`, `Cookie`, `Origin`, `X-CSRF-Token`, `X-MTEC-Client` y `X-Correlation-ID`, de modo que se descartan `x-ms-client-principal` de SWA y las cabeceras de identidad falsificadas. Devuelve `Set-Cookie` con los mismos atributos y descarta los que traen `Domain` o un `__Host-` mal formado. Sin `Access-Control-*`. Falla cerrado (503 `PROXY_UNCONFIGURED`) sin `MTEC_USERS_UPSTREAM`/`MTEC_PUBLIC_ORIGIN` |
| APIM | Sin cambios de lógica: Origin, cookie, CSRF, CORS, `validate-jwt` e identidad administrada hacia Container Apps (§12). El origen de la SWA debe figurar en `allowed-origins` y en el CORS del ámbito API |
| Container Apps / Java | Sin cambios (§12) |

**Límite de 45 s de SWA y arranque en frío.** SWA corta toda petición `/api` a los 45 s, y el arranque en frío medido
es de 26–45 s. El proxy trabaja con un plazo de 38 s:

* El plazo cubre la respuesta completa, cuerpo incluido, no solo las cabeceras.
* `GET`: si no hay respuesta a tiempo, devuelve 503 `BACKEND_WARMING` (`Retry-After: 3`). Las lecturas pueden repetirse.
* `POST`/`PUT`: solo se reenvían si ms-users está caliente. Si no lo está, el proxy hace primero un
  `GET /v1/auth/session` sin credenciales a través de APIM, con `Origin` de la SWA y un `X-Correlation-ID` nuevo.
  ms-users solo cuenta como caliente si la respuesta (no 5xx) devuelve ese mismo `X-Correlation-ID`: el
  `CorrelationIdFilter` de Java lo repite en toda respuesta, mientras que las denegaciones terminales de APIM
  (`return-response`, p. ej. 401 `REFRESH_INVALID`) no lo llevan. Si esa evidencia falta, la petición no termina a
  tiempo o deja menos de 8 s para la escritura, el proxy responde 503 `BACKEND_WARMING` **sin haber enviado la escritura**. Una escritura que
  agota el plazo después de enviarse devuelve 504 `UPSTREAM_TIMEOUT`, que nunca se reintenta. El estado «caliente»
  dura 120 s, por debajo del enfriamiento de 300 s de Container Apps.
* Angular V2 repite solo 503 `BACKEND_WARMING`, cada 3 s, dentro de su tope total de 70 s. No reintenta ningún otro
  error.
* MTEC-37: cada intento hacia el proxy same-origin lleva `X-MTEC-Client-Budget-Ms` con el presupuesto restante de
  Angular. El plazo del proxy pasa a ser el menor entre 38 s y ese presupuesto menos 2 s. Así una escritura nunca se
  envía después de que el navegador haya dejado de esperarla: antes, un `POST` podía llegar a Java tras el `TIMEOUT`
  de Angular y su respuesta (p. ej. la rotación de refresh) se perdía. El proxy no reenvía este encabezado a APIM, y
  Angular no lo envía a un origen ajeno. Con un arranque de más de 70 s, el `GET /session` inicial termina en
  `unavailable` sin `POST` y la sesión local se conserva. Los `GET` de calentamiento ya han despertado ms-users, así
  que la siguiente demanda de token se recupera.

**Entorno de verificación:** entorno de preview `d04` de la SWA `markettec`
(`https://victorious-beach-0a55f0c1e-d04.westus2.2.azurestaticapps.net`), desplegado desde esta rama con app settings
propios (`MTEC_USERS_UPSTREAM`, `MTEC_PUBLIC_ORIGIN`, `MTEC_D04_PROBE=enabled`). Su origen se añadió en APIM a
`allowed-origins` y al CORS del ámbito API. Producción (`default`) no cambia: su job de despliegue sigue deshabilitado
y `/api` allí sigue sirviendo la SPA.

Despliegue manual (el job de GitHub está deshabilitado): StaticSitesClient en `linux/amd64` con
`DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1`, `SKIP_APP_BUILD=true`, `SKIP_API_BUILD=true` (la API no tiene
dependencias) y `DEPLOYMENT_ENVIRONMENT=d04`. El token de despliegue se lee con `az staticwebapp secrets list` y no se
guarda.

**Pruebas en navegador real** (panel de Claude, Chromium, 2026-11-09, con los flags apagados):

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | La SPA carga en el origen del preview | **Verificado** |
| 2 | La cookie `__Host-` fijada por `/api` (sonda) | **Verificado**: `Set-Cookie: __Host-mtec-probe=…; max-age=300; path=/; secure; samesite=lax; httponly`, sin `Domain`; se devuelve en la siguiente petición (`cookieCount=1`) y no aparece en `document.cookie` |
| 3 | `Authorization` atraviesa el edge de SWA | **Verificado** (la sonda lo ve). `Sec-Fetch-Site: same-origin` |
| 4 | `GET /api/users/v1/auth/session` | **Verificado**: 404 `ROUTE_NOT_FOUND` de Java, sin `Access-Control-Allow-Origin` |
| 5 | `POST /refresh` sin cookie / con cookie sin CSRF / con cookie y CSRF | **Verificado**: 401 `REFRESH_INVALID`, 403 `CSRF_INVALID` (APIM) y 404 de Java. La cookie y el CSRF llegan a APIM |
| 6 | Denegaciones | **Verificado**: `ADMISSION_DISABLED`, `INTERNAL_JWT_UNCONFIGURED`, `OPERATION_NOT_RELEASED`; `%2e%2e` y `DELETE` → 404 sin reenvío |
| 7 | Origen ajeno, `Sec-Fetch-Site: cross-site`, origen de producción contra el preview | **Verificado**: 403 en el proxy |
| 8 | Arranque en frío: `POST /logout` desde el navegador con ms-users a cero réplicas | **Verificado**: 404 de Java en 30,0 s (por debajo de 45 s). Los registros de Java muestran el `GET` de calentamiento (14:42:31.59) y **un único** `POST` 123 ms después. La rama `BACKEND_WARMING` (arranque > 30 s) solo está cubierta por pruebas unitarias |

**Pendiente para habilitar las cookies reales:**

1. ms-users: `USERS_SESSION_HTTP_ALLOWED_ORIGINS` y `USERS_SESSION_HTTP_PUBLIC_API_ORIGIN` = origen de la SWA (el
   navegador ve la API en ese origen); lo mismo para `USERS_GOOGLE_HTTP_*`. Los flags `*_TOPOLOGY_VERIFIED` /
   `*_SAME_SITE_VERIFIED` solo tras repetir las pruebas 2–5 con cookies emitidas por Java.
2. Producción: llevar `api_location` y los app settings a `default` cuando se habilite el despliegue aprobado.
   `environment.apiBaseUrl = https://victorious-beach-0a55f0c1e.2.azurestaticapps.net/api/users`.
3. Desactivar la sonda (`MTEC_D04_PROBE`) fuera del entorno de verificación.
4. Rollback: borrar el entorno `d04` (`az staticwebapp environment delete … --environment-name d04`) y devolver
   `allowed-origins` y el CORS del ámbito API al único origen de producción (instantáneas en el directorio de
   rollback del operador).
