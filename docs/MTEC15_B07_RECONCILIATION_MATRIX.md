# MTEC-15 / B07 — Matriz de conciliación ejecutable

**Fecha:** 2026-11-07. **Estado:** borrador no aprobado; no registra conformidades. **Bases:** MarketTec `afb423bb73e43fd033f67dbc354728960e8a071c`, ms-users `20898978d7f49c38e21b49187250bdd1821c370f`, OpenAPI `0.3.0-draft`. **Fuente de verdad de esta tabla:** [`b07-reconciliation-matrix.json`](../contracts/examples/auth/b07-reconciliation-matrix.json); este archivo se genera a partir de él. Las pruebas `contracts/tests/test_b07_reconciliation.py` verifican que cada operación OpenAPI tenga fila, que los códigos HTTP del OpenAPI y las columnas APIM coincidan con `contracts/openapi/users.json` e `infra/apim/operations.json`, y que cada divergencia y decisión aparezca aquí y en el [registro de decisiones](MTEC15_B07_DECISION_REGISTER.md).

**Cómo leerla.** *Request/Response Java* se leyó en los controladores de `adapters/in/web`, no se ejecutó. *OpenAPI* es el borrador. Una divergencia es **doc-only** (se corrige texto o fixture), **behavior** (cambia Java o Angular; necesita la decisión citada) o **needs-authorization** (toca una decisión de seguridad reservada al responsable). Ningún cambio de comportamiento se aplica en este incremento. El informe de auditoría de Codex no estaba disponible como archivo; las filas se rehicieron desde los archivos fuente.

## 1. Resumen

| Operación | Ruta | Estado en Java | Códigos Java | Códigos OpenAPI | APIM (auth / cookie / CSRF) | Divergencias | Decisión |
|---|---|---|---|---|---|---|---|
| `getUsersHealth` | GET `/health` | always-on | 200 | 200 | public / none / none | — | — |
| `createAuthenticationAttempt` | POST `/v1/auth/attempts` | gated | 200 400 403 503 | 200 400 403 409 429 503 | public / none / none | M-01, M-02, M-03, M-04, M-05 | D-09 |
| `exchangeGoogleCredential` | POST `/v1/auth/google` | gated | 200 400 401 403 409 410 503 | 200 400 401 403 409 410 429 503 | cookie / required / required | M-06, M-07, M-08, M-09 | D-06 |
| `legacyGoogleRegistrationCompatibility` | POST `/v1/auth/google/registrations` | gated | 200 400 401 403 409 410 503 | 200 400 401 403 409 410 429 503 | cookie / required / required | M-10 | D-06 |
| `getSessionState` | GET `/v1/auth/session` | gated | 200 401 403 | 200 401 403 429 503 | cookie / optional / none | M-11, M-12, M-13 | D-07 |
| `refreshSession` | POST `/v1/auth/refresh` | gated | 200 400 401 403 | 200 400 401 403 429 503 | cookie / required / required | M-14, M-15, M-16 | D-07 |
| `logoutSession` | POST `/v1/auth/logout` | gated | 204 400 401 403 | 204 400 401 403 429 503 | cookie / optional / if_cookie | M-17, M-18 | D-12 |
| `getOwnUserProfile` | GET `/v1/me/profile` | gated | 200 401 403 404 503 | 200 400 401 403 404 409 429 503 | jwt / none / none | M-19, M-20 | D-11 |
| `updateOwnUserProfile` | PUT `/v1/me/profile` | gated | 200 400 401 403 404 409 503 | 200 400 401 403 404 409 429 503 | jwt / none / none | — | — |
| `getUserProfile` | GET `/v1/usuarios/{userId}` | gated | 200 400 401 403 404 503 | 200 400 401 403 404 409 429 503 | jwt / none / none | M-21 | D-08 |
| `updateUserProfile` | PUT `/v1/usuarios/{userId}` | gated | 200 400 401 403 404 409 503 | 200 400 401 403 404 409 429 503 | jwt / none / none | — | D-08 |
| `getPublicSigningKeys` | GET `/.well-known/jwks.json` | metadata-gated | 200 | 200 429 503 | public / none / none | M-22 | D-13 |
| `getIdentityMetadata` | GET `/.well-known/markettec-identity` | metadata-gated | 200 | 200 429 503 | public / none / none | M-23 | D-13 |
| `requestInstitutionalEmailLink` | POST `/v1/auth/email/requests` | gated | 202 400 403 503 | 503 | public / none / none | M-24, M-25 | D-02 |
| `confirmInstitutionalEmailLink` | POST `/v1/auth/email/confirm` | gated | 200 400 401 403 503 | 503 | cookie / required / required | M-26 | D-02 |
| `recordSessionActivity` | POST `/v1/auth/session/activity` | gated-refuses | 403 | 200 400 401 403 409 429 503 | jwt_cookie / required / required | M-27 | D-03 |
| `createMethodProofAttempt` | POST `/v1/auth/proofs/attempts` | gated | 200 400 401 403 503 | 200 400 401 403 409 410 429 503 | jwt_cookie / required / required | M-28, M-34 | D-14 |
| `verifyGoogleMethodProof` | POST `/v1/auth/proofs/google` | gated | 200 400 401 403 409 410 503 | 200 400 401 403 409 410 429 503 | jwt_cookie / required / required | M-29 | D-14 |
| `requestEmailMethodProof` | POST `/v1/auth/proofs/email/requests` | gated | 202 400 401 403 503 | 202 400 401 403 409 410 429 503 | jwt_cookie / required / required | M-30 | D-14 |
| `verifyEmailMethodProof` | POST `/v1/auth/proofs/email/confirm` | gated | 200 400 401 403 409 410 503 | 200 400 401 403 409 410 429 503 | jwt_cookie / required / required | M-31 | D-14 |
| `getOwnAuthMethods` | GET `/v1/me/auth-methods` | gated | 200 401 503 | 200 401 403 429 503 | jwt / none / none | M-32 | D-14 |
| `linkOwnAuthMethod` | POST `/v1/me/auth-methods` | gated-refuses | 201 400 401 403 409 503 | 200 400 401 403 409 410 429 503 | jwt_cookie / required / required | M-33 | D-14 |

`gated`: la ruta existe en Java pero solo se registra con sus flags y topología verificada (todos apagados por defecto). `gated-refuses`: existe y rechaza por diseño. `metadata-gated`: requiere `users.internal-jwt.enabled`.

## 2. Detalle por operación

### Fundación

#### `getUsersHealth` — GET `/health`

