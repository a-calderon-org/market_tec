# MTEC-15 / B07 — Registro de decisiones y pendientes

**Fecha:** 2026-11-07 (America/Costa_Rica). **Estado:** consolidación documental; **B07 no está aprobado** y no se registra ninguna conformidad de equipo. **Bases verificadas:** MarketTec `afb423bb73e43fd033f67dbc354728960e8a071c`, ms-users `20898978d7f49c38e21b49187250bdd1821c370f` (ambas eran la cabeza de `origin/main` al iniciar), OpenAPI Users `0.3.0-draft`.

**Fuentes leídas:** [ADR-004](../context/decisions/ADR-004-seguridad-autenticacion.md) (§2.1, §3.1, §3.4.1), [DECISION_LOG](../context/decisions/DECISION_LOG.md), [contrato de identidad](../contracts/identity/IDENTITY_CONTRACT.md), [Users OpenAPI](../contracts/openapi/users.json), [política C](MTEC40_REFRESH_REPLAY_DECISION_PROPOSAL.md), [arquitectura de navegador](MTEC40_APPROVED_BROWSER_ARCHITECTURE.md), [revisión B07 local](MTEC15_B07_LOCAL_INTEROPERABILITY_REVIEW.md), descripciones Jira de MTEC-15, MTEC-36 y MTEC-40 (lectura; Jira no fue modificado) y el código de ms-users. El informe de auditoría B07 de Codex no estaba disponible como archivo en ninguno de los dos repositorios; la matriz se reconstruyó leyendo los controladores Java, el OpenAPI y los archivos Angular. Cada fila de [la matriz](MTEC15_B07_RECONCILIATION_MATRIX.md) apunta a un archivo, no al informe.

**Regla de lectura.** "Aprobado" significa aprobado expresamente por el responsable del proyecto (RP) y registrado en ADR-004, DECISION_LOG o Jira. El comportamiento Java se clasifica aparte: que exista y pase sus pruebas no lo convierte en decisión.

## 1. Decisiones actualmente aprobadas

