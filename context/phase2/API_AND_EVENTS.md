# Contratos de API y Eventos — Fase II

**Estado:** Propuesta — Pendiente de aprobacion
**Fecha:** 2026-10-18
**Convencion de timestamps:** Epoch UNIX en segundos (entero de 64 bits). Sin milisegundos. Sin cadenas ISO 8601 en contratos inter-servicio. El frontend convierte a zona horaria del dispositivo.

> **Actualizacion Etapa B (2026-10-18):** **Verificado:** los tres servicios implementan unicamente `GET /health`, `X-Correlation-ID`, timestamps tecnicos Epoch seconds y el envelope basico de errores descritos en [IMPLEMENTED_FOUNDATION.md](IMPLEMENTED_FOUNDATION.md). Todos los endpoints de negocio y eventos de este documento continuan propuestos, no implementados. Para la aplicacion exclusivamente web, SSE es la opcion preferida pero su autenticacion con `EventSource` y APIM sigue pendiente; no se usaran tokens permanentes en URL.

---

## 1. Convencion global de timestamps

| Campo | Tipo | Ejemplo | Regla |
|---|---|---|---|
| `occurredAt` | `integer` (int64) | `1790000000` | Epoch segundos UTC |
| `createdAt` | `integer` (int64) | `1789900000` | Epoch segundos UTC |
| `updatedAt` | `integer` (int64) | `1789901000` | Epoch segundos UTC |
| `expiresAt` | `integer` (int64) | `1790003600` | Epoch segundos UTC |

**Prohibition:** NO usar milisegundos en los contratos publicos ni inter-servicio.
**Conversion:** `new Date(epoch * 1000)` en JavaScript; `Instant.ofEpochSecond(epoch)` en Java; `datetime.fromtimestamp(epoch)` en Python.

Los modelos del frontend actualmente usan `fechaPublicacion: string` (formato ISO string). Este campo debera migrarse a `integer` epoch en Fase II. Esto requiere actualizar los modelos TypeScript del frontend.

---

## 2. Envelope de respuesta HTTP estandar

### Respuesta exitosa

```json
{
  "data": { },
  "meta": {
    "correlationId": "uuid-v4",
    "timestamp": 1790000000,
    "version": "1"
  }
}
```

### Respuesta paginada

```json
{
  "data": {
    "items": [],
    "totalRecords": 150,
    "page": 1,
    "pageSize": 12
  },
  "meta": {
    "correlationId": "uuid-v4",
    "timestamp": 1790000000,
    "version": "1"
  }
}
```

### Respuesta de error

```json
{
  "error": {
    "code": "PUBLICATION_NOT_FOUND",
    "message": "La publicacion solicitada no existe.",
    "details": [],
    "correlationId": "uuid-v4",
    "timestamp": 1790000000
  }
}
```

**Nota de compatibilidad con Fase I:** El frontend actual espera `{ totalRecords, page, pageSize, items }` directamente sin envelope `data`. Se propone una politica APIM de transformacion que aplane el envelope para mantener compatibilidad mientras el frontend migra al nuevo contrato. Ver seccion de migracion.

---

## 3. Contratos HTTP preliminares — ms-users

### POST /auth/google
**Nuevo endpoint — no existe en Fase I**

