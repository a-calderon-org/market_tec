# Registro de decisiones

Revisado el 2026-10-13. Actualizado el 2026-10-18 con propuestas de Fase II (Etapa A), sincronizado el 2026-10-29 con la aprobación formal de ADR-001 y ampliado el 2026-10-31 con ADR-004. Revisión técnica de MTEC-40 del 2026-11-01: paquete pendiente de aprobación, matriz completa P01–P24 y contraste de repositorio/tickets, sin aceptación de decisiones de seguridad.

No se encontraron ADR históricos verificables previos a Fase II. Las decisiones inferidas del código (Angular standalone, APIM, Express) no se atribuyen como decisiones formales.

## ADRs de Fase II

| ADR | Fecha | Estado | Título | Sustituye |
|---|---|---|---|---|
| [ADR-001](ADR-001-distribucion-microservicios.md) | 2026-10-29 | **Accepted** | Distribución de responsabilidades entre tres microservicios | — |
| [ADR-002](ADR-002-rol-express-backend.md) | 2026-10-18 | **Proposed** | Rol del servidor Express existente (app/backend) | — |
| [ADR-003](ADR-003-convencion-timestamps.md) | 2026-10-18 | **Proposed** | Convención de timestamps en contratos inter-servicio (Epoch seconds) | — |
| [ADR-004](ADR-004-seguridad-autenticacion.md) | 2026-10-31 | **Proposed** | Seguridad de autenticación y fronteras de confianza | — |

> **ADR-001 fue aprobado formalmente por el responsable del proyecto el 2026-10-29.**
> ADR-002 y ADR-003 continúan en estado **Proposed** (pendientes de validación y aprobación). No deben darse por aprobados automáticamente aspectos sobre JWT interno, persistencia definitiva, SSE o políticas APIM.
> ADR-004 registra la dirección seleccionada por el responsable del proyecto: B ampliada con Google o correo institucional, identidad interna única, JWT común, sesiones renovables propias y autorización derivada del principal. La selección no equivale a aceptación formal: permanece **Proposed** y no autoriza implementación, cambios contractuales ni Azure.

La distribución de dominios de ADR-001 sigue **Accepted**, con exactamente tres servicios. **Verificado:** existe [a-calderon-org/ms-users-market-tec](https://github.com/a-calderon-org/ms-users-market-tec); se inspeccionaron dominio/persistencia locales en `650411b` y preparación MTEC-37 en `7f963a9`. El QA confirma por referencias Git y REST `main@19ce9f1`, merge de `650411b` y `7f963a9` con árbol idéntico al segundo; el CI del SHA figura success, sin verificación operativa Azure. `market_tec` conserva Angular, arquitectura, decisiones y contratos canónicos; `app/ms-users` se mantiene como scaffold, sin duplicar negocio. Evidencia y procedimiento propuesto de autoridad única/corte en [ADR-004, sección 7.1](ADR-004-seguridad-autenticacion.md#71-límites-físicos-de-repositorios-y-transición-del-scaffold). No se decide separar otros repositorios ni se modifican sus implementaciones o workflows.

**Verificado en Jira al 2026-11-01:** MTEC-34 y MTEC-35 Done; MTEC-37 In Progress, con preparación y cierre Azure/APIM pendiente; MTEC-36 To Do bloqueado por MTEC-40; MTEC-15 y MTEC-12 In Progress. Los resultados de pruebas/merge/CI reportados en tickets se distinguen de inspección local y verificación operativa en ADR-004; Done de dominio/persistencia no acredita seguridad desplegada. MTEC-17 conserva su antecedente Done.

Las **24 decisiones** y sus alternativas, recomendaciones, valores propuestos, riesgos, pruebas, responsables e hitos son canónicos en [ADR-004, sección 4](ADR-004-seguridad-autenticacion.md#4-parámetros-y-decisiones-pendientes). Se conservan 18 perfiles mínimos y se explicitan acuerdos conceptuales iniciales de P13/P17/P22: 21 decisiones tienen alguna parte necesaria antes de implementar MTEC-36, sin anticipar sus detalles Azure. Los detalles diferibles conservan roles/hitos propuestos, sin nombres, fechas ni aprobación inventados. La [matriz contractual de MTEC-15](ADR-004-seguridad-autenticacion.md#81-matriz-de-cambios-contractuales-requeridos--coordinación-mtec-15) identifica Google/desafío, correo/enlaces, refresh, logout, vinculación, JWKS/metadata, principal, errores y transporte; no modifica contratos.

Para aceptar ADR-004 y cerrar [MTEC-40](https://allanaron06122005.atlassian.net/browse/MTEC-40) faltan designación de seguridad, conformidades/desacuerdos de roles pertinentes, acuerdos mínimos exactos, aprobación explícita del RP y registro mediante PR revisado en fase posterior. El [acta pendiente de la sección 10](ADR-004-seguridad-autenticacion.md#10-revisión-humana-pendiente--paquete-de-decisión-sin-aprobar) no contiene firmas ni fechas de aprobación. **Aprobaciones acreditadas de ADR-004: ninguna**; la consulta de MTEC-40 del 2026-11-01 mantiene To Do, sin comentarios. El paquete prepara QA y revisión humana; MTEC-36 permanece bloqueado y las interfaces/controles propuestos requieren sus aprobaciones respectivas. ADR-004 continúa **Proposed**.

El [QA independiente de MTEC-40, subfase 2](../../docs/MTEC40_QA_REVIEW.md) registra evidencia, hallazgos, correcciones y validaciones. Su dictamen técnico-documental no constituye aprobación arquitectónica ni sustituye las conformidades de responsables y seguridad.