| Id | Decisión | Fuente | Límite |
|---|---|---|---|
| A-01 | Arquitectura B ampliada: ms-users centraliza identidad, JWT y sesiones; APIM admite; cada backend revalida y autoriza. Google y correo institucional conviven en v1. | ADR-004 §2.1 (2026-11-01) | No aprueba contratos ni conformidades. |
| A-02 | Dominios exactos `estudiantec.cr`, `itcr.ac.cr`, `tec.ac.cr`; `userId` opaco; sin fusión por correo; sin privilegios por dominio. | ADR-004 §2.1 | Continuidad de buzones reasignados: ver D-02. |
| A-03 | Sesión: 60 min renovables, 30 min de inactividad, 8 h absolutas; vence el primero; el servidor es la autoridad. | ADR-004 §2.1, §3.4.1 | Medición de actividad: ver D-03. |
| A-04 | **Registro Google inmediato** (2026-11-04): ID Token válido, `email_verified=true`, dominio exacto, vínculo `(issuer, sub)`; crea cuenta, vínculo y sesión y responde `200 AuthResponse`, sin Magic Link. Login existente intacto; alias `/v1/auth/google/registrations` conservado. | DECISION_LOG "Registro Google institucional vigente"; Jira MTEC-15/MTEC-36 | Magic Link sigue sin implementar: ver D-02. |
| A-05 | Magic Link es un método independiente y no implementado; sus dos rutas responden `503 AUTH_TEMPORARILY_UNAVAILABLE`. | DECISION_LOG; IDENTITY_CONTRACT §3 | — |
| A-06 | JWT RS256/RSA-2048; claims `iss aud sub sid iat exp jti`; `kid` en el header JOSE; TTL nominal ≤240 s; `exp` acotado al primer deadline; cero tolerancia positiva. | ADR-004 §3.4.1 (B05 D1–D3) | Valores de `iss`/`aud` por entorno, márgenes de reloj y la cota residual ≤300 s no están demostrados. |
| A-07 | Clave privada solo en ms-users; JWKS público; públicas aprovisionadas a APIM y backends. | ADR-004 §3.4.1 (B05 D2) | Rotación, caché y propagación sin ensayar. |
| A-08 | Access JWT y CSRF solo en memoria; refresh opaco y rotatorio en cookie HttpOnly, Secure, host-only; sincronizador CSRF; preferencia same-site; CORS explícito sin comodín con credenciales. | ADR-004 §3.4.1 (B06 D4–D5) | Nombres, SameSite, Path y hosts reales siguen como propuesta. |
| A-09 | Refresh serializado incluso entre pestañas, sin gracia general. | ADR-004 §3.4.1 (B06 D6) | Protocolo concreto: ver D-07. |
| A-10 | **Política C de refresh replay** (2026-11-04): consumo único; generación consumida rechazada sin reemisión; respuesta pública `401 REFRESH_INVALID`; un replay aislado **no** revoca a la ganadora; la revocación exige logout, recuperación autorizada o compromiso confirmado con evidencia independiente. | ADR-004 §3.4; Jira MTEC-40 | Ver I-13: Java ya emite el evento `refresh_audit`; siguen pendientes evidencia operativa, retención, alertas, procedimiento de incidente y pruebas en entorno. No es una validación de producción. |
| A-11 | Residual de JWT tras revocación ordinaria ≤300 s como objetivo verificable; fail-closed si falta la garantía; una caída de ms-users no invalida JWT verificables localmente. | ADR-004 §3.4.1 (B01 D1–D3) | Sin cota demostrada. |
| A-12 | Topología objetivo: Angular en Static Web Apps y APIM como entrada, dos orígenes HTTPS del mismo *site*. | MTEC40_APPROVED_BROWSER_ARCHITECTURE | Hosts, DNS y políticas reales no determinados. |
| A-13 | La subscription key de APIM no es identidad ni secreto de SPA (MTEC-41, abierto). | FRONTEND_BACKEND.md; MTEC-41 | Eliminación de la key en las operaciones OpenAPI sin cerrar. |

## 2. Comportamiento implementado en ms-users pero no aprobado contractualmente

Todo esto existe en `ms-users@2089897`, tras flags que por defecto están apagados. No debe leerse como decisión.

