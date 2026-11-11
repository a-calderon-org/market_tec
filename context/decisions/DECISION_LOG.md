# Registro de decisiones

Revisado el 2026-10-13. Actualizado el 2026-10-18 con propuestas de Fase II
(Etapa A), sincronizado el 2026-10-29 con la aprobación formal de ADR-001 y
ampliado el 2026-10-31 con ADR-004. Revisión técnica y aceptación delimitada del
2026-11-01: el responsable del proyecto aprueba la arquitectura base de ADR-004;
la conciliación posterior incorpora los límites de sesión 60 min/30 min/8 h
ratificados ese día. La consolidación del 2026-11-02 incorpora las aprobaciones delimitadas
B01–B06 de MTEC-40; la política C de replay se aprobó el 2026-11-04. Las decisiones
D-07 y D-11 de MTEC-40 se aprobaron en alcance de diseño el 2026-11-07.
La decisión posterior de registro Google inmediato con ID Token válido y correo
verificado sustituye la exigencia histórica de enlace en MTEC-15 el 2026-11-04.
Parámetros, demostraciones y conformidades siguen pendientes.

No se encontraron ADR históricos verificables previos a Fase II. Las decisiones inferidas del código (Angular standalone, APIM, Express) no se atribuyen como decisiones formales.

## Revisión de PR en `market_tec` sin aprobación independiente obligatoria — 2026-11-10

