# ADR-003: Convencion de timestamps en contratos inter-servicio

**Estado:** Proposed
**Fecha:** 2026-10-18
**Deciders:** Equipo MarketTec (3 integrantes)
**Contexto:** Uniformidad de fechas en APIs y eventos

---

## Contexto

Los modelos del frontend actualmente usan strings ISO 8601 para fechas (`fechaPublicacion: string`, `fecha: string`, `fechaRegistro: string`). Para Fase II, los tres microservicios necesitan una convencion uniforme que evite mezclar formatos y zonas horarias.

## Decision propuesta

Todos los timestamps en contratos HTTP y eventos asincrono usaran:

**Epoch UNIX en segundos, representado como entero de 64 bits (int64/long/integer).**

- Nombres de campo: `createdAt`, `updatedAt`, `occurredAt`, `expiresAt` (en ingles, snake_case para Python, camelCase para Java/TypeScript).
- Sin milisegundos: los timestamps se almacenan y transmiten en segundos.
- Sin strings ISO 8601 en contratos inter-servicio ni en contratos HTTP de Fase II.
- El frontend convierte al mostrar: `new Date(epoch * 1000)`.

## Conversiones por lenguaje

```java
// Java (Spring Boot)
Instant.ofEpochSecond(epoch);
long epoch = Instant.now().getEpochSecond();
```

```typescript
// TypeScript/Node.js
const epoch = Math.floor(Date.now() / 1000);
const date = new Date(epoch * 1000);
```

```python
# Python
import time
epoch = int(time.time())
from datetime import datetime, timezone
dt = datetime.fromtimestamp(epoch, tz=timezone.utc)
```

## Estrategia de migracion de Fase I a Fase II

Los modelos del frontend usan `string` para fechas. La migracion se realizara:
1. Los backends de Fase II retornan `integer` (epoch) en los campos de fecha.
2. Una politica APIM de transformacion puede convertir temporalmente epoch -> string para los clientes que no hayan migrado.
3. El frontend actualiza sus modelos TypeScript (`fechaPublicacion: number`, etc.) como parte de MTEC-10 y tickets de Fase II.

## Consecuencias

Positivas:
- Sin ambiguedad de zona horaria entre servicios.
- Comparacion numerica simple para ordenamiento.
- Formato universal compatible con todos los lenguajes.

Negativas:
- Los modelos del frontend requieren actualizacion (impacto en 5 interfaces TypeScript).
- Los mocks de pruebas del frontend requieren actualizar valores de fecha.
- Periodo de transicion donde APIM debe transformar el formato.

**Esta decision NO esta aprobada hasta recibir confirmacion del equipo.**