- **Flags (Java):** ninguno
- **Request Java:** none
- **Request OpenAPI:** none
- **Response Java:** 200 HealthResponse
- **Response OpenAPI:** 200 HealthResponse
- **Cookies / JWT / Origin / CSRF:** cookies: ninguna; JWT: no; Origin: no; CSRF: no
- **Códigos HTTP y envelope:** Java 200; OpenAPI 200; envelope: n/a
- **APIM (`infra/apim/operations.json`):** auth `public`, cookie `none`, CSRF `none`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** none
- **Divergencias:** ninguna encontrada en la lectura.
- **Decisión contractual necesaria:** ninguna
- **Pruebas de aceptación:** AT-HEALTH-1

### Núcleo de autenticación (primer incremento)

#### `createAuthenticationAttempt` — POST `/v1/auth/attempts`

- **Flags (Java):** `users.google.http.enabled`, `users.google.http.same-site-verified`, `users.google.http.allowed-origins`, `users.google.http.public-api-origin`, `users.google.registration.enabled (register only)`
- **Request Java:** {method:'google', purpose?:'login'\|'register'}; unknown fields rejected; Origin allow-listed; X-MTEC-Client: web; purpose omitted defaults to login
- **Request OpenAPI:** {method, purpose} both required; method enum AuthMethod; register only with google
- **Response Java:** 200 {attemptId(32 lowercase hex), method, purpose, expiresAt, csrfToken, nonce}; Set-Cookie __Host-mtec-attempt HttpOnly Secure Path=/ SameSite=Lax Max-Age=300
- **Response OpenAPI:** 200 AttemptResponse; purpose enum also lists reauthenticate/link; nonce optional; SameSite pending B06
- **Cookies / JWT / Origin / CSRF:** cookies: attempt (set); JWT: no; Origin: sí; CSRF: no
- **Códigos HTTP y envelope:** Java 200 400 403 503; OpenAPI 200 400 403 409 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `public`, cookie `none`, CSRF `none`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** absent: login.ts uses one GIS callback; no attempt, no nonce
- **Divergencias:**
  - **M-01** · P1 · behavior · decisión D-09: Java accepts a missing purpose (defaults to login); OpenAPI requires it. Angular must always send purpose; tightening Java is a behavior change.
  - **M-02** · P3 · doc-only · decisión —: attemptId is documented as opaque (max 128); Java emits and accepts only 32 lowercase hex. Narrower acceptance is compatible for clients that echo the issued value.
  - **M-03** · P0 · needs-authorization · decisión D-04: SameSite=Lax and Path=/ are hard-coded in Java but SameSite/hosts are still pending B06 and no real hosts are verified. Implemented, not approved.
  - **M-04** · P1 · behavior · decisión D-06: purpose=register answers 503 AUTH_TEMPORARILY_UNAVAILABLE unless users.google.registration.enabled=true (default false). Angular must treat it as 'registration unavailable', not as a login failure.
  - **M-05** · P2 · behavior · decisión D-09: Missing or wrong X-MTEC-Client gives 400 INVALID_REQUEST here but 403 FORBIDDEN on session/refresh/logout. Pick one mapping.
- **Decisión contractual necesaria:** D-09
- **Pruebas de aceptación:** AT-ATTEMPT-1, AT-ATTEMPT-2, AT-ATTEMPT-3

#### `exchangeGoogleCredential` — POST `/v1/auth/google`

- **Flags (Java):** `users.google.http.enabled`, `users.google.login-enabled`, `users.google.enabled`, `users.internal-jwt.enabled`, `users.google.http.same-site-verified`
- **Request Java:** {attemptId(32 hex), credential(<=16384 chars)}; cookie __Host-mtec-attempt (64 hex) + X-CSRF-Token = sha256('mtec-attempt-csrf:'+secret); a register attempt is routed to the registration service when registration is enabled
- **Request OpenAPI:** GoogleAuthRequest {credential, attemptId}; Origin, X-MTEC-Client, X-CSRF-Token
- **Response Java:** 200 AuthResponse {token, tokenType:'Bearer', expiresAt, user{userId,email,nombre,fotoPerfil}, session{11 fields}, csrfToken}; Set-Cookie attempt cleared, __Host-mtec-refresh set (Max-Age = seconds to session deadline)
- **Response OpenAPI:** 200 AuthResponse (same shape); fotoPerfil optional in OpenAPI, always emitted by Java
- **Cookies / JWT / Origin / CSRF:** cookies: attempt (read, then cleared), refresh (set); JWT: no; Origin: sí; CSRF: sí
- **Códigos HTTP y envelope:** Java 200 400 401 403 409 410 503; OpenAPI 200 400 401 403 409 410 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `cookie`, cookie `required`, CSRF `required`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** absent: GoogleAuthService.signIn stores the Google credential as the session token
- **Divergencias:**
  - **M-06** · P0 · behavior · decisión D-06: A login with an unknown Google identity returns 401 AUTH_PROOF_INVALID. OpenAPI documents REGISTRATION_REQUIRED, which Java never emits, so Angular cannot tell 'not registered' from 'bad proof'.
  - **M-07** · P0 · behavior · decisión D-06: The 2026-11-04 DECISION_LOG entry approves immediate Google registration with 200 AuthResponse. The older mandatory-link proposal is superseded. Java registers immediately only when users.google.registration.enabled=true and the attempt was created with purpose=register.
  - **M-08** · P2 · doc-only · decisión —: Java sets WWW-Authenticate: Bearer on every 401 of this route, including cookie/proof failures. Document it so Angular does not read it as 'send a bearer'.
  - **M-09** · P3 · doc-only · decisión —: 429 RATE_LIMITED is documented but never emitted by Java. Rate limiting is expected at APIM (apim abuse_protection approval is null).
- **Decisión contractual necesaria:** D-06
- **Pruebas de aceptación:** AT-GOOGLE-1, AT-GOOGLE-2, AT-GOOGLE-3, AT-GOOGLE-4

#### `legacyGoogleRegistrationCompatibility` — POST `/v1/auth/google/registrations`

- **Flags (Java):** `users.google.http.enabled`, `users.google.registration.enabled`
- **Request Java:** same body and proofs as /v1/auth/google
- **Request OpenAPI:** GoogleRegistrationRequest
- **Response Java:** 200 AuthResponse; 503 AUTH_TEMPORARILY_UNAVAILABLE when registration is disabled
- **Response OpenAPI:** 200 AuthResponse (compatibility alias)
- **Cookies / JWT / Origin / CSRF:** cookies: attempt (read, then cleared), refresh (set); JWT: no; Origin: sí; CSRF: sí
- **Códigos HTTP y envelope:** Java 200 400 401 403 409 410 503; OpenAPI 200 400 401 403 409 410 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `cookie`, cookie `required`, CSRF `required`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** absent
- **Divergencias:**
  - **M-10** · P2 · doc-only · decisión D-06: Alias kept for migration. Angular should call /v1/auth/google with a register attempt and not depend on the alias.