Request:
```json
{
  "credential": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Response (200):
```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresAt": 1790003600,
    "user": {
      "id": "usr_abc123",
      "email": "usuario@estudiantec.cr",
      "nombre": "Ana Lopez",
      "fotoPerfil": "https://..."
    }
  }
}
```

Error (401):
```json
{
  "error": {
    "code": "GOOGLE_TOKEN_INVALID",
    "message": "El token de Google no pudo ser verificado.",
    "correlationId": "uuid"
  }
}
```

---

### GET /usuarios/{id}
**Compatible con Fase I — `GET /usuarios/{id}`**

Response (200):
```json
{
  "data": {
    "id": "usr_abc123",
    "nombreUsuario": "ana.lopez",
    "nombre": "Ana",
    "apellidos": "Lopez Mora",
    "correo": "usuario@estudiantec.cr",
    "fotoPerfil": "https://...",
    "createdAt": 1789900000,
    "verificado": true,
    "estado": "activo"
  }
}
```

**Cambio de campo:** `fechaRegistro` (string ISO) -> `createdAt` (integer epoch). Requiere actualizacion del modelo `User` en frontend.

---

### PUT /usuarios/{id}
**Compatible con Fase I — `PUT /usuarios/{id}`**

Request:
```json
{
  "nombreUsuario": "ana.lopez",
  "nombre": "Ana",
  "apellidos": "Lopez Mora"
}
```

Response (200): mismo esquema que GET /usuarios/{id} con campo adicional `updatedAt`.

---

## 4. Contratos HTTP preliminares — ms-catalog

### GET /publicaciones
**Ampliar Fase I con filtros server-side (MTEC-13)**

Query params:
- `page` (integer, default 1)
- `pageSize` (integer, default 12, max 100)
- `q` (string, busqueda por texto)
- `categoria` (string)
- `sortBy` (enum: `precio`, `fecha`, default `fecha`)
- `sortDir` (enum: `asc`, `desc`, default `desc`)
- `precioMin` (number)
- `precioMax` (number)

Response (200):
```json
{
  "data": {
    "items": [
      {
        "id": "pub_xyz789",
        "categoria": "Electronica",
        "subcategoria": "Laptops",
        "titulo": "Laptop Dell XPS",
        "descripcion": "En excelente estado...",
        "precio": 85000,
        "condicion": "Usado",
        "ubicacion": "Campus San Carlos",
        "imagen": "https://blob.../pub_xyz789/main.jpg",
        "createdAt": 1789950000,
        "estado": "activo",
        "vendedor": {
          "id": "usr_abc123",
          "nombre": "Ana Lopez",
          "carrera": "Computacion",
          "verificado": true
        }
      }
    ],
    "totalRecords": 150,
    "page": 1,
    "pageSize": 12
  }
}
```

**Nota de compatibilidad:** El campo `fechaPublicacion: string` del frontend debe convertirse a `createdAt: number` (epoch). Impacto en: `publication.model.ts`, `my-publications.model.ts`, `publication-detail.model.ts`.

---

### GET /publicaciones/{id}
**Compatible con Fase I**

Response (200): esquema similar al listado con campos adicionales `imagenes[]`, `especificaciones`, `incluye[]`.

---

### POST /publicaciones
**Compatible con Fase I — autorizacion por JWT**

Request:
```json
{
  "categoria": "Electronica",
  "subcategoria": "Laptops",
  "titulo": "Laptop Dell XPS",
  "descripcion": "En excelente estado...",
  "precio": 85000,
  "condicion": "Usado",
  "ubicacion": "Campus San Carlos",
  "imagenes": ["https://blob.../pub_xyz789/img1.jpg"]
}
```

**Cambio:** Se agrega el campo `imagenes` (lista de URLs previas). El `vendedorId` se deriva del JWT, no del body.

Response (201):
```json
{
  "data": {
    "id": "pub_xyz789",
    "createdAt": 1790000000
  }
}
```

---

### GET /usuarios/{id}/publicaciones
**Compatible con Fase I — agregar paginacion (MTEC-9)**

Query params: `page`, `pageSize`

---

### GET /chats
**Compatible con Fase I — agregar paginacion (MTEC-9)**

Query params: `page`, `pageSize`

Response incluye `Chat` con campos `createdAt` (epoch) en lugar de `fecha` (string).

---

### POST /chats/{id}/mensajes
**Compatible con Fase I**

Request:
```json
{ "texto": "Hola, me interesa tu publicacion" }
```

Response (201):
```json
{
  "data": {
    "id": "msg_001",
    "createdAt": 1790000100
  }
}
```

---

### POST /images/upload-url
**Nuevo endpoint**

Genera una SAS URL pre-firmada para subida directa a Azure Blob Storage.

Request:
```json
{
  "filename": "laptop.jpg",
  "contentType": "image/jpeg"
}
```

Response (200):
```json
{
  "data": {
    "uploadUrl": "https://storageaccount.blob.core.windows.net/...?sas=...",
    "publicUrl": "https://storageaccount.blob.core.windows.net/.../laptop.jpg",
    "expiresAt": 1790001800
  }
}
```

---

## 5. Contratos HTTP preliminares — ms-notifications

### GET /notificaciones
**Nuevo endpoint**

Query params: `page`, `pageSize`, `leida` (boolean)

Response (200): lista paginada de notificaciones.

---

### PUT /notificaciones/{id}/leida
**Nuevo endpoint**

Response (200): confirmacion de lectura.

---

### SSE /v1/notificaciones/stream
**Endpoint propuesto — no implementado**

El servidor emitira eventos cuando haya nuevas notificaciones para el usuario. Antes de fijar el contrato debe aprobarse un mecanismo de autenticacion compatible con el navegador y APIM: `EventSource` nativo no permite agregar arbitrariamente `Authorization` ni `Ocp-Apim-Subscription-Key`. No se aceptaran tokens de acceso permanentes en parametros de URL.

Payload JSON del evento:
```json
{
  "type": "notification",
  "payload": {
    "id": "notif_001",
    "type": "message.received",
    "title": "Nuevo mensaje de Ana Lopez",
    "body": "Hola, me interesa tu publicacion",
    "occurredAt": 1790000100,
    "read": false
  }
}
```

---

## 6. Versionado de contratos HTTP

- Todos los endpoints se versiona en la ruta: `/v1/publicaciones`, `/v1/usuarios`, etc.
- APIM expone el path sin version al cliente para abstraccion: `GET /publicaciones` -> `GET /v1/publicaciones` en backend.
- Los contratos de Fase I son version 1. Cambios incompatibles requieren version 2.
- El header `X-API-Version` puede usarse para negociacion cuando APIM lo transforme.

---

## 7. Envelope de eventos asincrono

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "publication.created",
  "schemaVersion": 1,
  "occurredAt": 1790000000,
  "producer": "ms-catalog",
  "correlationId": "req-correlation-uuid",
  "payload": {}
}
```