| Id | Comportamiento observado | Por qué no está aprobado |
|---|---|---|
| I-01 | Cookies con `SameSite=Lax`, `Path=/`, `Secure`, `HttpOnly`, host-only; intento Max-Age 300 s. | SameSite y hosts pendientes (B06). |
| I-02 | `purpose` omitido en `POST /v1/auth/attempts` equivale a `login`. | OpenAPI exige `purpose`. |
| I-03 | Login de identidad desconocida devuelve `401 AUTH_PROOF_INVALID`; `REGISTRATION_REQUIRED` nunca se emite. | El contrato lo documenta; el código no lo implementa. |
| I-04 | Códigos de error fuera del enum OpenAPI: `AUTH_REQUIRED`, `USER_NOT_FOUND`, `USER_DEACTIVATED`, `CONCURRENT_MODIFICATION`, `ACTIVITY_EVIDENCE_REQUIRED`, `INSTITUTIONAL_EMAIL_REQUIRED`, `INTERNAL_ERROR`, `ROUTE_NOT_FOUND`, `METHOD_NOT_ALLOWED`. | Catálogo de errores en B07. |
| I-05 | JWT ausente, vencido o inválido responde siempre `401 AUTH_REQUIRED`; `ACCESS_TOKEN_EXPIRED` no se emite. | Idem. |
| I-06 | Magic Link funcional tras `users.email.enabled=true` (solicitud 202 con cookie; confirmación 200 `AuthResponse`). | A-05 dice que debe responder 503 y B02 sigue abierto. |
| I-07 | `POST /v1/me/auth-methods` responde 201 con otro cuerpo; las pruebas de método devuelven `{verified:true}` y no `ProofGrant`. | B04 sin aprobar. |
| I-08 | `GET /v1/auth/session` exige `Origin`; `X-MTEC-Client` ausente da 400 en intentos/Google y 403 en sesión/refresh/logout. | Convenciones de petición sin acordar. |
| I-09 | JWKS y metadata con `Cache-Control: public, max-age=30`. | Frescura de caché B05 sin aprobar. |
| I-10 | `mode=rotate` y `scope=current` implementados; `mode=continue` y `scope=all` responden 400. | Coincide con el contrato; falta aprobación de la interfaz completa. |
| I-11 | `POST /v1/auth/session/activity` autentica y rechaza siempre con `403 ACTIVITY_EVIDENCE_REQUIRED`. | B03 sin protocolo; correcto como bloqueo. |
| I-12 | El manifiesto APIM marca como `reconciled` casi todas las operaciones, incluidas las de forma divergente. | Es una etiqueta local de `infra/apim/operations.json`; las aprobaciones `approvals.*` siguen en `null`. |
| I-13 | **Auditoría de refresh observada en código:** Java emite un evento estructurado `refresh_audit` (`eventType=session_refresh`) con `outcome` en `rotated`, `consumed_confirmed`, `proof_invalid`, `session_closed`, `policyVersion=C-1` y `sessionRef` derivada de 16 hex, sin secretos (`SessionAuthority`, `SessionRefreshController`, `SafeJsonLogFormatter`). | La capacidad existe; **no** hay evidencia operativa, retención, alertas, procedimiento de incidente ni pruebas en entorno. La política C aprobada en MTEC-40 no cambia. |

## 3. Propuestas anteriores sustituidas

| Propuesta | Sustituida por | Dónde sigue apareciendo |
|---|---|---|
| Enlace institucional obligatorio **antes** de crear cuenta o sesión Google (handoff 2026-11-04, `POST /v1/auth/google` devolvía 202). | A-04, registro inmediato con `200 AuthResponse`. | Jira MTEC-15/MTEC-36 (secciones "Histórico sustituido"), DECISION_LOG "decisión histórica sustituida", partes de [MTEC15_AUTH_CONTRACT_RELEASE_REVIEW](MTEC15_AUTH_CONTRACT_RELEASE_REVIEW.md). |
| Política de refresh que revocaba la familia incluida la ganadora y `REFRESH_REUSED`. | A-10, política C. | Jira MTEC-40 (marcado superado). |
| JWT candidato de 900 s; HS256 y `jwt-secret` en la receta Azure histórica. | A-06. | `context/phase2/*`, AZURE_INFRASTRUCTURE. |
| Google ID Token como bearer de las APIs; fallback a Google `sub`. | Sesión interna con `AuthResponse`. | Angular actual (`google-auth.service.ts`). |
| "`GET /health` es la única operación implementada" del contrato. | Es verdad solo respecto de `x-implementation-status`; ver §4.1. | IDENTITY_CONTRACT §1 y README de ms-users (corregidos en este incremento). |
| Revisión B07 local del 2026-11-03: "fundación local solo `/health`". | Descripción de la base `05d84be`; ms-users ya expone las 22 rutas. | MTEC15_B07_LOCAL_INTEROPERABILITY_REVIEW (se añadió nota de vigencia). |

## 4. Correcciones documentales aplicadas (seguras)

1. **IDENTITY_CONTRACT §1** citaba `ms-users/main@3f776f6` y presentaba `GET /health` como único elemento operativo. Ahora separa el estado contractual (solo `/health` figura `implemented`) del código observado en `2089897`.
2. **README de ms-users**, línea 34: "El único endpoint implementado es `GET /health`; el resto devuelve 404." Era la descripción de la fundación original. Se corrige en el PR acompañante del repositorio ms-users.
3. **MTEC15_B07_LOCAL_INTEROPERABILITY_REVIEW**: nota de vigencia al inicio. El texto original se conserva como registro histórico.
4. [contracts/README.md](../contracts/README.md): enumera los archivos nuevos.