- **Decisión contractual necesaria:** D-06
- **Pruebas de aceptación:** AT-GOOGLE-3

#### `getSessionState` — GET `/v1/auth/session`

- **Flags (Java):** `users.session.http.enabled`, `users.session.http.https-topology-verified`, `users.session.http.allowed-origins`, `users.session.http.public-api-origin`
- **Request Java:** Origin required (single, allow-listed); X-MTEC-Client: web; refresh cookie (64 hex); request must be secure
- **Request OpenAPI:** Origin optional for some same-origin GET; X-MTEC-Client; refresh cookie
- **Response Java:** 200 SessionResponse {session, user, csrfToken}; no JWT, no rotation
- **Response OpenAPI:** 200 SessionResponse
- **Cookies / JWT / Origin / CSRF:** cookies: refresh (read); JWT: no; Origin: sí; CSRF: no
- **Códigos HTTP y envelope:** Java 200 401 403; OpenAPI 200 401 403 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `cookie`, cookie `optional`, CSRF `none`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** absent: authGuard.restoreSession decodes a Google token from sessionStorage
- **Divergencias:**
  - **M-11** · P1 · behavior · decisión D-09: Java requires Origin on this GET; OpenAPI says GET may omit it. A cross-origin fetch always sends Origin, so Angular is unaffected, but the contract text and Java disagree.
  - **M-12** · P1 · doc-only · decisión D-09: APIM manifest marks the refresh cookie 'optional' for this route; Java rejects a missing cookie with 401 REFRESH_INVALID. APIM must treat the cookie as required.
  - **M-13** · P1 · needs-authorization · decisión D-07: csrfToken returned here is the synchronizer for the current refresh generation. Another tab that rotated first invalidates a stale CSRF held by this tab. Tab protocol is not approved.
- **Decisión contractual necesaria:** D-07
- **Pruebas de aceptación:** AT-SESSION-1, AT-SESSION-2

#### `refreshSession` — POST `/v1/auth/refresh`

- **Flags (Java):** `users.session.refresh.enabled`, `users.session.http.* (verified topology)`, `users.internal-jwt.enabled`
- **Request Java:** body exactly {mode:'rotate'}; refresh cookie (64 hex) + X-CSRF-Token (64 hex); Origin; X-MTEC-Client: web
- **Request OpenAPI:** RefreshRequest {mode: rotate\|continue}
- **Response Java:** 200 AuthResponse; new refresh cookie; mode=continue answers 400 INVALID_REQUEST
- **Response OpenAPI:** 200 AuthResponse
- **Cookies / JWT / Origin / CSRF:** cookies: refresh (read, rotated); JWT: no; Origin: sí; CSRF: sí
- **Códigos HTTP y envelope:** Java 200 400 401 403; OpenAPI 200 400 401 403 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `cookie`, cookie `required`, CSRF `required`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** absent
- **Divergencias:**
  - **M-14** · P1 · doc-only · decisión D-05: Policy C is implemented: a consumed, invalid or mismatched proof yields 401 REFRESH_INVALID and a replay alone does not revoke the winner. Keep it. Missing or malformed CSRF also yields 401 REFRESH_INVALID, not 403 CSRF_INVALID.
  - **M-15** · P2 · behavior · decisión D-10: mode=continue is documented but not implemented (400). Angular must not call it.
  - **M-16** · P1 · needs-authorization · decisión D-07: Two tabs and lost responses: a loser tab holding a stale CSRF gets REFRESH_INVALID, which must not close the winner's session. Protocol is a recommendation only.
- **Decisión contractual necesaria:** D-07
- **Pruebas de aceptación:** AT-REFRESH-1, AT-REFRESH-2, AT-REFRESH-3, AT-REFRESH-4

#### `logoutSession` — POST `/v1/auth/logout`

- **Flags (Java):** `users.session.logout.enabled`, `users.session.http.* (verified topology)`
- **Request Java:** body exactly {scope:'current'}; Origin; single X-MTEC-Client: web; CSRF header required only when the refresh cookie is present
- **Request OpenAPI:** LogoutRequest {scope: current\|all, reauthenticationProofId?}
- **Response Java:** 204 and refresh cookie cleared (Max-Age=0), including when the cookie was absent; scope=all answers 400
- **Response OpenAPI:** 204
- **Cookies / JWT / Origin / CSRF:** cookies: refresh (read, cleared); JWT: no; Origin: sí; CSRF: sí
- **Códigos HTTP y envelope:** Java 204 400 401 403; OpenAPI 204 400 401 403 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `cookie`, cookie `optional`, CSRF `if_cookie`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** absent: GoogleAuthService.logout clears sessionStorage only
- **Divergencias:**
  - **M-17** · P1 · doc-only · decisión D-12: A 204 proves revocation in ms-users only. Already-issued access JWTs stay valid up to their exp (<=240 s nominal; residual <=300 s is documented, not demonstrated). Angular UI must not promise instant global logout.
  - **M-18** · P2 · behavior · decisión D-10: scope=all is not implemented (400) and depends on B04.
- **Decisión contractual necesaria:** D-12
- **Pruebas de aceptación:** AT-LOGOUT-1, AT-LOGOUT-2

### Perfil

#### `getOwnUserProfile` — GET `/v1/me/profile`

- **Flags (Java):** `users.api.http.enabled`, `users.internal-jwt.enabled`
- **Request Java:** Authorization: Bearer <internal JWT>; exactly one header
- **Request OpenAPI:** bearer or APIM key declared in security
- **Response Java:** 200 UserProfileV1 {id, nombreUsuario, nombre, apellidos, correo, fotoPerfil, fechaRegistro(ISO), createdAt(epoch), verificado, estado:'activo'}
- **Response OpenAPI:** 200 UserProfileV1 (same fields)
- **Cookies / JWT / Origin / CSRF:** cookies: ninguna; JWT: sí; Origin: no; CSRF: no
- **Códigos HTTP y envelope:** Java 200 401 403 404 503; OpenAPI 200 400 401 403 404 409 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `jwt`, cookie `none`, CSRF `none`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** profile/user.service.ts calls /usuarios/{id}; profile.ts falls back to the hard-coded id USR-001
- **Divergencias:**
  - **M-19** · P1 · doc-only · decisión D-11: Missing, expired or malformed access token answers 401 AUTH_REQUIRED. AUTH_REQUIRED is not in the OpenAPI error-code enum, and ACCESS_TOKEN_EXPIRED is never emitted, so expiry cannot be distinguished server-side.
  - **M-20** · P2 · doc-only · decisión D-11: Java also emits USER_NOT_FOUND, USER_DEACTIVATED, CONCURRENT_MODIFICATION, INTERNAL_ERROR, ROUTE_NOT_FOUND and METHOD_NOT_ALLOWED; none is in the OpenAPI enum.
