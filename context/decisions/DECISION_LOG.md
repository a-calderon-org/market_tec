# Registro de decisiones

Revisado el 2026-10-13. Actualizado el 2026-10-18 con propuestas de Fase II (Etapa A), sincronizado el 2026-10-29 con la aprobación formal de ADR-001 y ampliado el 2026-10-31 con ADR-004 y su formalización documental de MTEC-40 (doble acceso y separación del repositorio de ms-users).

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

La distribución de dominios de ADR-001 sigue **Accepted** con tres servicios. La separación física prevista coloca el futuro desarrollo de `ms-users` en un repositorio independiente (nombre/URL pendientes), mientras `market_tec` conserva Angular, arquitectura, decisiones y contratos con sus validaciones y compatibilidad. No se decide separar repositorios de los otros servicios. `app/ms-users` se conserva sin migrar; la transición a una única implementación autoritativa se define en [ADR-004, sección 7.1](ADR-004-seguridad-autenticacion.md#71-límites-físicos-de-repositorios-y-transición-del-scaffold).

Quedan propuestos dominios candidatos sujetos a confirmación funcional, perfil criptográfico, tiempos de acceso/sesión, renovación/revocación, enlaces, vinculación y cookies/CSRF/CORS. Parámetros y responsables tienen como fuente canónica [ADR-004, sección 4](ADR-004-seguridad-autenticacion.md#4-parámetros-y-decisiones-pendientes).

Para aceptar ADR-004 y cerrar [MTEC-40](https://allanaron06122005.atlassian.net/browse/MTEC-40) faltan revisión documentada de servicios, frontend, APIM/infraestructura y seguridad designada, aprobación explícita del responsable del proyecto y registro formal mediante PR revisado de acuerdos mínimos y pendientes con responsable/plazo. **Verificado:** la consulta del ticket y comentarios del 2026-10-31 no aporta esa evidencia; no se infiere del merge previo. Las dependencias MTEC-15, MTEC-34, MTEC-36, MTEC-12 y MTEC-17 se delimitan en [ADR-004, sección 8](ADR-004-seguridad-autenticacion.md#8-implementación-por-etapas-y-criterios-de-salida); esta edición no ejecuta ni cierra esos trabajos.