No se modificaron OpenAPI, DTO, Java, Angular, APIM, Azure ni Jira.

## 5. Decisiones abiertas

Cada decisión indica una **propuesta recomendada**, una alternativa, el riesgo y la aprobación requerida. Ninguna está aprobada. Las filas se citan desde la matriz con su id `D-xx`.

### D-01 — Sustituir el token Google por la sesión interna en Angular
- **Recomendada:** Angular deja de guardar y enviar el Google ID Token. Solo lo usa una vez, para el intercambio. Guarda en memoria (signals) el JWT interno, el `csrfToken` y el `AuthResponse.user`. Se elimina `sessionStorage['google_token']`.
- **Alternativa:** persistir el JWT interno en `sessionStorage` para sobrevivir a la recarga. **Descartada**: contradice B06 D4 y exige una aprobación expresa de seguridad.
- **Riesgo:** la recarga pierde el access JWT. Se recupera con `GET /v1/auth/session` + `POST /v1/auth/refresh` (D-07). Si la cookie está bloqueada, hay que reautenticar.
- **Aprobación:** el cambio ya cae dentro de B06 D4. El responsable de Angular y seguridad deben registrar conformidad; ningún cambio de almacenamiento sin aprobación expresa.

### D-02 — B02: continuidad de identidad y Magic Link
- **Recomendada:** mantener `users.email.enabled=false` en todo entorno hasta aprobar el protocolo B02 (WebAuthn/códigos de recuperación, buzón reasignado, perfil inicial). Las rutas email siguen en 503. No tocar Java: es un control por configuración, no un cambio de comportamiento.
- **Alternativa:** retirar del código los controladores email hasta B02. Evita que una configuración errónea emita sesiones, pero es un cambio de Java que requiere autorización.
- **Riesgo:** con el flag activado, Java emite sesiones por un método que la decisión vigente declara no implementado, y la continuidad de un buzón reasignado queda sin resolver (M-24, M-26).
- **Aprobación:** RP y seguridad. Agregar al inventario de flags prohibidos de la liberación (ver el plan del incremento).

### D-03 — B03: evidencia real de actividad
- **Recomendada:** declarar `POST /v1/auth/session/activity` **bloqueado** en contrato y fixtures. La inactividad de 30 min solo avanza cuando exista evidencia autenticada de servidor; mientras tanto, Angular no lo llama y no se documenta como operativo.
- **Alternativa:** aceptar `interactionId`/`kind` del cliente como actividad. Rechazada: no prueba ejecución ni correlación de servidor (B03 aprobado).
- **Riesgo:** sin actividad real, la sesión vence a los 30 min aunque el usuario trabaje, y el aviso no puede basarse en actividad.
- **Aprobación:** RP más seguridad; protocolo de productores, allowlist y deduplicación atómica pendiente.

### D-04 — B05/B06: cookies, SameSite, hosts, CORS y CSRF
- **Recomendada:** mantener como parámetros de prueba `__Host-mtec-attempt` y `__Host-mtec-refresh`, `Path=/`, `SameSite=Lax`, solo si los hosts reales son *same-site* HTTPS. Registrar hosts, tabla CORS exacta (orígenes, métodos, headers, credenciales) y una prueba de navegador antes de activar `users.google.http.same-site-verified` o `users.session.http.https-topology-verified`.
- **Alternativa:** `SameSite=None; Secure` con CSRF reforzado y pruebas de cookies de terceros. Más frágil en navegadores; requiere decisión formal nueva.
- **Riesgo:** sin hosts reales, los flags de topología verificada se pondrían a `true` sin evidencia. Esos flags son la barrera que impide la exposición prematura.
- **Aprobación:** APIM/infraestructura, seguridad, Angular y ms-users.