- **Decisión contractual necesaria:** D-11
- **Pruebas de aceptación:** AT-PROFILE-1, AT-PROFILE-2

#### `updateOwnUserProfile` — PUT `/v1/me/profile`

- **Flags (Java):** `users.api.http.enabled`, `users.internal-jwt.enabled`
- **Request Java:** Bearer JWT; body exactly {nombreUsuario, nombre, apellidos} all strings; no CSRF header required
- **Request OpenAPI:** UpdateUserRequest (same three fields)
- **Response Java:** 200 UpdateUserResponseV1 incl. message 'Perfil actualizado'
- **Response OpenAPI:** 200 UpdateUserResponseV1
- **Cookies / JWT / Origin / CSRF:** cookies: ninguna; JWT: sí; Origin: no; CSRF: no
- **Códigos HTTP y envelope:** Java 200 400 401 403 404 409 503; OpenAPI 200 400 401 403 404 409 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `jwt`, cookie `none`, CSRF `none`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** user.service.ts PUT /usuarios/{id}
- **Divergencias:** ninguna encontrada en la lectura.
- **Decisión contractual necesaria:** ninguna
- **Pruebas de aceptación:** AT-PROFILE-3

#### `getUserProfile` — GET `/v1/usuarios/{userId}`

- **Flags (Java):** `users.api.http.enabled`, `users.internal-jwt.enabled`
- **Request Java:** Bearer JWT; path id must equal token sub, else 403 FORBIDDEN; malformed id 400
- **Request OpenAPI:** owner only
- **Response Java:** 200 UserProfileV1
- **Response OpenAPI:** 200 UserProfileV1
- **Cookies / JWT / Origin / CSRF:** cookies: ninguna; JWT: sí; Origin: no; CSRF: no
- **Códigos HTTP y envelope:** Java 200 400 401 403 404 503; OpenAPI 200 400 401 403 404 409 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `jwt`, cookie `none`, CSRF `none`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** current Angular consumer; id comes from Google sub or USR-001
- **Divergencias:**
  - **M-21** · P0 · behavior · decisión D-08: Angular builds this path from the Google sub or the literal USR-001; with an owner-only route every call except the owner's own id is a 403. userId must come from AuthResponse.user.userId.
- **Decisión contractual necesaria:** D-08
- **Pruebas de aceptación:** AT-PROFILE-4, AT-ANGULAR-USERID-1

#### `updateUserProfile` — PUT `/v1/usuarios/{userId}`

- **Flags (Java):** `users.api.http.enabled`, `users.internal-jwt.enabled`
- **Request Java:** Bearer JWT; path id equals sub; same three-field body
- **Request OpenAPI:** owner only; UpdateUserRequest
- **Response Java:** 200 UpdateUserResponseV1
- **Response OpenAPI:** 200 UpdateUserResponseV1
- **Cookies / JWT / Origin / CSRF:** cookies: ninguna; JWT: sí; Origin: no; CSRF: no
- **Códigos HTTP y envelope:** Java 200 400 401 403 404 409 503; OpenAPI 200 400 401 403 404 409 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `jwt`, cookie `none`, CSRF `none`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** user.service.ts
- **Divergencias:** ninguna encontrada en la lectura.
- **Decisión contractual necesaria:** D-08
- **Pruebas de aceptación:** AT-PROFILE-4

### JWKS y metadata

#### `getPublicSigningKeys` — GET `/.well-known/jwks.json`

- **Flags (Java):** `users.internal-jwt.enabled`
- **Request Java:** none
- **Request OpenAPI:** none
- **Response Java:** 200 JWKS, Cache-Control public max-age=30
- **Response OpenAPI:** 200 Jwks; cache TTL still to be agreed
- **Cookies / JWT / Origin / CSRF:** cookies: ninguna; JWT: no; Origin: no; CSRF: no
- **Códigos HTTP y envelope:** Java 200; OpenAPI 200 429 503; envelope: n/a
- **APIM (`infra/apim/operations.json`):** auth `public`, cookie `none`, CSRF `none`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** none
- **Divergencias:**
  - **M-22** · P2 · needs-authorization · decisión D-13: Java hard-codes max-age=30. JWKS freshness, rotation and propagation figures are B05 items that are not approved.
- **Decisión contractual necesaria:** D-13
- **Pruebas de aceptación:** AT-JWKS-1

#### `getIdentityMetadata` — GET `/.well-known/markettec-identity`

- **Flags (Java):** `users.internal-jwt.enabled`
- **Request Java:** none
- **Request OpenAPI:** none
- **Response Java:** 200 {issuer, jwks_uri, audiences[], access_token_algorithms:['RS256'], access_token_type:'at+jwt', contract_version:'0.3.0-draft'}
- **Response OpenAPI:** 200 IdentityMetadata
- **Cookies / JWT / Origin / CSRF:** cookies: ninguna; JWT: no; Origin: no; CSRF: no
- **Códigos HTTP y envelope:** Java 200; OpenAPI 200 429 503; envelope: n/a
- **APIM (`infra/apim/operations.json`):** auth `public`, cookie `none`, CSRF `none`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** none
- **Divergencias:**
  - **M-23** · P2 · needs-authorization · decisión D-13: Concrete issuer/audience values per environment are not approved.
- **Decisión contractual necesaria:** D-13
- **Pruebas de aceptación:** AT-JWKS-2

### Magic Link (B02, debe seguir en 503)

#### `requestInstitutionalEmailLink` — POST `/v1/auth/email/requests`

- **Flags (Java):** `users.google.http.enabled`, `users.email.enabled`
- **Request Java:** {email}; with users.email.enabled=false the service answers 503 AUTH_TEMPORARILY_UNAVAILABLE; with it true Java sends a link and answers 202 with csrfToken and sets the attempt cookie
- **Request OpenAPI:** EmailRequest; contract and DECISION_LOG state both email routes answer 503 for now
- **Response Java:** 202 {status:'accepted', csrfToken} when enabled; 503 otherwise
- **Response OpenAPI:** 503 only
- **Cookies / JWT / Origin / CSRF:** cookies: attempt (set when enabled); JWT: no; Origin: sí; CSRF: no
- **Códigos HTTP y envelope:** Java 202 400 403 503; OpenAPI 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `public`, cookie `none`, CSRF `none`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** login.service.ts is a password form restricted to institutional domains
- **Divergencias:**
  - **M-24** · P0 · needs-authorization · decisión D-02: Java implements Magic Link behind users.email.enabled while the approved decision says Magic Link is not implemented and must answer 503. The flag must stay off and no environment may enable it before B02 is approved.
  - **M-25** · P2 · doc-only · decisión D-02: Java returns 400 INSTITUTIONAL_EMAIL_REQUIRED for a non-institutional domain, which is not in the OpenAPI enum and reveals eligibility, contrary to the contract text.
