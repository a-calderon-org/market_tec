# MTEC-40 — preparación de cierre de ADR-004

**Corte:** 2026-11-04. **Veredicto: BLOCKED.** Destinatario: responsable del proyecto y revisores de MTEC-40.

## Alcance y método

Revisión documental de los seis [criterios vigentes de MTEC-40](https://allanaron06122005.atlassian.net/browse/MTEC-40), secciones pertinentes de [ADR-004](../context/decisions/ADR-004-seguridad-autenticacion.md) y [DECISION_LOG](../context/decisions/DECISION_LOG.md) en `market_tec/main@88835a5`, [PR contractual #25](https://github.com/a-calderon-org/market_tec/pull/25) y [PR #16–20 de ms-users](https://github.com/a-calderon-org/ms-users-market-tec/pulls?q=is%3Apr+16+17+18+19+20). Se contrastaron estados, revisiones y CI por SHA; no se inspeccionó Azure ni se ejecutaron pruebas nuevas. Los documentos locales del checkout están atrasados frente a `main` remoto; prevalecen las referencias versionadas citadas.

## Matriz de aceptación

| Criterio original | Estado | Evidencia y decisión pendiente | Responsable |
|---|---|---|---|
| Revisiones y conformidades pertinentes | **BLOQUEADO** | [ADR-004 §10](../context/decisions/ADR-004-seguridad-autenticacion.md#10-registro-de-aceptación-delimitada-y-revisión-humana-pendiente) exige aprobaciones/desacuerdos; [PR #25](https://github.com/a-calderon-org/market_tec/pull/25) registra cero reviews. No consta acta nominal conjunta. | Tres servicios, frontend, APIM/infraestructura y seguridad designada; designación nominal pendiente del RP. |
| Decisión arquitectónica A/B explícita y aprobada | **CUMPLIDO** | [ADR-004 §2.1](../context/decisions/ADR-004-seguridad-autenticacion.md#21-arquitectura-base-aceptada-y-límites-de-aprobación): B ampliada y arquitectura base Accepted por el RP el 2026-11-01; A queda descartada para el diseño actual. Aprobación delimitada, sin conformidades técnicas inferidas. | RP. |
| Parámetros mínimos coherentes para MTEC-36; diferibles separados | **PARCIAL** | [MTEC-40](https://allanaron06122005.atlassian.net/browse/MTEC-40) aprueba 60/30/8, RS256/RSA-2048, access ≤240 s, expiración local sin leeway, perfil B05/B06 y política C. Siguen sin aprobación B01 D4/D5, protocolo B04 y controles operativos de compromiso; [ADR-004 §4](../context/decisions/ADR-004-seguridad-autenticacion.md#4-parámetros-y-decisiones-pendientes) y [DECISION_LOG](../context/decisions/DECISION_LOG.md) no reflejan íntegramente las aprobaciones posteriores. Valores exactos por entorno y pendientes diferibles requieren dueño/plazo. | RP con ms-users, APIM y seguridad; dueños nominales pendientes. |
| Plan de JWT, autorización de recursos, defensa backend y Azure | **PARCIAL** | [ADR-004 §8](../context/decisions/ADR-004-seguridad-autenticacion.md#8-implementación-por-etapas-y-criterios-de-salida) define validación local, ownership y pruebas APIM/Azure futuras. [ms-users PR #20](https://github.com/a-calderon-org/ms-users-market-tec/pull/20) solo verifica residual JWT local condicionado; validadores distribuidos, hosts y corte de operaciones en vuelo no verificados. Falta resolver D4/D5 y asignar ejecución a MTEC-12/37. | RP para decisión; servicios y APIM/infraestructura para plan y ejecución. |
| Resultado formal en ADR-004/DECISION_LOG mediante PR revisado | **PARCIAL** | [PR #23](https://github.com/a-calderon-org/market_tec/pull/23) publicó Accepted limitado y [DECISION_LOG](../context/decisions/DECISION_LOG.md) registra política C; el perfil B01/B05/B06 y acuerdos restantes no están formalizados íntegramente en ambos documentos ni consta PR de cierre revisado. | RP y revisores requeridos. |
| Coordinación MTEC-12/15/34/36 sin cambios prematuros | **PARCIAL** | [MTEC-34](https://allanaron06122005.atlassian.net/browse/MTEC-34) está Done; [MTEC-12](https://allanaron06122005.atlassian.net/browse/MTEC-12), [MTEC-15](https://allanaron06122005.atlassian.net/browse/MTEC-15) y [MTEC-36](https://allanaron06122005.atlassian.net/browse/MTEC-36) siguen In Progress. [PR #25](https://github.com/a-calderon-org/market_tec/pull/25) propone `0.3.0-draft`, pendiente B07 y compatibilidad; falta registrar aceptación o dependencia con propietario, sin declararla cumplida por CI. | RP, responsables MTEC-12/15/36 y consumidores. |

**Resultado:** 1 CUMPLIDO, 4 PARCIAL, 1 BLOQUEADO; 0 SIN EVIDENCIA como criterio completo. La falta de evidencia nominal se consigna en la fila bloqueada.

## Evidencia confirmada y límites

- **Verificado:** [ms-users PR #16](https://github.com/a-calderon-org/ms-users-market-tec/pull/16) cubrió SQL multi-JVM; [#19](https://github.com/a-calderon-org/ms-users-market-tec/pull/19) probó dos listeners HTTPS y SQL compartido (285 Java, 57 SQL en CI del HEAD). [#17](https://github.com/a-calderon-org/ms-users-market-tec/pull/17) delimitó la falta de frontera de autorización para revocación por compromiso y [#18](https://github.com/a-calderon-org/ms-users-market-tec/pull/18) propuso procedimiento operativo, sin aprobación. [#20](https://github.com/a-calderon-org/ms-users-market-tec/pull/20) verificó residual `<240 s` solo con reloj compartido y leeway 0; 61 s de atraso puede superar 300 s.
- **Verificado:** el [CI posterior al merge](https://github.com/a-calderon-org/ms-users-market-tec/actions/runs/41931137735) para `ms-users/main@b12d6d9e1284cd6eb71ff2d8956477f587e42386` concluyó `success` (`sql-qa`). El [HEAD `3e1250a` del PR #25](https://github.com/a-calderon-org/market_tec/pull/25) pasa contratos y compilación Angular; el despliegue fue omitido y no hay reviews registradas.
- **Documentado pero no verificado operativamente:** durabilidad de auditoría refresh, revocación por compromiso, cota JWT extremo a extremo, políticas APIM, validadores Java/Node/Python desplegados, hosts y aislamiento Azure. Un merge o CI no acredita aprobación humana ni protección productiva.

## Bloqueantes reales de MTEC-40

1. Acta de conformidades/desacuerdos de los responsables exigidos y seguridad designada, con riesgos residuales y responsables/plazos de diferibles.
2. Aprobación explícita de B01 D4 (corte de solicitudes en vuelo), B01 D5 (revocación e incidente crítico) y protocolo B04 para operaciones sensibles; ratificación del resto del perfil mínimo con alcance exacto. La propuesta de [ms-users #18](https://github.com/a-calderon-org/ms-users-market-tec/pull/18) no equivale a aprobación.
3. Coordinación verificable de B07/MTEC-15 y consumidores; después, registrar acuerdos aprobados y pendientes en ADR-004/DECISION_LOG mediante PR revisado. Si se desea cambiar estos criterios, el RP debe aprobar expresamente el cambio antes de evaluar cierre.

**Mínimo de decisiones aún necesarias:** tres decisiones sustantivas del RP (D4, D5, B04), más aprobación contractual B07 a cargo del RP y revisores de MTEC-15. Su orden: (1) designar revisores y registrar conformidades; (2) resolver D4/D5/B04 y riesgos; (3) cerrar B07 o dejar seguimiento expresamente aceptado según criterio vigente; (4) revisar PR de formalización y decidir cierre. La ratificación de otros parámetros aún propuestos puede ampliar ese mínimo.

## Trabajo que continúa fuera de MTEC-40

| Seguimiento | Alcance y límite |
|---|---|
| [MTEC-12](https://allanaron06122005.atlassian.net/browse/MTEC-12) | Políticas APIM, validadores distribuidos, rechazo de bypass y protección de backend; ejecución tras decisiones aplicables. |
| [MTEC-15](https://allanaron06122005.atlassian.net/browse/MTEC-15) | Aprobar B07 y compatibilidad de contratos del PR #25; CI contractual no sustituye conformidades. |
| [MTEC-34](https://allanaron06122005.atlassian.net/browse/MTEC-34) / [MTEC-36](https://allanaron06122005.atlassian.net/browse/MTEC-36) | Dominio ya Done; pueden avanzar pruebas aisladas y diseño. Registro Google con enlace institucional, sesiones e integración esperan contrato y perfil aprobados. |
| [MTEC-37](https://allanaron06122005.atlassian.net/browse/MTEC-37) / [MTEC-41](https://allanaron06122005.atlassian.net/browse/MTEC-41) | Despliegue y pruebas Azure; remediación de clave APIM expuesta asignada a `ydelso2006`, sin atribuirla a aceptación arquitectónica. |
| Ticket propio por asignar | Procedimiento de revocación por compromiso y registro de decisión transaccional: abrir solo al aprobar D5, si ningún ticket existente acepta dueño, criterios verificables y pruebas; no crear otra auditoría general. |

## Recomendación Jira

Mantener **MTEC-40 In Progress / BLOCKED para cierre**. Registrar decisiones y conformidades sin reescribir su descripción histórica; no mover a Done hasta cumplir los seis criterios o aprobar expresamente su modificación y seguimiento de dependencias. Esta revisión no cambia ADR, contratos, código ni infraestructura.