### D-05 — Política C de refresh replay
- **Recomendada:** **sin cambio.** Mantener política C tal como está aprobada. Angular nunca reintenta un refresh fallido de forma automática ni revoca por un 401 aislado.
- **Alternativa:** ninguna propuesta; la alternativa B (revocar familia) fue evaluada y descartada por el RP.
- **Riesgo residual aceptado por el RP:** quien robe una cookie y gane la primera rotación conserva la generación activa hasta vencimiento o revocación.
- **Aprobación:** ya aprobada. Java ya emite `refresh_audit` (I-13). Pendientes de producción, en MTEC-40: evidencia operativa, retención, alertas, procedimiento de incidente y pruebas en entorno.

### D-06 — Flujo Google: login, registro y errores
- **Recomendada:** (a) Angular ofrece dos acciones, "Ingresar" (`purpose=login`) y "Crear cuenta" (`purpose=register`), cada una con su intento y su nonce. (b) El registro inmediato se activa con `users.google.registration.enabled`. (c) Para distinguir "no registrado" de "prueba inválida", proponer que Java emita `REGISTRATION_REQUIRED` en el login de identidad desconocida solo después de una prueba Google válida. Hasta aprobarlo, Angular muestra un mensaje genérico con la acción "Crear cuenta".
- **Alternativa:** un único botón; Java decide login o registro según exista el vínculo. Simplifica la UI pero reintroduce un alta implícita en el login, que ADR-004 pide evitar.
- **Riesgo:** (c) revela que una cuenta Google verificada es desconocida; tras prueba válida el riesgo es bajo, pero es una decisión de privacidad. Sin (c), la UX es peor pero segura.
- **Aprobación:** RP (privacidad de la respuesta), Angular y ms-users. Es un cambio de Java solo en (c).

### D-07 — Refresh entre pestañas y respuesta perdida (PENDIENTE; propuesta, no algoritmo autorizado)
- **Propuesta en discusión:**
  1. Un refresh en vuelo por pestaña.
  2. Exclusión mutua real entre pestañas que cubra **bootstrap, refresh y aplicación del resultado**. Candidato: Web Locks (`navigator.locks`). `BroadcastChannel` sirve solo para señales ("se rotó", "logout") y **no** es un mutex suficiente.
  3. Dentro de esa sección crítica, y no antes de adquirirla, `GET /v1/auth/session` para obtener el CSRF vigente.
  4. Un único `POST /v1/auth/refresh` por demanda; nunca se encadena automáticamente otro POST.
  5. Tras un fallo (401 `REFRESH_INVALID`, timeout o error de red), `GET /v1/auth/session` solo para **reconciliar estado**, sin disparar otro POST. Si responde 200, la sesión sigue viva y la próxima demanda de token (nueva demanda, no un encadenamiento) decide si rota; si responde 401, o no se puede recuperar una sesión válida, se reautentica.
  6. Coordinación con logout: un logout (propio o de otra pestaña) cancela refresh y restauraciones pendientes e impide que una restauración tardía reponga credenciales.
  7. No se comparten access JWT ni CSRF entre pestañas.
- **Alternativa:** compartir el access JWT por `BroadcastChannel`. Reduce rotaciones pero amplía la superficie de credenciales; requiere aprobación expresa.
- **Riesgo:** Web Locks no está en navegadores antiguos y no hay mutex equivalente probado; con la política C (sin gracia), una respuesta perdida tras el commit puede exigir reautenticar.
- **Aprobación:** Angular, seguridad y ms-users (B06 D6 exige protocolo concreto y pruebas). **Sin aprobar.**

