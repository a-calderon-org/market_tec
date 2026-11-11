# Revisión de producción — ms-users `c0bac32`, perfil `ms-users-password-v1`

**Registrado:** decisión del responsable `a-calderon-org/market_tec#61/reviews/5854106910` (`COMMENTED`, head `8945b6b`, 2026-11-11); evidencias `../evidence/abuse_protection.c0bac32.production.json` y `../evidence/ms_users_contract.c0bac32.production.json`. El texto siguiente es el expediente revisado y no cambia.

**Estado: Proposed. Candidato de revisión. No es evidencia aprobada.** Los candidatos
[`abuse_protection.c0bac32.production.candidate.json`](abuse_protection.c0bac32.production.candidate.json) y
[`ms_users_contract.c0bac32.production.candidate.json`](ms_users_contract.c0bac32.production.candidate.json) tienen
`review_id: null` y campos adicionales, por lo que `generate_policies.verify_approval` los rechaza aunque se copien a
`evidence/`. Este cambio **no** modifica `operations.production.json`, `evidence/`, contratos ni APIM desplegado.

## Qué se pide aprobar

| Aprobación | Alcance | Riesgos aceptados |
|---|---|---|
| `abuse_protection` (producción) | Todas las operaciones anónimas del perfil `ms-users-password-v1`: Google, Magic Link, sesión, y además `loginWithPassword` y `requestPasswordRecoveryLink` | R1–R4 de [`../../staging/review/abuse_protection.f56ba7e.md`](../../staging/review/abuse_protection.f56ba7e.md), sin cambios: el backend no alteró ningún límite |
| `ms_users_contract` (producción) | Las cinco operaciones de contraseña | H1–H4 de [`../../staging/review/ms_users_contract.f56ba7e.md`](../../staging/review/ms_users_contract.f56ba7e.md); H1 obliga a generar **con** `--release ms-users-password-v1` |

`getOwnAuthMethods` (`GET /me/auth-methods`) entra en el perfil con `contract_status: reconciled`: no necesita
ninguna de las dos aprobaciones (PR #60).

## Vinculación (Verificado)

| Campo | Valor |
|---|---|
| Backend | [`c0bac32b9b48874dfb96d4efe2465a10caaa1591`](https://github.com/a-calderon-org/ms-users-market-tec/commit/c0bac32b9b48874dfb96d4efe2465a10caaa1591) (merge de ms-users PR #38) = `sha` de `backend-routes.production.json` |
| Árbol | `c4b26915…`, idéntico al del head del PR `a549864`, que es la imagen desplegada y probada en staging (`ca-ms-users-stg--ra549864`, digest `sha256:bfeec0c6d2fd3f640a1d42f0ddb938c4e606d4b922167d79086d2f5b151e60cc`) |
| Rutas | Sin cambios en `adapters/in/web` entre `f56ba7e` y `c0bac32` (`git diff --stat` vacío): las mismas 27 rutas |
| Contrato combinado | `0.3.0-draft+users-password-0.1.0-draft`, SHA-256 `4b57f6460a42b6c47ecae725da83a79442e8b889c5078fdfa9db755420eb8950` (sin cambios) |
| Entorno / revisión APIM | `production` / `markettec-users-prod-v1:1` |

## Cambios del backend respecto de `f56ba7e`

1. Correo por Azure Communication Services con la identidad administrada del contenedor (`USERS_EMAIL_PROVIDER=acs`), sin clave.
2. El registro Google precarga `given_name`/`family_name`.
3. `PUT /v1/me/profile` rechaza un `nombreUsuario` distinto del guardado (`400 INVALID_REQUEST`): el contrato no cambia de forma.

## Pruebas en staging (2026-11-11, navegador real del responsable; Verificado en registros de ms-users y SQL de solo lectura)

| Prueba | Resultado |
|---|---|
| Magic Link entregado por ACS | `email_delivery_audit` `accepted 202` (4 envíos); el correo llegó (en no deseados en pruebas previas) |
| Registro institucional nuevo | Enlace confirmado (`200`), nombres guardados, primera contraseña `201` (antes un `422 WEAK_PASSWORD` correcto); cuenta `usr_e07d…` con `nombre_usuario = user_id`, una identidad `INSTITUTIONAL_EMAIL:ACTIVE`, una fila de contraseña |
| Inicio de sesión con contraseña | `401` uniforme con contraseña errónea, `200` con la correcta; misma cuenta |
| Cambio de contraseña | `PUT /me/password` `200`; inicio de sesión posterior con la nueva `200` |
| B02 | Cuenta con contraseña previa: el Magic Link no ofreció establecer otra |
| Google | Inicio de sesión de cuenta existente `200`; sin fila de contraseña ni controles de contraseña |
| Duplicados | 0 identidades duplicadas por proveedor o dirección; 0 contraseñas sin identidad institucional |

**No probado en staging:** un registro Google de una cuenta nueva (`POST /auth/google/registrations`); cubierto
solo por pruebas unitarias.

## Acciones tras la revisión

1. Revisión real del responsable en GitHub sobre el head de este PR aceptando ambos alcances.
2. PR posterior: registrar `evidence/abuse_protection.c0bac32.production.json` y
   `evidence/ms_users_contract.c0bac32.production.json` (los 7 campos de `EVIDENCE_FIELDS` con el `review_id` real) y
   sus `approvals` en `operations.production.json`; generar el paquete con `--release ms-users-password-v1` y
   comparar con las exportaciones antes de aplicar.
