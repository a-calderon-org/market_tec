# Revisión `abuse_protection` — ms-users `f56ba7e`, staging (candidato, no liberable)

**Estado: Proposed. Candidato de revisión. No es evidencia aprobada.** Este documento y
[`abuse_protection.f56ba7e.candidate.json`](abuse_protection.f56ba7e.candidate.json) existen para que una
persona autorizada apruebe (o rechace) en GitHub el alcance descrito abajo. El candidato tiene
`review_id: null` y campos adicionales (`status`, `release_profile`, `acceptance_scope`), por lo que
`generate_policies.verify_approval` lo rechaza aunque se copie a `evidence/` y se referencie desde el
manifiesto (prueba: [`test_review_candidate_abuse_protection.py`](../../test_review_candidate_abuse_protection.py)).
Este cambio **no** modifica `operations.staging.json`, `evidence/`, APIM desplegado, Azure SQL, Container Apps,
d04 ni flags.

## Vinculación

| Campo | Valor | Certeza |
|---|---|---|
| Backend ms-users | [`f56ba7ec43d345cbd152705c53d2a7a8108a5add`](https://github.com/a-calderon-org/ms-users-market-tec/commit/f56ba7ec43d345cbd152705c53d2a7a8108a5add) (merge de ms-users PR #37; incluye #35 y #36) | Verificado: igual a `sha` de `backend-routes.staging.json` |
| Contrato combinado | `0.3.0-draft+users-password-0.1.0-draft`, SHA-256 `4b57f6460a42b6c47ecae725da83a79442e8b889c5078fdfa9db755420eb8950` | Verificado: `contract_binding(users.json, users-password.json)` |
| `users.json` | SHA-256 `1d151691f7af0880c61e87bcf8eaf610c7abe6c14e17b01ea74fc005bc068fd7` | Verificado |
| `users-password.json` | SHA-256 `50f7e80e8f0fe8f263bc6f540ff9fe829d32d293ad574978ca7ba6d89f715f09` | Verificado |
| Entorno / revisión APIM | `staging` / `markettec-users-v1:1` | Verificado: `target` del manifiesto |
| Perfil de liberación | `ms-users-password-v1` | Verificado: `release_profiles.py` |
| Base de este repositorio | `main` `07802c6` (merge del PR #52) | Verificado |

## Alcance de la aceptación solicitada

* **Solo staging** (`markettec-users-v1:1`). No autoriza producción ni otra revisión APIM. Una evidencia de
  producción requiere su propia revisión, con límite por IP o equivalente (riesgos R1–R2).
* **No es una aprobación solo de contraseña.** `abuse_protection` es una única puerta en
  `generate_policies.blocked_reason`: habilita a la vez las **siete** operaciones con
  `anonymous_admission: true` del manifiesto:

  | Operación | Ruta pública | Flujo |
  |---|---|---|
  | `createAuthenticationAttempt` | `POST /auth/attempts` | Google y Magic Link |
  | `exchangeGoogleCredential` | `POST /auth/google` | **Google** |
  | `legacyGoogleRegistrationCompatibility` | `POST /auth/google/registrations` | **Google** |
  | `requestInstitutionalEmailLink` | `POST /auth/email/requests` | **Magic Link** |
  | `confirmInstitutionalEmailLink` | `POST /auth/email/confirm` | **Magic Link** |
  | `loginWithPassword` | `POST /auth/password/login` | Contraseña |
  | `requestPasswordRecoveryLink` | `POST /auth/password/recovery/requests` | Contraseña |

  Sin esta evidencia, todas devuelven `503 ADMISSION_DISABLED`; los riesgos residuales de abajo aplican
  también a Google y Magic Link. Las dos operaciones de contraseña siguen bloqueadas mientras falte
  `ms_users_contract` (revisión separada).

## Metodología

1. Lectura del código de ms-users en `f56ba7e` (clon local, sin despliegue).
2. Lectura del run de CI de ms-users sobre ese SHA.
3. Ejecución local de las pruebas APIM de este repositorio (`python3 -m unittest discover -s infra/apim -p 'test_*.py'`).
4. No se hicieron pruebas contra staging, de carga ni de penetración.

## Controles comprobados (Verificado por lectura de código en `f56ba7e`)

| # | Control | Evidencia |
|---|---|---|
| C1 | Límite de tasa para POST anónimos: ventana fija de 60 s, **por ruta y por instancia**. Al agotarse responde `429 RATE_LIMITED` con `Retry-After` y `Cache-Control: no-store`, sin llegar al controlador, a la base de datos ni a Google. Límites/min: attempts 120, google 60, google/registrations 30, email/requests 30, email/confirm 60, password/login 60, password/recovery/requests 30. | `adapters/in/web/PublicAuthRateLimitFilter.java` |
| C2 | Bloqueo por intentos fallidos de contraseña: 5 fallos en 15 min bloquean 15 min (`THROTTLED`, que `ApiErrors` traduce a `429 RATE_LIMITED`, el mismo código que C1). La clave es un digest del correo normalizado (`login`) o del usuario (`change`), así que se comporta igual para cuentas inexistentes. Estado en Azure SQL con `UPDLOCK, HOLDLOCK`, compartido entre instancias. | `application/session/PasswordCredentialService.java` (`MAX_FAILURES`, `WINDOW`, `LOCK`), `adapters/out/sql/SqlPasswordAttemptThrottle.java`. Un acierto restablece la fila con `UPDATE` (sin `DELETE`, que la identidad de ejecución no tiene; ms-users #36) |
| C3 | Fallos uniformes en el inicio de sesión: cuentas desconocidas, no elegibles, desactivadas, solo Google o contraseña errónea dan la misma respuesta. | Javadoc y lógica de `PasswordCredentialService.java` |
| C4 | Recuperación con acuse uniforme: siempre `202`. Solo se envía enlace a identidades institucionales activas existentes. El envío se desacopla del hilo de la petición, así que el tiempo y el estado no dependen del proveedor de correo (corrección de ms-users PR #35 sobre `8707f03`). Límite por dirección: como máximo 3 enlaces cada 15 min por correo normalizado (`MAX_REQUESTS_PER_WINDOW`, `THROTTLE_WINDOW`), contando juntos Magic Link y recuperación; el exceso recibe el mismo `202`. | `EmailLoginService.request`/`requestRecovery`, `PasswordAuthController.java`, `adapters/out/mail/DetachedLinkSender.java` |
| C5 | Puertas de APIM (código revisado de este repositorio): verificación de `Origin` contra la lista permitida, eliminación de cabeceras de identidad suplantables, denegación terminal si falta la aprobación. El perfil limita la superficie a 15 operaciones. | `generate_policies.py` (`checks_for`, `blocked_reason`, `policy_for`), `release_profiles.py` |

## Resultados de pruebas

| Fuente | Resultado | Certeza |
|---|---|---|
| ms-users CI `sql-qa`, [run 42860044987](https://github.com/a-calderon-org/ms-users-market-tec/actions/runs/42860044987), `headSha` `f56ba7e`, `push`, 2026-11-10 | `success`. 508 pruebas unitarias, 77 de integración SQL (`SqlUserStoreIT`, incluida `restrictedRuntimePasswordFlowNeedsNoDeleteOrDdlPermission` con los privilegios reales de ejecución) y 35 de scripts; 0 fallos, 0 errores, 0 omitidas | Verificado (log del run) |
| Clases relevantes del mismo run | `PublicAuthRateLimitFilterTest` 4, `PasswordCredentialServiceTest` 14, `DetachedLinkSenderTest` 8, `EmailLoginServiceTest` 16, `PasswordAuthControllerTest` 9, `PasswordApiControllerTest` 7, `PasswordAuthConfigTest` 5, `RuntimeSqlPrivilegeTest` 1; todas en verde | Verificado (log del run) |
| APIM local, `main` `07802c6` | 126 pruebas OK (Python 3) | Verificado |
| APIM local, esta rama (Python 3.15, macOS) | 134 pruebas OK (revinculación a `f56ba7e`) (126 + 8 de `test_review_candidate_abuse_protection.py`) | Verificado |
| Generación con los insumos actuales | Rechazada: `abuse_protection: evidence is for another ms-users backend`, porque la evidencia vigente está ligada a `be4595c` | Verificado |

## Riesgos residuales (aceptación, si se da, limitada a staging)

| # | Riesgo | Detalle | Afecta | Certeza |
|---|---|---|---|---|
| R1 | **Sin límite por IP ni por cliente** | APIM Consumption no ofrece `rate-limit-by-key` y ms-users no limita por IP. Un solo cliente puede consumir todo el presupuesto de una ruta. | Las 7 operaciones | Verificado (código) |
| R2 | **Límite global por ruta (y por instancia)** | El presupuesto se comparte entre todos los usuarios: 60 peticiones/min a `/v1/auth/google` desde un atacante dejan a todos sin login de Google durante el resto de la ventana. Lo mismo ocurre con Magic Link (30/min en requests) y contraseña. Con N réplicas el límite efectivo es N veces mayor. El script de despliegue fija `--max-replicas 1`. | Google, Magic Link, contraseña | Verificado (código). La réplica única está documentada en `scripts/azure/aca/ms-users-aca.sh`, pero no se verificó en Azure |
| R3 | **Bloqueo por intentos fallidos usable para denegación dirigida** | Basta conocer un correo para bloquear su login con contraseña 15 min con 5 intentos, y repetirlo. Con el límite de 60/min un atacante puede bloquear unas 12 cuentas/min, consumiendo a la vez el presupuesto global (R2). Google y Magic Link siguen disponibles como alternativa para la víctima, salvo que también estén agotados por R2. De forma análoga, 3 solicitudes de enlace en 15 min a nombre de la víctima agotan su cupo de Magic Link y recuperación (C4) sin señal visible, porque el exceso también recibe `202`. | Contraseña, Magic Link y recuperación (y Google vía R2) | Verificado (código). Impacto inferido |
| R4 | **Entrega best effort del enlace de recuperación** | Cola en memoria de 64 elementos, 1 worker, antigüedad máxima 2 min. Los enlaces descartados (`dropped_queue_full`, `dropped_stale`, `dropped_shutdown`) no se reintentan y se pierden al reiniciar. El `202` no garantiza la entrega. Cada descarte se audita sin datos personales. | Recuperación de contraseña | Verificado (código) |
| R5 | Los ms-users PR #35, #36 y #37 se fusionaron sin revisiones GitHub (ms-users no tiene protección de rama) | No afecta al código; la revisión de este PR es la primera revisión independiente del cambio | Proceso | Verificado (API GitHub) |

## Limitaciones

* No se verificó el estado desplegado de ms-users ni de APIM. Según `staging/README.md`, Azure ejecuta `be4595c`
  (`ms-users-google-v1`); `f56ba7e` no está desplegado.
* No hubo pruebas de carga ni de abuso real, y no se midieron los tiempos de recuperación.
* El generador no puede probar quién produjo una evidencia. Eso depende de la revisión GitHub y del operador
  (`EXTERNAL_EVIDENCE`).
* `main` no tiene protección de rama ni rulesets (Verificado, API GitHub, 2026-11-10): una revisión `APPROVED`
  documenta la aceptación, pero GitHub no la exige técnicamente.

## Acciones pendientes

1. Revisión `APPROVED` real de una persona autorizada distinta del autor sobre el SHA head de este PR, aceptando
   R1–R4 **solo para staging**.
2. En un PR posterior y revisado, registrar la evidencia real: `evidence/abuse_protection.f56ba7e.staging.json`
   con exactamente los 7 campos de `EVIDENCE_FIELDS` y el `review_id` real, y actualizar
   `approvals.abuse_protection` (archivo + SHA-256) en `operations.staging.json`.
3. Antes de producción: límite por IP o cliente (p. ej. APIM con un tier que soporte `rate-limit-by-key`, o
   mitigación en ms-users), mitigar el bloqueo dirigido (R3) y definir una entrega duradera (R4).
