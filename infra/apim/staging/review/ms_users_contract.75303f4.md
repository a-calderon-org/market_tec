# Revisión `ms_users_contract` — ms-users `75303f4`, staging (candidato, no liberable)

**Estado: Proposed. Candidato de revisión. No es evidencia aprobada.** Este documento y
[`ms_users_contract.75303f4.candidate.json`](ms_users_contract.75303f4.candidate.json) existen para que una
persona autorizada apruebe (o rechace) en GitHub la reconciliación de las cinco operaciones de contraseña. El
candidato tiene `review_id: null` y campos adicionales (`status`, `release_profile`, `operations`,
`acceptance_scope`), por lo que `generate_policies.verify_approval` lo rechaza aunque se copie a `evidence/`
(prueba: [`test_review_candidate_ms_users_contract.py`](../../test_review_candidate_ms_users_contract.py)).
Este cambio **no** modifica `operations.staging.json`, `evidence/`, contratos, APIM desplegado, Azure SQL,
Container Apps, d04 ni flags.

## Vinculación

| Campo | Valor | Certeza |
|---|---|---|
| Backend ms-users | [`75303f4361eadd7167dc6b86fffbcabeb0728394`](https://github.com/a-calderon-org/ms-users-market-tec/commit/75303f4361eadd7167dc6b86fffbcabeb0728394) | Verificado: igual a `sha` de `backend-routes.staging.json` |
| Contrato combinado | `0.3.0-draft+users-password-0.1.0-draft`, SHA-256 `4b57f6460a42b6c47ecae725da83a79442e8b889c5078fdfa9db755420eb8950` | Verificado: `contract_binding` |
| Composición | `sha256("1d151691…fd7\n50f7e80e…5f09\n")`, donde `users.json` = `1d151691f7af0880c61e87bcf8eaf610c7abe6c14e17b01ea74fc005bc068fd7` y `users-password.json` = `50f7e80e8f0fe8f263bc6f540ff9fe829d32d293ad574978ca7ba6d89f715f09` | Verificado |
| Extensión | `x-extends: users.json 0.3.0-draft`; rutas disjuntas con la base; conjunto de operaciones igual a `PASSWORD_SECURITY_REFERENCE` | Verificado (`merge_extension` y prueba) |
| Entorno / revisión APIM | `staging` / `markettec-users-v1:1` | Verificado |
| Perfil de liberación | `ms-users-password-v1` (10 operaciones de `ms-users-google-v1` + 5 de contraseña) | Verificado |
| Base de este repositorio | `main` `07802c6` (merge del PR #52) | Verificado |

## Metodología

1. Comparación campo a campo de cinco fuentes por operación: manifiesto (`operations.staging.json`), referencia
   de seguridad revisada (`security_reference.PASSWORD_SECURITY_REFERENCE`), contrato
   (`contracts/openapi/users-password.json`), inventario de rutas del backend (`backend-routes.staging.json`) y
   llamadas del cliente esperadas (`route_check.PASSWORD_CALLS`).
2. Lectura de los controladores de ms-users en `75303f4` (`PasswordAuthController`, `PasswordApiController`).
3. Pruebas automáticas que fijan esta reconciliación (archivo de prueba citado arriba) y la suite APIM completa.
4. No se probó contra staging: `75303f4` no está desplegado.

## Reconciliación de las cinco operaciones (Verificado)

Método, ruta y operación:

| `operationId` | Pública (APIM) | Backend / contrato | Ruta en `75303f4` | Controlador | Éxito (contrato = código) |
|---|---|---|---|---|---|
| `loginWithPassword` | `POST /auth/password/login` | `POST /v1/auth/password/login` | sí | `PasswordAuthController.login` | `200` |
| `requestPasswordRecoveryLink` | `POST /auth/password/recovery/requests` | `POST /v1/auth/password/recovery/requests` | sí | `PasswordAuthController` (recovery) | `202` + `Set-Cookie` + `{status, csrfToken}` |
| `getOwnPasswordStatus` | `GET /me/password` | `GET /v1/me/password` | sí | `PasswordApiController.status` | `200` `{configured, setupAvailable}` |
| `setOwnInitialPassword` | `POST /me/password` | `POST /v1/me/password` | sí | `PasswordApiController.setInitial` | `201` `{configured}` |
| `changeOwnPassword` | `PUT /me/password` | `PUT /v1/me/password` | sí | `PasswordApiController.change` | `200` `{configured, otherSessionsRevoked}` |

Políticas (manifiesto = `PASSWORD_SECURITY_REFERENCE`; contrato coherente):

| `operationId` | `auth` | `origin` | `csrf` | `anonymous_admission` | Contrato: seguridad / parámetros | Puertas que generaría APIM con ambas aprobaciones |
|---|---|---|---|---|---|---|
| `loginWithPassword` | `public` | sí | `none` | sí | sin `bearerAuth`; `Origin` | `Origin` permitido → `rewrite-uri` → identidad gestionada; borra `X-MTEC-User-Authorization` |
| `requestPasswordRecoveryLink` | `public` | sí | `none` | sí | sin `bearerAuth`; `Origin` | igual que arriba |
| `getOwnPasswordStatus` | `jwt` | no | `none` | no | `bearerAuth` | `validate-jwt` (JWKS `stg-jwt-2026-11`) → copia el JWT a `X-MTEC-User-Authorization` → identidad gestionada |
| `setOwnInitialPassword` | `jwt` | sí | `session` | no | `bearerAuth`; `Origin`; `X-CSRF-Token` | `validate-jwt` + `Origin` + formato de `X-CSRF-Token` (la validez la comprueba ms-users contra la sesión del JWT) |
| `changeOwnPassword` | `jwt` | sí | `session` | no | `bearerAuth`; `Origin`; `X-CSRF-Token` | igual que arriba |

Ninguna de las cinco usa cookies en la petición (`cookies: []`, `cookie_mode: none`). Las cinco tienen
`contract_status: pending_password_contract`. Hasta que exista evidencia `ms_users_contract` válida, el generador
produce `503 BACKEND_CONTRACT_PENDING` para las cinco. Además, `loginWithPassword` y
`requestPasswordRecoveryLink` requieren `abuse_protection`, que se revisa en un PR separado.

## Hallazgos

| # | Hallazgo | Impacto | Certeza |
|---|---|---|---|
| H1 | **La aprobación no está acotada a las cinco operaciones.** `blocked_reason` libera cualquier operación con `contract_status != reconciled` cuando existe `ms_users_contract`. Eso incluye las cinco `pending_ms_users_pr23` (`createMethodProofAttempt`, `verifyGoogleMethodProof`, `requestEmailMethodProof`, `verifyEmailMethodProof`, `linkOwnAuthMethod`). Solo el perfil `ms-users-password-v1` las mantiene en `404 OPERATION_NOT_RELEASED`. | La aceptación solo es válida si se genera **con** `--release ms-users-password-v1`. Sin perfil, la misma evidencia liberaría operaciones no reconciliadas | Verificado (código y prueba) |
| H2 | Todas las operaciones del contrato declaran `apimSubscriptionKey`, pero el perfil define `subscriptionRequired: false` (MTEC-41). Pasa igual en `users.json`. | Desfase documental del contrato; no cambia las políticas generadas | Verificado |
| H3 | Los códigos de error del contrato (`400/401/403/409/422/429/503`) no se reconciliaron uno a uno contra `ApiErrors`/`ApiExceptionHandler`. Solo se verificaron los códigos de éxito y `CSRF_INVALID`, `ORIGIN_DENIED`, `INVALID_REQUEST`, `AUTH_TEMPORARILY_UNAVAILABLE` y `RATE_LIMITED`. | Respuestas de error podrían diferir del contrato | No determinado |
| H4 | El ms-users PR #35 (que produce `75303f4`) se fusionó sin revisiones GitHub registradas. | Esta revisión es la primera revisión independiente | Verificado (API GitHub) |

## Resultados de pruebas

| Fuente | Resultado | Certeza |
|---|---|---|
| ms-users CI `sql-qa`, [run 42778321600](https://github.com/a-calderon-org/ms-users-market-tec/actions/runs/42778321600) sobre `75303f4` | `success`: 507 unitarias + 76 integración SQL, 0 fallos. `PasswordAuthControllerTest` 9, `PasswordApiControllerTest` 7, `PasswordCredentialServiceTest` 14 | Verificado (log) |
| APIM local, `main` `07802c6` | 126 pruebas OK | Verificado |
| APIM local, esta rama (Python 3.15, macOS) | 135 pruebas OK (126 + 9 de `test_review_candidate_ms_users_contract.py`) | Verificado |

## Limitaciones

* No hay E2E en staging: el backend desplegado es `be4595c`.
* El generador no puede probar quién produjo una evidencia (`EXTERNAL_EVIDENCE`). `main` no tiene protección de
  rama ni rulesets (Verificado, 2026-11-10).

## Acciones pendientes

1. Revisión `APPROVED` real de una persona autorizada distinta del autor sobre el SHA head de este PR, aceptando
   la reconciliación y H1 (generación obligatoria con `--release ms-users-password-v1`).
2. En un PR posterior y revisado, registrar `evidence/ms_users_contract.75303f4.staging.json` (exactamente los 7
   campos de `EVIDENCE_FIELDS`, con el `review_id` real) y `approvals.ms_users_contract` en
   `operations.staging.json`.
3. Propuesta separada (sin cambio aquí): acotar `ms_users_contract` por `contract_status` en el generador para
   eliminar la dependencia de H1 respecto del perfil.