- **Decisión contractual necesaria:** D-02
- **Pruebas de aceptación:** AT-EMAIL-OFF-1

#### `confirmInstitutionalEmailLink` — POST `/v1/auth/email/confirm`

- **Flags (Java):** `users.google.http.enabled`, `users.email.enabled`
- **Request Java:** {attemptId(32 hex), token(64 hex)}; attempt cookie + X-CSRF-Token
- **Request OpenAPI:** EmailConfirmationRequest; 503 only
- **Response Java:** 200 AuthResponse when enabled; 503 otherwise
- **Response OpenAPI:** 503 only
- **Cookies / JWT / Origin / CSRF:** cookies: attempt (read, cleared), refresh (set); JWT: no; Origin: sí; CSRF: sí
- **Códigos HTTP y envelope:** Java 200 400 401 403 503; OpenAPI 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `cookie`, cookie `required`, CSRF `required`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** none
- **Divergencias:**
  - **M-26** · P0 · needs-authorization · decisión D-02: Same as M-24: a session-issuing route exists in Java behind a flag the contract says must not be on.
- **Decisión contractual necesaria:** D-02
- **Pruebas de aceptación:** AT-EMAIL-OFF-1

### Bloqueadas (B03/B04): no documentar como operativas

#### `recordSessionActivity` — POST `/v1/auth/session/activity`

- **Flags (Java):** `users.api.http.enabled`
- **Request Java:** JWT + CSRF verified, body ignored
- **Request OpenAPI:** ActivityRequest {interactionId, kind}
- **Response Java:** 403 ACTIVITY_EVIDENCE_REQUIRED, always; deadlines never change
- **Response OpenAPI:** 200 snapshot; 409 ACTIVITY_NOT_ACCEPTED
- **Cookies / JWT / Origin / CSRF:** cookies: ninguna; JWT: sí; Origin: no; CSRF: sí
- **Códigos HTTP y envelope:** Java 403; OpenAPI 200 400 401 403 409 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `jwt_cookie`, cookie `required`, CSRF `required`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** none
- **Divergencias:**
  - **M-27** · P1 · doc-only · decisión D-03: B03 is unresolved. The endpoint refuses by design; document it as blocked, never as operational. ACTIVITY_EVIDENCE_REQUIRED is not in the OpenAPI enum.
- **Decisión contractual necesaria:** D-03
- **Pruebas de aceptación:** AT-BLOCKED-1

#### `createMethodProofAttempt` — POST `/v1/auth/proofs/attempts`

- **Flags (Java):** `users.api.http.enabled`
- **Request Java:** {method:'google'\|'institutional_email', operation, target}; JWT + CSRF
- **Request OpenAPI:** ProofAttemptRequest {method, purpose: reauthenticate\|link, authMethodId?}
- **Response Java:** 200 {attemptId, method, operation, target, nonce, expiresAt}
- **Response OpenAPI:** 200 AttemptResponse {attemptId, method, purpose, expiresAt, csrfToken, nonce?}
- **Cookies / JWT / Origin / CSRF:** cookies: ninguna; JWT: sí; Origin: no; CSRF: sí
- **Códigos HTTP y envelope:** Java 200 400 401 403 503; OpenAPI 200 400 401 403 409 410 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `jwt_cookie`, cookie `required`, CSRF `required`, estado local `pending_ms_users_pr23` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** none
- **Divergencias:**
  - **M-28** · P2 · needs-authorization · decisión D-14: Request and response shapes differ from OpenAPI (operation/target vs purpose/authMethodId; csrfToken missing). B04 defines recent proofs, so neither side is authoritative.
  - **M-34** · P3 · doc-only · decisión D-14: Java uses method value 'institutional_email' (underscore); OpenAPI AuthMethod uses 'institutional-email' (hyphen). Pick one spelling before any client is generated.
- **Decisión contractual necesaria:** D-14
- **Pruebas de aceptación:** AT-BLOCKED-2

#### `verifyGoogleMethodProof` — POST `/v1/auth/proofs/google`

- **Flags (Java):** `users.api.http.enabled`
- **Request Java:** {attemptId, credential}; JWT + CSRF
- **Request OpenAPI:** credential + attemptId
- **Response Java:** 200 {verified:true}
- **Response OpenAPI:** 200 ProofGrant {proofId, purpose, method, verifiedAt, expiresAt}
- **Cookies / JWT / Origin / CSRF:** cookies: ninguna; JWT: sí; Origin: no; CSRF: sí
- **Códigos HTTP y envelope:** Java 200 400 401 403 409 410 503; OpenAPI 200 400 401 403 409 410 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `jwt_cookie`, cookie `required`, CSRF `required`, estado local `pending_ms_users_pr23` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** none
- **Divergencias:**
  - **M-29** · P2 · needs-authorization · decisión D-14: Java returns {verified:true}; OpenAPI returns a consumable ProofGrant. B04 (recency, purpose, method, consumption) is not approved.
- **Decisión contractual necesaria:** D-14
- **Pruebas de aceptación:** AT-BLOCKED-2

#### `requestEmailMethodProof` — POST `/v1/auth/proofs/email/requests`

- **Flags (Java):** `users.api.http.enabled`, `users.email.enabled`
- **Request Java:** {attemptId}; JWT + CSRF; 503 when email proof unavailable
- **Request OpenAPI:** email proof request
- **Response Java:** 202 {status:'accepted'}
- **Response OpenAPI:** 202
- **Cookies / JWT / Origin / CSRF:** cookies: ninguna; JWT: sí; Origin: no; CSRF: sí
- **Códigos HTTP y envelope:** Java 202 400 401 403 503; OpenAPI 202 400 401 403 409 410 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `jwt_cookie`, cookie `required`, CSRF `required`, estado local `pending_ms_users_pr23` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** none
- **Divergencias:**
  - **M-30** · P2 · needs-authorization · decisión D-14: Depends on B04; keep email disabled.
