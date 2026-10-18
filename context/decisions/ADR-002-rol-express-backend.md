# ADR-002: Rol del servidor Express existente (app/backend)

**Estado:** Proposed
**Fecha:** 2026-10-18
**Deciders:** Equipo MarketTec (3 integrantes)
**Contexto:** MTEC-18 — Decision arquitectonica sobre Express

---

## Contexto

El directorio `app/backend` contiene un servidor Express 5/TypeScript minimo con un unico endpoint `GET /api/health`. No implementa logica de negocio ni es consumido por la SPA. El ticket MTEC-18 requiere una decision formal sobre su rol en Fase II.

## Opciones evaluadas

### Opcion A: Retirar app/backend del repositorio (Recomendada)
- Eliminar el directorio `app/backend`.
- El nuevo microservicio `ms-catalog` se crea desde cero en `app/ms-catalog` con una estructura hexagonal apropiada.
- El package.json raiz se limpia de referencias al backend actual.

**Justificacion:** ms-catalog requiere una estructura hexagonal que es incompatible con el servidor Express actual. Extender el Express existente forzaria acoplar codigo legacy con la nueva arquitectura. Es mas limpio comenzar desde cero.

### Opcion B: Extender app/backend como base de ms-catalog
- Reutilizar el servidor Express existente como punto de partida para ms-catalog.
- Migrar la estructura flat actual a arquitectura hexagonal.

**Justificacion en contra:** El esfuerzo de refactorizar un proyecto sin tests ni estructura es similar al de crearlo desde cero, pero con el riesgo de conservar patrones incorrectos.

### Opcion C: Mantener app/backend como servicio auxiliar independiente
- Conservar el servidor Express como health-check auxiliar.
- Agregar ms-catalog, ms-users, ms-notifications como directorios independientes.

**Justificacion en contra:** Genera confusion al tener 4 proyectos backend cuando solo se requieren 3 microservicios. Express no tiene un rol academico en Fase II.

## Decision propuesta

**Opcion A:** Retirar `app/backend` durante la Etapa B (implementacion), tras aprobacion de la arquitectura.

El directorio de cada microservicio estara en:
- `app/ms-users/` — Spring Boot
- `app/ms-catalog/` — Node.js + Express + TypeScript (nueva estructura)
- `app/ms-notifications/` — Python + FastAPI

## Consecuencias

Positivas:
- Repositorio limpio sin ambiguedad sobre cual es el backend real.
- Cada microservicio tiene estructura hexagonal desde el inicio.

Negativas:
- Se pierde el trabajo existente en app/backend (minimo, ya que solo tiene health check).
- Requiere actualizar REPOSITORY_MAP.md y context/backend/OVERVIEW.md.

**Esta decision NO esta aprobada hasta recibir confirmacion del equipo. No se elimina app/backend durante la Etapa A.**
