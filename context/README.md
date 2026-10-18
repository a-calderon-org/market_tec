# Contexto técnico de MarketTec

Índice persistente para comprender el repositorio sin confundir documentación histórica con la implementación. Revisado el **2026-10-13** sobre `30ff761` (`refactor/pagination`). El código sigue siendo la fuente principal.

## Ruta de lectura

1. [Visión del proyecto](PROJECT_OVERVIEW.md)
2. [Arquitectura del sistema](SYSTEM_ARCHITECTURE.md)
3. [Mapa del repositorio](REPOSITORY_MAP.md)
4. [Flujo de desarrollo](DEVELOPMENT_WORKFLOW.md)
5. Área afectada: [backend](backend/OVERVIEW.md), [frontend](frontend/OVERVIEW.md) o [integración](integration/FRONTEND_BACKEND.md)
6. Antes de cambios: [reglas de contexto](maintenance/CONTEXT_RULES.md) y [protocolo de actualización](maintenance/UPDATE_PROTOCOL.md)

## Documentos

- `backend/`: estructura, contrato local, datos y dependencias del servidor Express mínimo.
- `frontend/`: arquitectura Angular, componentes, estado y dependencias.
- `integration/`: contratos consumidos y flujos entre navegador, Google Identity Services y Azure APIM.
- `audits/`: evaluación inicial fechada; no representa automáticamente el estado futuro.
- `decisions/`: mecanismo ADR y registro, sin atribuir decisiones inferidas.
- `maintenance/`: reglas, protocolo y lista de verificación.
- `phase2/`: propuestas de arquitectura distribuida y [fundacion tecnica realmente implementada](phase2/IMPLEMENTED_FOUNDATION.md).

## Convención de certeza

- **Verificado:** respaldado por código, configuración o una ejecución registrada.
- **Inferido:** conclusión razonable con evidencia parcial.
- **No determinado:** el repositorio no permite confirmarlo.
- **Documentado pero no verificado:** aparece en documentación, pero no está demostrado por código local o ejecución.

## Auditorías

- Auditorías iniciales: [backend](audits/INITIAL_BACKEND_AUDIT.md), [frontend](audits/INITIAL_FRONTEND_AUDIT.md) e [integración](audits/INTEGRATION_AUDIT.md); registros históricos del primer pase.
- [Segunda validación independiente](audits/SECOND_PASS_VALIDATION.md): revisión vigente de certeza y severidad; refuta y matiza hallazgos sin reescribir los informes iniciales.
- [Deuda técnica vigente](audits/TECHNICAL_DEBT.md): priorización consolidada tras la segunda pasada.