- **Decisión contractual necesaria:** D-14
- **Pruebas de aceptación:** AT-BLOCKED-2

#### `verifyEmailMethodProof` — POST `/v1/auth/proofs/email/confirm`

- **Flags (Java):** `users.api.http.enabled`, `users.email.enabled`
- **Request Java:** {attemptId, secret(64 hex)}; JWT + CSRF
- **Request OpenAPI:** email proof confirmation
- **Response Java:** 200 {verified:true}
- **Response OpenAPI:** 200 ProofGrant
- **Cookies / JWT / Origin / CSRF:** cookies: ninguna; JWT: sí; Origin: no; CSRF: sí
- **Códigos HTTP y envelope:** Java 200 400 401 403 409 410 503; OpenAPI 200 400 401 403 409 410 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `jwt_cookie`, cookie `required`, CSRF `required`, estado local `pending_ms_users_pr23` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** none
- **Divergencias:**
  - **M-31** · P2 · needs-authorization · decisión D-14: Same as M-29 for the email method.
- **Decisión contractual necesaria:** D-14
- **Pruebas de aceptación:** AT-BLOCKED-2

#### `getOwnAuthMethods` — GET `/v1/me/auth-methods`

- **Flags (Java):** `users.api.http.enabled`
- **Request Java:** Bearer JWT
- **Request OpenAPI:** bearer
- **Response Java:** 200 {methods:[{provider, email, status}]}
- **Response OpenAPI:** 200 MethodsResponse {userId, methods:[{authMethodId, method}]}
- **Cookies / JWT / Origin / CSRF:** cookies: ninguna; JWT: sí; Origin: no; CSRF: no
- **Códigos HTTP y envelope:** Java 200 401 503; OpenAPI 200 401 403 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `jwt`, cookie `none`, CSRF `none`, estado local `reconciled` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** none
- **Divergencias:**
  - **M-32** · P2 · behavior · decisión D-14: Response shape differs (provider/email/status vs authMethodId/method; no userId). APIM marks it 'reconciled' even though the shapes differ; that label is a local manifest flag, not conformity.
- **Decisión contractual necesaria:** D-14
- **Pruebas de aceptación:** AT-BLOCKED-2

#### `linkOwnAuthMethod` — POST `/v1/me/auth-methods`

- **Flags (Java):** `users.api.http.enabled`, `users.auth-methods.linking.enabled (default false)`
- **Request Java:** {provider, currentAttemptId, newAttemptId, credential?}; answers 503 while linking is disabled
- **Request OpenAPI:** LinkMethodsRequest {reauthenticationProofId, newMethodProofId}
- **Response Java:** 201 method object when enabled; 503 AUTH_TEMPORARILY_UNAVAILABLE by default
- **Response OpenAPI:** 200
- **Cookies / JWT / Origin / CSRF:** cookies: ninguna; JWT: sí; Origin: no; CSRF: sí
- **Códigos HTTP y envelope:** Java 201 400 401 403 409 503; OpenAPI 200 400 401 403 409 410 429 503; envelope: ErrorEnvelope details=[]
- **APIM (`infra/apim/operations.json`):** auth `jwt_cookie`, cookie `required`, CSRF `required`, estado local `pending_ms_users_pr23` (etiqueta del manifiesto, no aprobación; `approvals.*` = null)
- **Consumidor Angular:** none
- **Divergencias:**
  - **M-33** · P2 · needs-authorization · decisión D-14: Request body, success status (201 vs 200) and semantics differ. The flag must stay off until B04 is approved.
- **Decisión contractual necesaria:** D-14
- **Pruebas de aceptación:** AT-BLOCKED-2

## 3. Divergencias del consumidor Angular

| Id | Prioridad | Tipo | Decisión | Resumen |
|---|---|---|---|---|
| A-01 | P0 | behavior | D-01 | Google ID Token stored as the session token and sent as bearer to every API call. |
| A-02 | P0 | behavior | D-08 | Google sub used as user id; 'USR-001' hard-coded in profile.ts:25 and my-publications.ts:29. |
| A-03 | P0 | needs-authorization | D-01 | sessionStorage key google_token (auth-token.service.ts) holds the credential; the approved profile forbids web storage for access/CSRF. |
| A-04 | P1 | behavior | D-04 | ApiClientService sets no withCredentials; refresh and attempt cookies are never sent. |
| A-05 | P1 | behavior | D-07 | No refresh, no 401 retry guard, no tab coordination, no logout call. |
| A-06 | P1 | behavior | D-06 | Single GIS callback; no separate login and register actions and no nonce. |
| A-07 | P1 | behavior | D-11 | Error handling reads error.message; the envelope is error.error.error.message with a code that is never mapped. |
| A-08 | P2 | behavior | D-09 | Request paths omit the /v1 prefix (/usuarios/{id}); APIM manifest also uses public paths without /v1. The mapping is not verified against a real APIM. |
| A-09 | P2 | doc-only | — | login.service.ts still models a password form for institutional email; unrelated to the Google core. |

## 4. Incompatibilidades priorizadas

### P0 — bloquea el incremento del núcleo

| Id | Dónde | Tipo | Decisión | Resumen |
|---|---|---|---|---|
| A-01 | Angular | behavior | D-01 | Google ID Token stored as the session token and sent as bearer to every API call. |
| A-02 | Angular | behavior | D-08 | Google sub used as user id; 'USR-001' hard-coded in profile.ts:25 and my-publications.ts:29. |
| A-03 | Angular | needs-authorization | D-01 | sessionStorage key google_token (auth-token.service.ts) holds the credential; the approved profile forbids web storage for access/CSRF. |
| M-03 | createAuthenticationAttempt | needs-authorization | D-04 | SameSite=Lax and Path=/ are hard-coded in Java but SameSite/hosts are still pending B06 and no real hosts are verified. Implemented, not approved. |
| M-06 | exchangeGoogleCredential | behavior | D-06 | A login with an unknown Google identity returns 401 AUTH_PROOF_INVALID. OpenAPI documents REGISTRATION_REQUIRED, which Java never emits, so Angular cannot tell 'not registered' from 'bad proof'. |
| M-07 | exchangeGoogleCredential | behavior | D-06 | The 2026-11-04 DECISION_LOG entry approves immediate Google registration with 200 AuthResponse. The older mandatory-link proposal is superseded. Java registers immediately only when users.google.registration.enabled=true and the attempt was created with purpose=register. |
| M-21 | getUserProfile | behavior | D-08 | Angular builds this path from the Google sub or the literal USR-001; with an owner-only route every call except the owner's own id is a 403. userId must come from AuthResponse.user.userId. |
| M-24 | requestInstitutionalEmailLink | needs-authorization | D-02 | Java implements Magic Link behind users.email.enabled while the approved decision says Magic Link is not implemented and must answer 503. The flag must stay off and no environment may enable it before B02 is approved. |
| M-26 | confirmInstitutionalEmailLink | needs-authorization | D-02 | Same as M-24: a session-issuing route exists in Java behind a flag the contract says must not be on. |

