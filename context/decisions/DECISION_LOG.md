# Registro de decisiones

Revisado el 2026-10-13. Actualizado el 2026-10-18 con propuestas de Fase II
(Etapa A), sincronizado el 2026-10-29 con la aprobación formal de ADR-001 y
ampliado el 2026-10-31 con ADR-004. Revisión técnica y aceptación delimitada del
2026-11-01: el responsable del proyecto aprueba la arquitectura base de ADR-004;
la conciliación posterior incorpora los límites de sesión 60 min/30 min/8 h
ratificados ese día. Los parámetros criptográficos, mecanismos operativos y
conformidades técnicas y de seguridad permanecen pendientes.

No se encontraron ADR históricos verificables previos a Fase II. Las decisiones inferidas del código (Angular standalone, APIM, Express) no se atribuyen como decisiones formales.

## ADRs de Fase II

| ADR | Fecha | Estado | Título | Sustituye |
|---|---|---|---|---|
| [ADR-001](ADR-001-distribucion-microservicios.md) | 2026-10-29 | **Accepted** | Distribución de responsabilidades entre tres microservicios | — |
| [ADR-002](ADR-002-rol-express-backend.md) | 2026-10-18 | **Proposed** | Rol del servidor Express existente (app/backend) | — |
| [ADR-003](ADR-003-convencion-timestamps.md) | 2026-10-18 | **Proposed** | Convención de timestamps en contratos inter-servicio (Epoch seconds) | — |
| [ADR-004](ADR-004-seguridad-autenticacion.md) | 2026-10-31; aceptación 2026-11-01 | **Accepted (arquitectura base)** | Seguridad de autenticación y fronteras de confianza | — |

> **ADR-001 fue aprobado formalmente por el responsable del proyecto el 2026-10-29.**
> ADR-002 y ADR-003 continúan en estado **Proposed** (pendientes de validación y aprobación). No deben darse por aprobados automáticamente aspectos sobre JWT interno, persistencia definitiva, SSE o políticas APIM.
> **ADR-004: arquitectura base aceptada por el responsable del proyecto el
> 2026-11-01; perfil de seguridad pendiente.** La aceptación comprende B
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
vincular exige prueba reciente suficiente de ambos métodos. Los protocolos,
continuidad del titular y recuperación siguen pendientes en ADR-004
§3.1/P16/P18/P21.

La política funcional de sesiones aprobada el **2026-11-01** comprende ventana
renovable de **60 minutos**, expiración por **30 minutos de inactividad** y
máximo absoluto de **ocho horas desde el login inicial**, que ninguna renovación
reinicia. Vence el primer límite aplicable; el servidor verifica el vencimiento
y solo renueva por solicitud válida mientras la sesión siga vigente. Debe haber
advertencia previa y reautenticación obligatoria al vencer; los sondeos
automáticos no cuentan como actividad humana. La renovación requiere mecanismos
seguros, cuyo protocolo está pendiente. Aviso cinco minutos antes y JWT de
15 minutos siguen propuestos. Medición de actividad, rotación/anti-replay,
revocación, cookies/CSRF/CORS, pestañas, carreras y reautenticación sensible
requieren revisión; no se aprueba acceso residual tras vencer la sesión.
Fuente canónica: [ADR-004
§3.4](ADR-004-seguridad-autenticacion.md#34-expiración-renovación-revocación-y-replay)
y P10/P15/P23.

Las **24 decisiones** son canónicas en [ADR-004, sección
4](ADR-004-seguridad-autenticacion.md#4-parámetros-y-decisiones-pendientes): P01
Accepted, siete con alcance Accepted parcial (P05/P10/P16/P17/P19/P20/P22) y 16
Proposed. De las 21 filas históricas con parte I, P01 queda resuelta; **20
conservan algún acuerdo técnico inicial pendiente**. Permanecen abiertos el
perfil criptográfico/claims, issuer/audience, custodia y rotación, enlaces,
renovación/revocación, cumplimiento de límites y reautenticación sensible,
acceso directo, excepciones exactas y contratos. Roles/hitos de cada fila no son
conformidades ni plazos
comprometidos.

Dependencias: MTEC-40 requiere revisión de los tres servicios, frontend,
APIM/infraestructura y seguridad, designación nominal, acuerdos mínimos y
registro revisado; MTEC-15 debe aprobar las [interfaces
compartidas](ADR-004-seguridad-autenticacion.md#81-matriz-de-cambios-contractuales-requeridos--coordinación-mtec-15).
MTEC-36 ya registra ambos métodos y sesiones con los límites aprobados;
requiere acuerdos técnicos y contratos antes de implementarlos; MTEC-12 y
MTEC-37 conservan la
verificación futura Azure. MTEC-34/35 aportan dominio/persistencia, sin
acreditar autenticación. No se alteran tickets, contratos, código ni recursos.

El [registro de aceptación y revisión
pendiente](ADR-004-seguridad-autenticacion.md#10-registro-de-aceptación-delimitada-y-revisión-humana-pendiente)
acredita únicamente la autoridad del responsable del proyecto del 2026-11-01
sobre el núcleo y los límites funcionales de sesión ratificados en Jira. Faltan
conformidades/desacuerdos de revisores técnicos y de
seguridad, valores exactos, aceptación residual, responsables/plazos nominales y
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