### Tipos de eventos definidos

| eventType | Producer | Consumer | Payload |
|---|---|---|---|
| `user.registered` | ms-users | ms-notifications | `{ userId, email, nombre }` |
| `publication.created` | ms-catalog | ms-notifications | `{ publicationId, titulo, vendedorId, createdAt }` |
| `publication.sold` | ms-catalog | ms-notifications | `{ publicationId, vendedorId, compradorId, precio }` |
| `message.sent` | ms-catalog | ms-notifications | `{ chatId, senderId, receiverId, texto, createdAt }` |

---

## 8. Consideraciones de mensajeria asincrona

| Consideracion | Estrategia |
|---|---|
| Idempotencia | `eventId` UUID v4; el consumidor verifica si ya proceso ese ID (Azure Table Storage como deduplicacion) |
| Reintentos | Azure Queue visbility timeout + retry automatico; maximo 5 intentos |
| Dead-letter queue | Mensajes no procesados despues de 5 intentos van a cola `-dlq` |
| Mensajes duplicados | Verificacion de `eventId` antes de persistir; operacion idempotente |
| Confirmacion | Mensaje eliminado de la cola SOLO despues de procesamiento exitoso |
| Recuperacion ante fallos | DLQ con alerta; proceso manual o automatico de replay |
| Versionado de eventos | Campo `schemaVersion`; consumidor valida version antes de deserializar |
| Consistencia eventual | Aceptada para notificaciones; no son transaccionales |

---

## 9. Seguridad de llamadas HTTP

| Mecanismo | Donde aplica |
|---|---|
| `Ocp-Apim-Subscription-Key` | Header en todas las llamadas cliente -> APIM |
| `Authorization: Bearer <token>` | Token JWT interno (emitido por ms-users tras autenticar con Google) |
| Certificado cliente (mTLS) | APIM -> backends (ms-users, ms-catalog, ms-notifications) |
| `X-Correlation-ID` | Header propagado en toda la cadena para trazabilidad |

---

## 10. Estrategia de migracion de contratos (Fase I -> Fase II)

| Campo afectado | Fase I | Fase II | Estrategia |
|---|---|---|---|
| `fechaPublicacion: string` | ISO string | `createdAt: integer` (epoch) | Politica APIM de transformacion temporal; luego actualizar frontend |
| `fecha: string` en Chat | ISO string | `createdAt: integer` (epoch) | Idem |
| `fechaRegistro: string` en User | ISO string | `createdAt: integer` (epoch) | Idem |
| Paginacion sin filtros | Solo `page`/`pageSize` | Filtros adicionales server-side | Backward compatible: parametros opcionales |
| Identity `USR-001` | ID hardcodeado | ID dinamico del JWT | Requiere cambio frontend (MTEC-10) + nuevo endpoint `POST /auth/google` |
| `imagenes` en CREATE | No enviadas | Lista de URLs post-upload | Nuevo campo opcional; el frontend necesita flujo de upload previo |

---

*Nota: Los contratos son preliminares y deben validarse contra el frontend antes de implementar.*