**Estado: aprobado por el responsable del proyecto.** `main` de `market_tec` deja de exigir una aprobación de otro
colaborador. Sigue exigiendo PR (sin push directo), el check `Validate Angular Build`, la regla también para
administradores, y prohíbe force-push y borrado de la rama. Las aprobaciones APIM (`approvals.*`) se registran con una
revisión GitHub real del responsable sobre el head que lleva el candidato; una revisión técnica independiente es
opcional. No es retroactivo: las evidencias de staging de `f56ba7e` (#53, #54, #55) conservan sus revisiones
independientes. No cambia otros repositorios.

## ms-catalog con JWT interno: audiencia de staging y delegación de perfil — 2026-11-10

**Estado: aprobado por el responsable del proyecto, limitado a staging.**
ms-catalog acepta `aud=markettec-api` (audiencia compartida del entorno) con
validación estricta del perfil interno, y puede reenviar el JWT del usuario ya
verificado solo a `GET /v1/me/profile` de ms-users por el gateway, validando
`id = sub`. Sin producción, sin audiencia nueva, sin cambios en ms-users y sin
extender la delegación a otras operaciones. Detalle en
[ADR-004 §10](ADR-004-seguridad-autenticacion.md#aprobaciones-delimitadas-ms-users--ms-catalog--2026-11-10).

## Registro Google institucional vigente — 2026-11-04

**Estado: aprobado formalmente por el responsable del proyecto.** Registro nuevo:
ID Token Google validado, `email_verified=true`, dominio institucional exacto y
vínculo por `(issuer, sub)`; crear cuenta y sesión y responder `200 AuthResponse`
sin Magic Link. Conservar login existente y alias
`/v1/auth/google/registrations`. No vincular por coincidencia de correo. Magic
Link corresponde solo a autenticación independiente por correo, todavía no
implementada; ambas rutas de email responden temporalmente
`503 AUTH_TEMPORARILY_UNAVAILABLE`. Implementación de referencia: `ms-users` PR
#21 @ `c690d438`.

## Registro Google nuevo — decisión histórica sustituida (2026-11-04)

**Estado: Approved como política de alta; interfaz MTEC-15/B07 Proposed.** El
responsable del proyecto exige que toda cuenta nueva confirme la posesión del
buzón institucional mediante enlace de un solo uso **antes** de crear usuario,
activar vínculo Google o emitir sesión. Se admiten exactamente
`estudiantec.cr`, `itcr.ac.cr` y `tec.ac.cr`. Firma/claims Google y
`email_verified=true` son necesarios según el flujo, pero no sustituyen el
enlace. La prueba se liga al intento y al mismo correo de la identidad Google
verificada; no se acepta un destinatario distinto elegido por el cliente.
La confirmación exige POST explícito, navegador autorizado, vencimiento y
consumo único. No se fusionan cuentas por correo ni se transfiere historial por
posesión de un buzón reasignado.

**Alcance y pendientes:** la política rige altas nuevas, no obliga a registrar
de nuevo a todos los usuarios existentes. La continuidad de cuentas históricas
sin evidencia del enlace, migración de `/v1/auth/google/registrations`,
parámetros de TTL/abuso, entrega y compatibilidad Angular/APIM requieren
protocolo, pruebas y conformidades B07. El contrato objetivo está en
[Users OpenAPI](../../contracts/openapi/users.json) y en el
[contrato de identidad](../../contracts/identity/IDENTITY_CONTRACT.md). El
backend `ms-users/main@3f776f6` todavía crea cuenta y sesión sin este enlace;
la decisión no acredita implementación ni autoriza despliegue.

## Decisión de refresh replay — 2026-11-04

**Estado: Approved. Responsable: responsable del proyecto. Alcance: MarketTec v1.** [MTEC-40](https://allanaron06122005.atlassian.net/browse/MTEC-40) aprueba expresamente la alternativa **C — detección y respuesta escalonada**, descrita en [ADR-004 §3.4](ADR-004-seguridad-autenticacion.md#34-expiración-renovación-revocación-y-replay) y en el [documento del PR #27](../../docs/MTEC40_REFRESH_REPLAY_DECISION_PROPOSAL.md). Cada refresh consumido se rechaza sin gracia ni reemisión; la pareja histórica refresh + CSRF coincidente se clasifica internamente y debe auditarse sin secretos. La respuesta pública es `401 REFRESH_INVALID`. Un replay aislado no revoca automáticamente la sesión ganadora; la revocación requiere logout autorizado, recuperación conforme a protocolo aprobado o compromiso confirmado con evidencia independiente y autorización registrada.

**Justificación y riesgos aceptados:** se evitan revocaciones incorrectas por carreras o respuestas perdidas, aceptando menor contención automática que B. Un atacante que gane la primera rotación con cookie robada puede conservar la nueva generación hasta expiración o revocación efectiva; el replay no identifica al actor legítimo. Una respuesta perdida después del commit puede exigir reautenticación. Revocar refresh no invalida JWT ya emitidos. El CSRF recuperable mediante `/v1/auth/session` con cookie válida y controles HTTP no es segunda prueba criptográfica independiente. La pauta de revocación por reuse de RFC 9700 para OAuth rotatorio es más estricta; C no acredita conformidad con ella.

**Dependencias:** auditoría estructurada y procedimiento de incidente/revocación en ms-users, pruebas de concurrencia entre instancias, serialización y recuperación segura en Angular, verificación de APIM/App Service y presupuesto real de exposición JWT ≤300 s. La candidata del [PR #25](https://github.com/a-calderon-org/market_tec/pull/25) alinea OpenAPI e identidad con esta política; su aprobación MTEC-15/B07 y las conformidades de consumidores siguen pendientes. **Esta aprobación no autoriza despliegue ni demuestra que todos los controles estén implementados.** MTEC-40 continúa In Progress; las demás decisiones pendientes de autenticación conservan su estado.

## Decisiones D-07 y D-11 — 2026-11-07

**Estado: Approved en alcance de diseño. Responsable: responsable del proyecto. Alcance: MarketTec v1.** [MTEC-40](https://allanaron06122005.atlassian.net/browse/MTEC-40) registra la decisión expresa del 2026-11-07. El texto canónico está en [ADR-004, decisiones D-07 y D-11](ADR-004-seguridad-autenticacion.md#decisiones-d-07-y-d-11-de-mtec-40--2026-11-07). La política C del 2026-11-04 permanece intacta.

**D-07 (refresh entre pestañas y respuesta perdida):** serialización entre pestañas con Web Locks; sección crítica con `GET /v1/auth/session`, un único `POST /v1/auth/refresh` por demanda y aplicación del resultado; CSRF obtenido dentro del lock; `BroadcastChannel` solo para señales, nunca como mutex ni transporte de credenciales; tras `401 REFRESH_INVALID`, timeout o respuesta perdida, `GET /v1/auth/session` solo reconcilia estado y no se encadena otro `POST`; un `200` de ese `GET` prueba la validez actual de la cookie, no una rotación ni un access JWT; el logout impide restauraciones tardías; sin exclusión mutua demostrada, degradación segura a reautenticación.

**D-11 (política inicial tras 401):** ninguna petición de negocio puede reintentarse automáticamente tras un `401` en MarketTec v1, incluidas las lecturas `GET` y todas las mutaciones. El cliente maneja el error y la recuperación de sesión sin repetir silenciosamente la solicitud fallida.

**Siguen pendientes, sin aprobación por implicación:** nuevos códigos de error Java, `ACCESS_TOKEN_EXPIRED`, nuevos DTO públicos, cambios de semántica OpenAPI y reintentos futuros por operación.

**Límites:** la aprobación fija política de diseño. No es conformidad técnica de Angular, ms-users ni seguridad; no prueba Web Locks en los navegadores soportados, concurrencia SQL, pérdida de respuesta ni cookies/CORS reales; no es aprobación contractual B07 ni autoriza despliegue. MTEC-40 y MTEC-15 continúan In Progress.

## ADRs de Fase II

| ADR | Fecha | Estado | Título | Sustituye |
|---|---|---|---|---|
| [ADR-001](ADR-001-distribucion-microservicios.md) | 2026-10-29 | **Accepted** | Distribución de responsabilidades entre tres microservicios | — |
| [ADR-002](ADR-002-rol-express-backend.md) | 2026-10-18 | **Proposed** | Rol del servidor Express existente (app/backend) | — |
| [ADR-003](ADR-003-convencion-timestamps.md) | 2026-10-18 | **Proposed** | Convención de timestamps en contratos inter-servicio (Epoch seconds) | — |
| [ADR-004](ADR-004-seguridad-autenticacion.md) | 2026-10-31; aceptación 2026-11-01 | **Accepted (base y alcance delimitado §3.4.1)** | Seguridad de autenticación y fronteras de confianza | — |
| [ADR-005](ADR-005-persistencia-cosmos-catalog.md) | 2026-11-09 | **Proposed** | Persistencia Cosmos de ms-catalog: incremento local, invariantes y límites de capacidad | — |

> **ADR-001 fue aprobado formalmente por el responsable del proyecto el 2026-10-29.**
> ADR-002 y ADR-003 continúan en estado **Proposed** (pendientes de validación y aprobación). No deben darse por aprobados automáticamente aspectos sobre JWT interno, persistencia definitiva, SSE o políticas APIM.
> **ADR-004: arquitectura base aceptada por el responsable del proyecto el
> 2026-11-01; ampliaciones delimitadas del 2026-11-02 en §3.4.1.** La aceptación comprende B
> ampliada, Google y correo institucional simultáneos en primera versión,
> identidad interna y sesiones comunes en ms-users, responsabilidades
> APIM/servicios, comunicación interna y política de sesión de ADR-004 §3.4. No
> acredita aprobación total de P01–P24, conformidades técnicas, certificación,
> contratos MTEC-15, configuración Azure/APIM, preparación completa de MTEC-36
> ni cierre de MTEC-40. Alcance canónico en [ADR-004
> §2.1](ADR-004-seguridad-autenticacion.md#21-arquitectura-base-aceptada-y-límites-de-aprobación).

La distribución de dominios de ADR-001 sigue **Accepted**, con exactamente tres servicios. **Verificado:** existe [a-calderon-org/ms-users-market-tec](https://github.com/a-calderon-org/ms-users-market-tec); se inspeccionaron dominio/persistencia locales en `650411b` y preparación MTEC-37 en `7f963a9`. El QA confirma por referencias Git y REST `main@19ce9f1`, merge de `650411b` y `7f963a9` con árbol idéntico al segundo; el CI del SHA figura success, sin verificación operativa Azure. `market_tec` conserva Angular, arquitectura, decisiones y contratos canónicos; `app/ms-users` se mantiene como scaffold, sin duplicar negocio. Evidencia y procedimiento propuesto de autoridad única/corte en [ADR-004, sección 7.1](ADR-004-seguridad-autenticacion.md#71-límites-físicos-de-repositorios-y-transición-del-scaffold). No se decide separar otros repositorios ni se modifican sus implementaciones o workflows.

**Verificado en Jira al 2026-11-01:** MTEC-34 y MTEC-35 Done; MTEC-37 In
Progress, con preparación y cierre Azure/APIM pendiente; MTEC-36 To Do bloqueado
por MTEC-40; MTEC-40 In Progress en la consulta posterior; MTEC-15 y MTEC-12 In
Progress. Los resultados de pruebas/merge/CI reportados en tickets se distinguen
de inspección local y verificación operativa en ADR-004; Done de
dominio/persistencia no acredita seguridad desplegada. MTEC-17 conserva su
antecedente Done.

La elegibilidad básica aceptada exige posesión verificada de correo de
**estudiantec.cr, itcr.ac.cr o tec.ac.cr**, con comparación exacta, sin
matrícula/empleo activo externos, privilegios ni clasificación visible por
dominio. Google exige validación criptográfica y prueba adicional institucional
cuando no sea autoritativo sobre el buzón; para registros Google nuevos, la
decisión posterior anterior exige el enlace en todos los casos. No se fusionan cuentas por correo;
vincular exige prueba reciente suficiente de ambos métodos. B02 aprueba passkeys ligadas al userId y códigos de recuperación de un uso para
continuidad, opcionales para básico; no aprueba sus protocolos ni recuperación
excepcional, fusión o transferencia de historial.

La política funcional de sesiones aprobada el **2026-11-01** comprende ventana
renovable de 60 minutos, 30 minutos de inactividad y máximo absoluto de ocho
horas desde el login inicial. Vence el primer límite aplicable; igualdad expira
y ninguna renovación reinicia el absoluto. El servidor solo renueva una sesión
vigente, avisa antes del vencimiento y exige reautenticación al vencer. Los
sondeos automáticos no cuentan como actividad elegible.

B01 D1–D3, aprobados el 2026-11-02, requieren residual ordinario máximo
verificable de 300 s, fail-closed condicionado a garantías y JWT nominal máximo
de 240 s; sustituyen el candidato histórico de 900 s y no prueban cumplimiento
operativo. B03 aprueba actividad elegible respaldada por servidor, instante real,
cómputo único y procesamiento tardío de hasta 60 s sin reactivar sesión; no
acredita humanidad. B05/B06 aprueban RS256/RSA-2048, kid en JOSE, JWKS público,
cero leeway positivo, access/CSRF en memoria, refresh en cookie segura host-only,
CSRF/CORS explícitos y serialización entre pestañas sin gracia general. La
política C posterior, aprobada el 2026-11-04, rige el replay como se registra
arriba. La política de diseño D-07 (refresh entre pestañas y respuesta perdida)
se aprobó el 2026-11-07; siguen pendientes su implementación, pruebas,
compatibilidad de navegadores y conformidades técnicas. Topología, auditoría
operativa, revocación por incidente y las pruebas y conformidades de los demás
controles siguen pendientes; aviso de 300 s antes del deadline de sesión es
candidato, no decisión cerrada. Fuente canónica:
[ADR-004 §3.4](ADR-004-seguridad-autenticacion.md#34-expiración-renovación-revocación-y-replay)
y P10/P15/P23.

La matriz canónica de aprobaciones/pendientes y su evidencia de Jira está en
[ADR-004 §3.4.1](ADR-004-seguridad-autenticacion.md#341-consolidación-de-aprobaciones-y-pendientes--2026-11-02).
D4/D5 de B01 siguen Proposed; B04 condicionado a evidencia de autenticación
reciente (<300 s aún condicionado); WebAuthn/recuperación, parámetros, pruebas y
B07 permanecen pendientes. Los informes locales previos con encabezado Proposed
no sustituyen las aprobaciones posteriores de MTEC-40. La candidata contractual
es 0.3.0-draft, **sin aprobación MTEC-15 ni conformidades implícitas**. Evidencia y
entrega en [release review](../../docs/MTEC15_AUTH_CONTRACT_RELEASE_REVIEW.md).

Dependencias: MTEC-40 requiere revisión de los tres servicios, frontend,
APIM/infraestructura y seguridad, designación nominal, acuerdos mínimos y
registro revisado; MTEC-15 debe aprobar las [interfaces
compartidas](ADR-004-seguridad-autenticacion.md#81-matriz-de-cambios-contractuales-requeridos--coordinación-mtec-15).
MTEC-36 ya registra ambos métodos y sesiones con los límites aprobados;
requiere acuerdos técnicos y contratos antes de implementarlos; MTEC-12 y
MTEC-37 conservan la
verificación futura Azure. MTEC-34/35 aportan dominio/persistencia, sin
acreditar autenticación. Esta consolidación actualiza solo los Draft contractuales autorizados y su QA; no altera tickets, código de aplicaciones ni recursos.

El [registro de aceptación y revisión
pendiente](ADR-004-seguridad-autenticacion.md#10-registro-de-aceptación-delimitada-y-revisión-humana-pendiente)
acredita únicamente la autoridad del responsable del proyecto del 2026-11-01
sobre el núcleo y límites de sesión; las ampliaciones posteriores tienen como fuente §3.4.1. Faltan
conformidades/desacuerdos de revisores técnicos y de
seguridad, valores exactos, demostración residual, responsables/plazos nominales y
el PR revisado exigido por MTEC-40. **MTEC-40 está In Progress**; su descripción
ya registra Accepted delimitado y los límites 60 min/30 min/8 h. La aceptación
base no
cierra el ticket ni inicia MTEC-36.

El [QA de
MTEC-40](../../docs/MTEC40_QA_REVIEW.md#h-revisión-posterior--aceptación-delimitada-2026-11-01)
conserva la revisión anterior como evidencia histórica. La [conciliación
posterior](../../docs/MTEC40_QA_REVIEW.md#i-conciliación-de-sesiones-y-bloqueo-de-main-2026-11-01)
registra la validación de sesiones, el estado vigente de Jira y el bloqueo de
main. Un dictamen técnico-documental no sustituye
aprobaciones humanas. ADR-001 sigue Accepted; ADR-002 y ADR-003 siguen Proposed.
