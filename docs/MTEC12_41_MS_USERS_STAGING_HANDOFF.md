# MTEC-12 / MTEC-41 — APIM para ms-users: entrega para staging

**Fecha:** 2026-11-08. **Estado:** configuración candidata en Git. **No** desplegada, **no** validada en Azure,
**no** aprobada para despliegue. No aprueba B07 ni D-04 y no activa ningún flag.

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
| Políticas por operación, política de API (CORS) y definición de API | **Generadas localmente**; solo comprobación estructural local |
| Políticas validadas en un gateway de Azure | **No realizado** |
| `subscriptionRequired=false` en la API nueva | **Declarado, no aplicado** |
| Aprobaciones (`approvals.*`), `target` | `null`; sin evidencia |
| Despliegue y activación | **No aprobados**; `authCoreV2=false` y flags Java en `false` |

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
   HTTPS de ms-users en App Service, sin ruta. No añadirla a productos con suscripción salvo decisión revisada.
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
* **No determinado:** ms-users también emite cabeceras CORS. Debe comprobarse en el gateway que cada respuesta lleve
  un único `Access-Control-Allow-Origin` y que el CORS global no contradiga al de la API.

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