### D-08 — Origen del `userId` y ruta de perfil
- **Recomendada:** `userId = AuthResponse.user.userId` (o `SessionResponse.user.userId`) en memoria. Perfil propio vía `GET/PUT /v1/me/profile`, que no necesita id en la ruta. `/usuarios/{userId}` queda para compatibilidad. Se eliminan `USR-001` y el uso de Google `sub`. "Mis publicaciones" depende de un contrato de Catalog que aún no existe: queda bloqueado, sin sustituir el id por uno inventado.
- **Alternativa:** mantener `/usuarios/{userId}` y poner el `userId` real. Funciona (owner-only) y cambia menos código, pero conserva el id en la ruta.
- **Riesgo:** `my-publications` seguirá sin datos reales hasta que Catalog defina `GET /v1/me/publicaciones` o equivalente.
- **Jira:** esta decisión se vincula con **MTEC-10** (consumo Angular de intentos/login, sesión y perfil propio, que sustituye Google `sub` y `USR-001`); el trabajo de Angular debe tramitarse allí. No se modificó Jira.
- **Aprobación:** Angular y ms-catalog para la parte de publicaciones.

### D-09 — Convenciones de petición y mapeo APIM
- **Recomendada:** (a) `purpose` obligatorio (Angular siempre lo envía; endurecer Java más adelante); (b) un solo código para `X-MTEC-Client` ausente; recomendación: `400 INVALID_REQUEST`; (c) `GET /v1/auth/session` exige `Origin`, y se documenta; (d) el manifiesto APIM marca la cookie de `getSessionState` como `required`; (e) verificar con APIM real si la ruta pública `/auth/*` sin `/v1` se corresponde con `/v1/auth/*`.
- **Alternativa:** dejar tal cual y documentar las diferencias.
- **Riesgo:** (b) y (c) cambian Java; (d) cambia el manifiesto APIM, pero **no** sus aprobaciones, que siguen en `null`.
- **Aprobación:** ms-users y APIM; no urgente para el primer incremento.

### D-10 — `refresh mode=continue` y `logout scope=all`
- **Recomendada:** fuera del primer incremento. Angular no los llama. Contrato y fixtures los marcan "no implementado".
- **Alternativa:** implementar `continue` para ampliar la ventana de 60 min con el aviso de B06. Depende de D-03 y del aviso.
- **Riesgo:** sin `continue`, la sesión se corta a los 60 min sin renovación voluntaria; con aviso a 300 s, el usuario solo puede reautenticar.
- **Aprobación:** RP (UX de ventana), seguridad.

### D-11 — Catálogo de errores y señal de expiración (PENDIENTE)
- **Propuesta en discusión:**
  - El catálogo OpenAPI incluiría los códigos que Java ya emite (I-04). Angular mapea por `code`, nunca por `message`.
  - Estructura real del error en Angular: `HttpErrorResponse.error` es el cuerpo, por lo que el código se obtiene con `error.error?.error?.code`. Se distinguen: error de red/CORS (`status === 0`), 401, 403 y envelope inesperado (cuerpo ausente o sin `error.code` textual). Un envelope inesperado produce un error genérico.
  - `exp` del JWT se usa solo como pista para programar el refresh, nunca como autoridad.
  - Un `401 AUTH_REQUIRED` **no** provoca por sí solo un refresh y repetición de cualquier petición. El primer incremento solo podría proponer, sujeto a aprobación, **un** reintento de un `GET` expresamente permitido, una sola vez, tras comprobar que el principal y la sesión siguen siendo los mismos. `PUT /v1/me/profile` y cualquier otra mutación quedan **excluidas** de toda política genérica de replay.
  - `Retry-After` (p. ej. en 429) no autoriza otro refresh automático.
