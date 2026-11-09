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
**D-04 no se cumple** con los hosts por defecto. Se necesita un dominio registrable propio con dos dominios
personalizados (por ejemplo `app.<dominio>` en la SWA y `api.<dominio>` en APIM). La autenticación sigue cerrada.

### 11.6 Acceso directo al Container App

`ca-ms-users-stg` tiene ingreso externo sin restricciones de IP ni autenticación de plataforma, y APIM no tiene
identidad administrada. Cualquier cliente puede evitar APIM y llamar a ms-users; hoy no hay superficie sensible porque
los 13 flags están apagados (todas las rutas devuelven 404). **No se deben activar flags mientras siga así.** Opciones
en el entorno actual (perfil Consumption, sin VNet):

| Opción | Viabilidad |
| --- | --- |
| Restricción de IP del ingreso | No fiable: APIM Consumption no tiene IP de salida fija y el ingreso de ACA no admite service tags |
| Entorno interno + VNet | No viable: APIM Consumption no se integra en VNet |
| Autenticación de plataforma de ACA (Entra ID) + identidad administrada de APIM con `authentication-managed-identity` | Viable sin cambiar Java ni coste adicional; requiere registrar una aplicación, activar la identidad de APIM y excluir `/health`. **Recomendada**, pendiente de aprobación |
| Secreto compartido inyectado por APIM o mTLS | Requiere validación en Java (fuera de este incremento) |

### 11.7 Bloqueos para habilitar Google

1. D-04: dominios personalizados en el mismo *site* y prueba de navegador (§10.8).
2. Cierre del acceso directo al Container App (§11.6).
3. JWT interno: configurar en ms-users issuer, audience y claves, y revisar el JWKS publicado; regenerar sin
   `--jwt-unconfigured`.
4. `abuse_protection` compatible con Consumption (§7.3), con documento de evidencia real.
5. B07 / `ms_users_contract` y la discrepancia `apimSubscriptionKey` del OpenAPI (§8).
6. Repetir CORS con flags activos y el preflight del perfil (§11.4).

### 11.8 Coste y rollback

* Recursos nuevos: una API, 22 operaciones con sus políticas y un named value en la APIM Consumption existente. Sin
  coste fijo; las llamadas se facturan por uso de Consumption (con cuota gratuita mensual). Las pruebas despertaron el
  Container App unas pocas veces (escala 0–1). Sin sondeos periódicos.
* Rollback: eliminar la API `markettec-users-v1` y el named value `allowed-origins`, o reaplicar `terminal_deny` a las
  tres operaciones reenviadas. `markettec-api-v1` no depende de nada de lo anterior.
