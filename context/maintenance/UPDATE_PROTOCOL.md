# Protocolo de actualización

## Matriz de impacto

| Cambio | Documentos mínimos a revisar |
|---|---|
| Endpoint nuevo/modificado | `backend/API_CONTRACTS.md`, `integration/FRONTEND_BACKEND.md`, `integration/DATA_FLOW.md` |
| Modelo/campo/paginación | `backend/DATA_MODELS.md`, modelos frontend, ambos documentos de integración |
| Ruta, página o componente | `frontend/COMPONENTS.md`, `frontend/ARCHITECTURE.md`, `REPOSITORY_MAP.md` |
| Estado/store/sesión | `frontend/STATE_MANAGEMENT.md`, integración si cruza límites |
| Autenticación/autorización | arquitectura de ambas áreas, integración y auditorías/deuda activas |
| Dependencia/configuración | `*/DEPENDENCIES.md`, `DEVELOPMENT_WORKFLOW.md`, despliegue si aplica |
| Servicio externo | `SYSTEM_ARCHITECTURE.md`, integración y dependencias |
| Refactor arquitectónico | documentos de arquitectura/mapa y un ADR si existe decisión deliberada |
| Hallazgo nuevo/resuelto | auditoría fechada o addendum y `audits/TECHNICAL_DEBT.md` |

## Procedimiento

1. Identificar área, contratos y consumidores antes del cambio.
2. Implementar y verificar sin asumir que los documentos siguen vigentes.
3. Actualizar documentos descriptivos para reflejar el nuevo estado.
4. Registrar decisiones deliberadas en un ADR; no reescribir decisiones anteriores.
5. En auditorías iniciales, conservar el texto y actualizar el estado mediante una nota fechada. Mantener deuda consolidada como lista viva.
6. Validar enlaces, evidencia y ausencia de secretos.