### P1 — necesario para que el núcleo funcione en el navegador

| Id | Dónde | Tipo | Decisión | Resumen |
|---|---|---|---|---|
| A-04 | Angular | behavior | D-04 | ApiClientService sets no withCredentials; refresh and attempt cookies are never sent. |
| A-05 | Angular | behavior | D-07 | No refresh, no 401 retry guard, no tab coordination, no logout call. |
| A-06 | Angular | behavior | D-06 | Single GIS callback; no separate login and register actions and no nonce. |
| A-07 | Angular | behavior | D-11 | Error handling reads error.message; the envelope is error.error.error.message with a code that is never mapped. |
| M-01 | createAuthenticationAttempt | behavior | D-09 | Java accepts a missing purpose (defaults to login); OpenAPI requires it. Angular must always send purpose; tightening Java is a behavior change. |
| M-04 | createAuthenticationAttempt | behavior | D-06 | purpose=register answers 503 AUTH_TEMPORARILY_UNAVAILABLE unless users.google.registration.enabled=true (default false). Angular must treat it as 'registration unavailable', not as a login failure. |
| M-11 | getSessionState | behavior | D-09 | Java requires Origin on this GET; OpenAPI says GET may omit it. A cross-origin fetch always sends Origin, so Angular is unaffected, but the contract text and Java disagree. |
| M-12 | getSessionState | doc-only | D-09 | APIM manifest marks the refresh cookie 'optional' for this route; Java rejects a missing cookie with 401 REFRESH_INVALID. APIM must treat the cookie as required. |
| M-13 | getSessionState | needs-authorization | D-07 | csrfToken returned here is the synchronizer for the current refresh generation. Another tab that rotated first invalidates a stale CSRF held by this tab. Tab protocol is not approved. |
| M-14 | refreshSession | doc-only | D-05 | Policy C is implemented: a consumed, invalid or mismatched proof yields 401 REFRESH_INVALID and a replay alone does not revoke the winner. Keep it. Missing or malformed CSRF also yields 401 REFRESH_INVALID, not 403 CSRF_INVALID. |
| M-16 | refreshSession | needs-authorization | D-07 | Two tabs and lost responses: a loser tab holding a stale CSRF gets REFRESH_INVALID, which must not close the winner's session. Protocol is a recommendation only. |
| M-17 | logoutSession | doc-only | D-12 | A 204 proves revocation in ms-users only. Already-issued access JWTs stay valid up to their exp (<=240 s nominal; residual <=300 s is documented, not demonstrated). Angular UI must not promise instant global logout. |
| M-19 | getOwnUserProfile | doc-only | D-11 | Missing, expired or malformed access token answers 401 AUTH_REQUIRED. AUTH_REQUIRED is not in the OpenAPI error-code enum, and ACCESS_TOKEN_EXPIRED is never emitted, so expiry cannot be distinguished server-side. |
| M-27 | recordSessionActivity | doc-only | D-03 | B03 is unresolved. The endpoint refuses by design; document it as blocked, never as operational. ACTIVITY_EVIDENCE_REQUIRED is not in the OpenAPI enum. |

### P2 — antes de una exposición general

| Id | Dónde | Tipo | Decisión | Resumen |
|---|---|---|---|---|
| A-08 | Angular | behavior | D-09 | Request paths omit the /v1 prefix (/usuarios/{id}); APIM manifest also uses public paths without /v1. The mapping is not verified against a real APIM. |
| A-09 | Angular | doc-only | — | login.service.ts still models a password form for institutional email; unrelated to the Google core. |
| M-05 | createAuthenticationAttempt | behavior | D-09 | Missing or wrong X-MTEC-Client gives 400 INVALID_REQUEST here but 403 FORBIDDEN on session/refresh/logout. Pick one mapping. |
| M-08 | exchangeGoogleCredential | doc-only | — | Java sets WWW-Authenticate: Bearer on every 401 of this route, including cookie/proof failures. Document it so Angular does not read it as 'send a bearer'. |
| M-10 | legacyGoogleRegistrationCompatibility | doc-only | D-06 | Alias kept for migration. Angular should call /v1/auth/google with a register attempt and not depend on the alias. |
| M-15 | refreshSession | behavior | D-10 | mode=continue is documented but not implemented (400). Angular must not call it. |
| M-18 | logoutSession | behavior | D-10 | scope=all is not implemented (400) and depends on B04. |
| M-20 | getOwnUserProfile | doc-only | D-11 | Java also emits USER_NOT_FOUND, USER_DEACTIVATED, CONCURRENT_MODIFICATION, INTERNAL_ERROR, ROUTE_NOT_FOUND and METHOD_NOT_ALLOWED; none is in the OpenAPI enum. |
| M-22 | getPublicSigningKeys | needs-authorization | D-13 | Java hard-codes max-age=30. JWKS freshness, rotation and propagation figures are B05 items that are not approved. |
| M-23 | getIdentityMetadata | needs-authorization | D-13 | Concrete issuer/audience values per environment are not approved. |
| M-25 | requestInstitutionalEmailLink | doc-only | D-02 | Java returns 400 INSTITUTIONAL_EMAIL_REQUIRED for a non-institutional domain, which is not in the OpenAPI enum and reveals eligibility, contrary to the contract text. |
| M-28 | createMethodProofAttempt | needs-authorization | D-14 | Request and response shapes differ from OpenAPI (operation/target vs purpose/authMethodId; csrfToken missing). B04 defines recent proofs, so neither side is authoritative. |
| M-29 | verifyGoogleMethodProof | needs-authorization | D-14 | Java returns {verified:true}; OpenAPI returns a consumable ProofGrant. B04 (recency, purpose, method, consumption) is not approved. |
| M-30 | requestEmailMethodProof | needs-authorization | D-14 | Depends on B04; keep email disabled. |
| M-31 | verifyEmailMethodProof | needs-authorization | D-14 | Same as M-29 for the email method. |
| M-32 | getOwnAuthMethods | behavior | D-14 | Response shape differs (provider/email/status vs authMethodId/method; no userId). APIM marks it 'reconciled' even though the shapes differ; that label is a local manifest flag, not conformity. |
| M-33 | linkOwnAuthMethod | needs-authorization | D-14 | Request body, success status (201 vs 200) and semantics differ. The flag must stay off until B04 is approved. |

