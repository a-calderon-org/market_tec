# ADR-001: Distribucion de responsabilidades entre tres microservicios

**Estado:** Accepted
**Fecha:** 2026-10-18
**Fecha de aprobación:** 2026-10-29
**Deciders:** Responsable del proyecto
**Contexto:** Fase II — Arquitectura distribuida

---

## Contexto

La Fase II requiere construir al menos tres microservicios independientes con tecnologias distintas. Es necesario decidir como distribuir las responsabilidades de dominio del marketplace: identidad, publicaciones, mensajeria y notificaciones.

## Decision

Se aprueba la distribución de Alternativa A:

- **ms-users** (Java 21 / Spring Boot): identidad interna, usuarios, perfiles y vinculación con Google.
- **ms-catalog** (Node.js 24 / Express / TypeScript): publicaciones, catálogo, imágenes, chats y mensajes.
- **ms-notifications** (Python 3.12 / FastAPI): consumo de eventos, procesamiento de notificaciones, idempotencia, historial y entrega de notificaciones web.

La mensajería (chat) se asigna a `ms-catalog` por cohesión de dominio: `Chat` tiene una referencia directa a `Publication` y los mismos usuarios que publican son quienes chatean en el contexto de esa publicación.

## Responsabilidades y propiedad de datos aprobadas

| Servicio | Responsabilidades exclusivas | Datos propios |
|---|---|---|
| `ms-users` | Identidad interna, usuarios, perfiles y vinculación con Google | Usuarios, identidades externas y credenciales internas |
| `ms-catalog` | Publicaciones, catálogo, imágenes, chats y mensajes | Publicaciones, chats, participantes y mensajes |
| `ms-notifications` | Consumo de eventos, procesamiento de notificaciones, idempotencia, historial y entrega de notificaciones web | Notificaciones, eventos procesados (idempotencia) y estado de lectura |

Reglas de frontera aprobadas:

- Ningún servicio lee o escribe el almacenamiento de otro.
- `userId` es una referencia lógica opaca emitida por `ms-users`; no se deriva de Google `sub` fuera de ese servicio.
- `ms-catalog` autoriza acciones mediante un principal autenticado, sin consultar sincrónicamente a `ms-users` en cada solicitud.
- `ms-notifications` recibe el destinatario en un evento validado y no consulta bases de usuarios o catálogo.
- Datos de visualización replicados mediante eventos son snapshots y no transfieren ownership.
- Perfil, credenciales, reglas de catálogo e historial de notificaciones no se duplican como fuentes autoritativas.

El contrato conceptual de identidad, los OpenAPI y el primer evento versionado se
versionan por separado y continúan siendo borradores. Su publicación o revisión
no forma parte de la aceptación de este ADR.

## Limite interno de mensajeria

Mensajeria permanece como modulo interno de `ms-catalog` mientras el chat exista en el contexto de una publicacion y comparta su ciclo de autorización. Debe conservar entidades, puertos y repositorios propios para evitar mezclar reglas de mensajes con reglas de publicación.

Una extracción futura puede evaluarse solo si se cumplen señales observables, por ejemplo:

- escalado o disponibilidad de chat claramente distintos del catálogo;
- protocolos en tiempo real o retención que dominen la complejidad del servicio;
- equipo y capacidad operativa para un cuarto despliegue;
- frontera de datos estable que no obligue a consultas sincrónicas por cada mensaje.

La extracción requeriría un ADR nuevo, migración de ownership y compatibilidad de eventos. No forma parte de la Fase II actual.

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

## Aprobación — 2026-10-29

Esta decisión fue formal y expresamente **aprobada por el responsable del proyecto el 29 de octubre de 2026**.

Se ratifican los siguientes límites y restricciones:
- La distribución aprobada comprende exactamente tres microservicios: `ms-users`, `ms-catalog` y `ms-notifications`. No se introduce un cuarto microservicio.
- Mensajería permanece como módulo interno dentro de `ms-catalog`.
- La aprobación de ADR-001 **no** aprueba automáticamente las decisiones pendientes sobre persistencia definitiva (selección de Azure SQL vs Cosmos DB vs Table Storage), el rol del servidor Express existente (ADR-002), la convención general de timestamps (ADR-003), mecanismos de intercambio JWT, entrega en tiempo real SSE ni políticas de APIM. Dichas decisiones técnicas mantienen su estado respectivo hasta su validación y aprobación formal.
