# Registro de decisiones

Revisado el 2026-10-13. Actualizado el 2026-10-18 con propuestas de Fase II
(Etapa A), sincronizado el 2026-10-29 con la aprobación formal de ADR-001 y
ampliado el 2026-10-31 con ADR-004. Revisión técnica y aceptación delimitada del
2026-11-01: el responsable del proyecto aprueba la arquitectura base de ADR-004;
la conciliación posterior incorpora los límites de sesión 60 min/30 min/8 h
ratificados ese día. La consolidación del 2026-11-02 incorpora las aprobaciones delimitadas
B01–B06 de MTEC-40; parámetros, demostraciones y conformidades siguen pendientes.

No se encontraron ADR históricos verificables previos a Fase II. Las decisiones inferidas del código (Angular standalone, APIM, Express) no se atribuyen como decisiones formales.

## ADRs de Fase II

| ADR | Fecha | Estado | Título | Sustituye |
|---|---|---|---|---|
| [ADR-001](ADR-001-distribucion-microservicios.md) | 2026-10-29 | **Accepted** | Distribución de responsabilidades entre tres microservicios | — |
| [ADR-002](ADR-002-rol-express-backend.md) | 2026-10-18 | **Proposed** | Rol del servidor Express existente (app/backend) | — |
| [ADR-003](ADR-003-convencion-timestamps.md) | 2026-10-18 | **Proposed** | Convención de timestamps en contratos inter-servicio (Epoch seconds) | — |
| [ADR-004](ADR-004-seguridad-autenticacion.md) | 2026-10-31; aceptación 2026-11-01 | **Accepted (base y alcance delimitado §3.4.1)** | Seguridad de autenticación y fronteras de confianza | — |

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
cuando no sea autoritativo sobre el buzón. No se fusionan cuentas por correo;
vincular exige prueba reciente suficiente de ambos métodos. B02 aprueba passkeys ligadas al userId y códigos de recuperación de un uso para
continuidad, opcionales para básico; no aprueba sus protocolos ni recuperación
excepcional, fusión o transferencia de historial.

La política 60 minutos renovables / 30 minutos de inactividad / ocho horas desde
login inicial permanece estricta; igualdad expira y ninguna renovación reinicia
el absoluto. B01 D1–D3 aprueban residual ordinario máximo verificable de 300 s,
fail-closed condicionado a garantías y JWT nominal máximo de 240 s sujeto a
demostración. Sustituye el candidato 900 s. No hay garantía operativa demostrada.
B03 aprueba actividad elegible con respaldo servidor, instante real, cómputo único
y hasta 60 s de procesamiento tardío sin resucitar sesión; no acredita humanidad.
B05/B06 aprueban el perfil RS256/RSA-2048, kid en JOSE, claves públicas/JWKS,
expiración sin leeway positivo, transporte en memoria/cookie segura host-only,
sincronizador CSRF/CORS explícito y refresh serializado entre pestañas sin gracia
general, con cierre en servidor. No fijan topología, tiempos de caché ni protocolo
final; aviso candidato 300 s antes del deadline efectivo de sesión, no del JWT.

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