### P3 — cosmético o diferible

| Id | Dónde | Tipo | Decisión | Resumen |
|---|---|---|---|---|
| M-02 | createAuthenticationAttempt | doc-only | — | attemptId is documented as opaque (max 128); Java emits and accepts only 32 lowercase hex. Narrower acceptance is compatible for clients that echo the issued value. |
| M-09 | exchangeGoogleCredential | doc-only | — | 429 RATE_LIMITED is documented but never emitted by Java. Rate limiting is expected at APIM (apim abuse_protection approval is null). |
| M-34 | createMethodProofAttempt | doc-only | D-14 | Java uses method value 'institutional_email' (underscore); OpenAPI AuthMethod uses 'institutional-email' (hyphen). Pick one spelling before any client is generated. |

### Separación por tipo de cambio

- **doc-only** (13): se pueden corregir en texto/fixtures sin tocar comportamiento. Este incremento aplica las correcciones de descripciones históricas; el resto se deja anotado.
- **behavior** (17): requieren cambiar Java o Angular; no se aplicaron.
- **needs-authorization** (13): tocan decisiones de seguridad o flags; solo el responsable puede aprobarlas.

## 5. Catálogo de pruebas de aceptación

`observed`: el comportamiento ya existe en Java y las pruebas Java citadas son un puntero de dónde comprobarlo, no una verificación de cada criterio. `proposed`: pendiente del incremento. Las filas con ambos estados describen hoy lo observado y lo que se propone cambiar tras la decisión.

| Id | Nivel | Estado | Descripción | Clase de prueba Java (puntero) |
|---|---|---|---|---|
| AT-HEALTH-1 | java+contract | observed | GET /health returns 200 HealthResponse. | HealthControllerTest |
| AT-ATTEMPT-1 | java+contract | observed | A login attempt returns 200 AttemptResponse and sets __Host-mtec-attempt HttpOnly Secure Path=/ without Domain. | GoogleAuthControllerTest |
| AT-ATTEMPT-2 | java | observed-and-proposed | Observed: omitted purpose is accepted as login. Proposed: purpose is required (D-09). | GoogleAuthControllerTest |
| AT-ATTEMPT-3 | java | observed | purpose=register with registration disabled returns 503 AUTH_TEMPORARILY_UNAVAILABLE. | GoogleAuthControllerTest |
| AT-GOOGLE-1 | contract | observed | A valid exchange returns AuthResponse with session.serverTime < expiresAt <= session.expiresAt and expiresAt - serverTime <= 240. | GoogleAuthControllerTest |
| AT-GOOGLE-2 | java | observed | Wrong CSRF gives 403 CSRF_INVALID; disallowed or missing Origin gives 403 ORIGIN_DENIED. | GoogleAuthControllerTest |
| AT-GOOGLE-3 | java | observed | Registration with the flag on returns the same AuthResponse; a consumed attempt gives 409 ATTEMPT_CONSUMED and an expired one 410 ATTEMPT_EXPIRED. | GoogleAuthControllerTest |
| AT-GOOGLE-4 | java | observed-and-proposed | Observed: unknown identity at login gives 401 AUTH_PROOF_INVALID. Proposed (D-06): REGISTRATION_REQUIRED after a valid proof. | GoogleLoginServiceTest |
| AT-SESSION-1 | java+contract | observed | GET /v1/auth/session returns SessionResponse with no token and no Set-Cookie rotation. | SessionBootstrapControllerTest |
| AT-SESSION-2 | java | observed | Missing or malformed refresh cookie gives 401 REFRESH_INVALID. | SessionBootstrapControllerTest |
| AT-REFRESH-1 | java+contract | observed | mode=rotate returns AuthResponse and a new refresh cookie. | SessionRefreshControllerTest |
| AT-REFRESH-2 | java | observed | A consumed, invalid or mismatched proof gives 401 REFRESH_INVALID with no JWT, no CSRF and no Set-Cookie (policy C). | SessionRefreshControllerTest |
| AT-REFRESH-3 | java | observed | mode=continue gives 400 INVALID_REQUEST until D-10. | SessionRefreshControllerTest |
| AT-REFRESH-4 | java | observed | A replay does not revoke the winning generation (policy C). | SessionRefreshControllerTest |
| AT-LOGOUT-1 | java | observed | scope=current gives 204 and clears the cookie, including with no cookie. | SessionLogoutControllerTest |
| AT-LOGOUT-2 | java | observed | scope=all gives 400 until D-14. | SessionLogoutControllerTest |
| AT-PROFILE-1 | java+contract | observed | GET /v1/me/profile returns UserProfileV1 for the token subject. | UserProfileControllerTest |
| AT-PROFILE-2 | java | observed | Missing, expired or malformed bearer gives 401 (code AUTH_REQUIRED today). | UserProfileControllerTest |
| AT-PROFILE-3 | java+contract | observed | PUT /v1/me/profile accepts exactly the three fields and returns UpdateUserResponseV1. | UserProfileControllerTest |
| AT-PROFILE-4 | java | observed | /v1/usuarios/{userId} with an id different from sub gives 403 FORBIDDEN. | UserProfileControllerTest |
| AT-JWKS-1 | java | observed | JWKS is public, carries only public RSA keys and unique kid. | IdentityMetadataControllerTest |
| AT-JWKS-2 | java+contract | observed | Metadata validates against IdentityMetadata. | IdentityMetadataControllerTest |
| AT-EMAIL-OFF-1 | java | observed | With users.email.enabled=false both email routes answer 503 AUTH_TEMPORARILY_UNAVAILABLE. | EmailAuthControllerTest |
| AT-BLOCKED-1 | java | observed | POST /v1/auth/session/activity answers 403 ACTIVITY_EVIDENCE_REQUIRED and changes no deadline. | AuthApiControllerTest |
| AT-BLOCKED-2 | java | observed | Proof and method-linking routes stay unavailable or unchanged while B04 is open. | AuthApiControllerTest |
| AT-ANGULAR-USERID-1 | angular | proposed | Angular never sends Google sub or USR-001 as a user id; the id comes from AuthResponse.user.userId. | — |

## 6. Lo que esta matriz no afirma

- No registra conformidad de ms-users, Angular, APIM, seguridad, ms-catalog ni ms-notifications, ni aprueba B07.
- No prueba comportamiento en ejecución: no se levantó ms-users, APIM ni un navegador.
- No cubre Catalog ni Notifications más allá de lo ya anotado en la [revisión B07 local](MTEC15_B07_LOCAL_INTEROPERABILITY_REVIEW.md).