- **Alternativa:** que Java emita `ACCESS_TOKEN_EXPIRED` para un JWT bien firmado pero vencido. Es más claro, pero distingue vencido de inválido (cambio de comportamiento e información expuesta).
- **Riesgo:** repetir una mutación tras un 401 puede duplicar efectos o ejecutarla con otro principal; por eso se excluyen. Un reintento de GET sigue chocando con la prohibición de reintentos automáticos del refresh si se interpreta mal.
- **Aprobación:** Angular, ms-users y seguridad. **Sin aprobar.**

### D-12 — Alcance prometido por el logout
- **Recomendada:** la UI dice "sesión cerrada", pero no promete invalidación inmediata de JWT ya emitidos (≤240 s). Tras `204`, Angular borra el estado en memoria y no reutiliza el token.
- **Alternativa:** esperar a B01 D4/D5 para una revocación distribuida.
- **Riesgo:** residual de hasta 240 s con un token ya emitido.
- **Aprobación:** ya contemplado en B01 D1; documentar.

### D-13 — B05: JWKS, issuer y audience
- **Recomendada:** fijar `iss`/`aud` por entorno en un registro de configuración y probar los validadores (Java, Node, Python, APIM) con los vectores existentes antes de integrar. Mantener `max-age=30` solo como valor de prueba.
- **Alternativa:** valores únicos por entorno comunes a todos los backends. Menos aislamiento entre servicios.
- **Riesgo:** un `aud` compartido permite replay entre servicios.
- **Aprobación:** seguridad y APIM.

### D-14 — B04: pruebas recientes, vínculo y logout global
- **Recomendada:** mantener `proofs/*`, `me/auth-methods` (POST) y `logout scope=all` bloqueados y fuera del núcleo. Sin cambios de DTO hasta aprobar propósito, método, consumo único y frescura (<300 s).
- **Alternativa:** aprobar la forma Java actual (`operation/target`, `{verified:true}`, 201). Rechazada: no entrega `ProofGrant` ni consumo único verificable.
- **Riesgo:** el flag `users.auth-methods.linking.enabled` debe seguir en `false`.
- **Aprobación:** RP y seguridad.

## 6. Qué impide la exposición prematura

Todo esto debe permanecer así hasta que cada responsable registre su conformidad. Ninguna de estas condiciones se cambia en el incremento actual.

| Condición | Estado actual | Quién la cambia |
|---|---|---|
| Flags de ms-users (`users.google.http.enabled`, `users.session.http.enabled`, `users.session.refresh.enabled`, `users.session.logout.enabled`, `users.api.http.enabled`, `users.internal-jwt.enabled`, `users.google.login-enabled`, `users.google.enabled`) | Todos `false` por defecto. | Operador, con autorización explícita. |
| `users.google.registration.enabled` | `false`. | RP (D-06). |
| `users.email.enabled`, `users.auth-methods.linking.enabled` | `false`; deben seguir así (D-02, D-14). | RP. |
| `users.*.same-site-verified` / `https-topology-verified` | `false`; el arranque falla si falta origen HTTPS verificado. | Solo con evidencia de hosts reales (D-04). |
| Aprobaciones APIM (`approvals.abuse_protection`, `approvals.ms_users_contract`) | `null`. | Revisión independiente registrada. |
| Perfil `sql-*` obligatorio para los controladores | Activo. | — |
| Angular: `environment.apiBaseUrl` | Vacío en `environment.example.ts`; sin URL, el interceptor no adjunta nada. | Pipeline de despliegue. |
| Flag de Angular para el nuevo cliente | No existe aún; el plan lo introduce apagado. Con `authCoreV2=false` se conserva el cliente legado **con sus riesgos actuales** (token de Google en `sessionStorage`, `USR-001`); el flag no certifica la seguridad del frontend. | Responsable de Angular. |

## 7. Conformidades B07

Ninguna registrada. Pendientes, sin cambios: ms-users, Angular, APIM + seguridad, ms-catalog, ms-notifications y aprobación contractual final del RP. Las pruebas de este incremento comprueban coherencia documental y fixtures; no sustituyen esas conformidades ni constituyen un registro de revisión.
