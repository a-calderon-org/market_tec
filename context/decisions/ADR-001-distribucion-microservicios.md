# ADR-001: Distribucion de responsabilidades entre tres microservicios

**Estado:** Proposed
**Fecha:** 2026-10-18
**Deciders:** Equipo MarketTec (3 integrantes)
**Contexto:** Fase II — Arquitectura distribuida

---

## Contexto

La Fase II requiere construir al menos tres microservicios independientes con tecnologias distintas. Es necesario decidir como distribuir las responsabilidades de dominio del marketplace: identidad, publicaciones, mensajeria y notificaciones.

## Decision

Se propone la distribucion de Alternativa A:

- **ms-users** (Spring Boot + Java): usuarios, autenticacion Google, perfil.
- **ms-catalog** (Node.js + Express + TypeScript): publicaciones, busqueda, mensajeria (chat).
- **ms-notifications** (Python + FastAPI): consumo de eventos, notificaciones en tiempo real y push.

La mensajeria (chat) se asigna a ms-catalog por cohesion de dominio: `Chat` tiene una referencia directa a `Publication` y los mismos usuarios que publican son quienes chatean en el contexto de esa publicacion.

## Alternativas consideradas

- **Alternativa B:** ms-core (usuarios+publicaciones) + ms-messaging + ms-notifications. Descartada por acoplamiento excesivo en ms-core.
- **Alternativa C:** 4 servicios (separar mensajeria de catalogo). Descartada por complejidad operativa desproporcionada para 3 personas.

## Consecuencias

Positivas:
- Cada integrante puede ser propietario de un microservicio completo.
- Las dependencias inter-servicio son minimas y bien definidas.
- Cumple con los 3 tipos de almacenamiento requeridos.

Negativas:
- ms-catalog agrupa publicaciones y mensajeria; si el volumen de mensajes crece, podria necesitar separarse en el futuro.
- Se requiere coordinacion para el flujo de autenticacion (ms-users -> ms-catalog para validar userId).

## Riesgos

- Si la mensajeria requiere mensajes en tiempo real con historial completo, ms-catalog puede necesitar refactorizacion.
- La decision sobre el stack de ms-users (Spring Boot) no puede cambiarse facilmente una vez iniciada la implementacion.

**Esta decision NO esta aprobada hasta recibir confirmacion del equipo.**
