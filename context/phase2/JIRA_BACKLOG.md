# Backlog Jira — Fase II

**Estado:** Propuesta — No crear tickets hasta recibir aprobacion
**Fecha:** 2026-10-18
**Proyecto:** MarketTec (MTEC)

> **Actualizacion Etapa B (2026-10-18):** no se crearon ni modificaron tickets. La fundacion implementada se describe en [IMPLEMENTED_FOUNDATION.md](IMPLEMENTED_FOUNDATION.md). Los identificadores `MTEC-F01` y similares siguen siendo propuestas. MarketTec es exclusivamente web; `MTEC-N03` se conserva como discrepancia academica pendiente de validacion docente y no debe ejecutarse como integracion FCM sin esa validacion.

---

## 1. Relacion con tickets existentes (MTEC-9 a MTEC-18)

| Ticket | Titulo | Relacion con Fase II | Area | Microservicio | Dependencias arquitectonicas | Contrato afectado | Orden sugerido |
|---|---|---|---|---|---|---|---|
| MTEC-9 | Paginacion en Mis Publicaciones y Chats | **Directo:** requiere que ms-catalog implemente `page`/`pageSize` en `GET /usuarios/{id}/publicaciones` y `GET /chats` | Frontend + Backend | ms-catalog | Contrato de paginacion server-side definido | Si — query params de paginacion | 2 (despues de ms-catalog base) |
| MTEC-10 | Sustituir USR-001 por identidad dinamica | **Critico:** requiere `POST /auth/google` en ms-users para obtener userId interno; luego actualizar frontend para usar ese ID | Frontend + Backend | ms-users | Flujo de autenticacion Google aprobado | Si — nuevo endpoint POST /auth/google | 2 (depende de ms-users autenticando) |
| MTEC-11 | Fallo de build Angular exit 134 | **Indirecto:** no bloquea backend pero si CI/CD y la entrega final | Frontend / CI | N/A | Ninguna de Fase II | No | 1 (paralelizable) |
| MTEC-12 | Politicas APIM para validacion JWT Google | **Directo:** depende de que ms-users emita un JWT interno; APIM valida ese JWT | APIM | ms-users + APIM | ms-users implementado y desplegado | Si — politica validate-jwt en APIM | 3 (despues de despliegue en Azure) |
| MTEC-13 | Filtros server-side en catalogo | **Directo:** implementado en ms-catalog como caso de uso | Backend | ms-catalog | Contrato de filtros OpenAPI definido | Si — query params adicionales | 2 (durante implementacion ms-catalog) |
| MTEC-14 | Carga y persistencia real de imagenes | **Directo:** ms-catalog genera SAS URL; frontend sube a Blob directamente | Backend + Frontend | ms-catalog | Azure Blob Storage aprovisionado | Si — nuevo endpoint POST /images/upload-url | 2-3 |
| MTEC-15 | Especificacion OpenAPI formal | **Critico:** debe orientar todos los contratos de Fase II; cada microservicio genera su propio OpenAPI | Backend + APIM | ms-users, ms-catalog, ms-notifications | Contratos de Fase II aprobados | Si — OpenAPI generado desde codigo | 1 (disenio) + 2-3 (implementacion) |
| MTEC-16 | Accesibilidad del panel de perfil | **Indirecto:** trabajo de frontend puro; no depende de Fase II pero es entregable | Frontend | N/A | Ninguna | No | Paralelizable en cualquier momento |
| MTEC-17 | Endurecimiento interceptor y expiracion sesion | **Indirecto:** mejor con el nuevo flujo JWT interno de ms-users; cambiar el token que el interceptor adjunta | Frontend | ms-users | ms-users emitiendo JWT interno | Si — cambio en el tipo de token Bearer | 3 (despues de ms-users) |
| MTEC-18 | Decision arquitectonica sobre Express | **No resuelto:** `ms-catalog` se creo independiente y `app/backend` se conserva. ADR-002 sigue `Proposed`; falta decidir el destino final del auxiliar. | Backend | ms-catalog + backend auxiliar | Aprobacion de ADR-002 | Si — ADR de Express | Pendiente de decision |

---

## 2. Tickets nuevos propuestos para Fase II

> **IMPORTANTE:** No crear estos tickets en Jira durante la Etapa A. Usar como referencia para planificar.

---

### Fundacion de microservicios

#### MTEC-F01 — Creacion y estructura hexagonal de ms-users (Spring Boot)
- **Tipo:** Story
- **Prioridad:** Critical
- **Descripcion:** Formalizar la entrega de la fundacion ya creada en `app/ms-users` con Maven Wrapper + Spring Boot 3.5.16 + Java 21. La estructura hexagonal contiene el caso de uso tecnico health y una prueba ArchUnit; OpenAPI de negocio queda fuera de esta fundacion.
- **Criterios de aceptacion:**
  1. `./mvnw verify` compila, prueba y empaqueta
  2. `GET /health` responde estado tecnico con Epoch seconds y correlation ID
  3. Prueba ArchUnit verifica dependencias hacia adentro
  4. README con instrucciones de setup local
- **Dependencias:** Aprobacion de arquitectura (MTEC-A01)
- **Servicio:** ms-users
- **Fase:** Tecnica 1

#### MTEC-F02 — Creacion y estructura hexagonal de ms-catalog (Node.js + Express + TypeScript)
- **Tipo:** Story
- **Prioridad:** Critical
- **Descripcion:** Formalizar la entrega de la fundacion ya creada en `app/ms-catalog` con Node.js 24 + Express 5 + TypeScript. La estructura hexagonal contiene el caso de uso tecnico health; OpenAPI de negocio queda pendiente.
- **Criterios de aceptacion:**
  1. `npm start` arranca sin errores
  2. `GET /health` responde correctamente
  3. `npm run check` ejecuta typecheck, build y pruebas HTTP
  4. README con instrucciones de setup local
  5. `tsconfig` estricto sin errores de tipo
- **Dependencias:** Aprobacion de arquitectura
- **Servicio:** ms-catalog
- **Fase:** Tecnica 1

#### MTEC-F03 — Creacion y estructura hexagonal de ms-notifications (Python + FastAPI)
- **Tipo:** Story
- **Prioridad:** Critical
- **Descripcion:** Formalizar la entrega de la fundacion ya creada en `app/ms-notifications` con Python 3.12 + FastAPI. Incluye health y OpenAPI tecnico; Queue, Table y SSE quedan para tickets de casos de uso posteriores.
- **Criterios de aceptacion:**
  1. `uvicorn markettec_notifications.main:app` arranca sin errores
  2. `GET /health` responde correctamente
  3. OpenAPI disponible en `/docs`
  4. README con instrucciones de setup local
- **Dependencias:** Aprobacion de arquitectura
- **Servicio:** ms-notifications
- **Fase:** Tecnica 1

---

### Implementacion de negocio — ms-users

#### MTEC-U01 — Autenticacion Google con emision de JWT interno
- **Tipo:** Story
- **Prioridad:** High
- **Descripcion:** Implementar `POST /v1/auth/google` que valida el ID token de Google contra JWKS, crea o recupera el usuario interno, y emite un JWT firmado con el userId interno como subject.
- **Criterios de aceptacion:**
  1. Token Google valido -> 200 con JWT interno + expiresAt (epoch)
  2. Token Google invalido (alg:none, firma incorrecta) -> 401
  3. Token expirado -> 401
  4. Usuario nuevo se registra en la base de datos
  5. Usuario existente actualiza last_login
  6. Prueba unitaria del UseCase con mock de GoogleJwksProvider
- **Dependencias:** MTEC-F01, configuracion de Google Client ID
- **Servicio:** ms-users
- **Fase:** Tecnica 2
- **Resuelve:** MTEC-10 (parcialmente, requiere cambio en frontend), MTEC-12 (base para validate-jwt en APIM), MTEC-17 (nuevo token para el interceptor)

#### MTEC-U02 — Endpoints de perfil de usuario
- **Tipo:** Story
- **Prioridad:** High
- **Descripcion:** Implementar `GET /v1/usuarios/{id}` y `PUT /v1/usuarios/{id}`. Autorizar que solo el usuario dueno puede hacer PUT. El GET de otro usuario muestra perfil publico.
- **Criterios de aceptacion:**
  1. GET retorna perfil con `createdAt` (epoch)
  2. PUT retorna perfil actualizado con `updatedAt` (epoch)
  3. PUT con ID diferente al del JWT retorna 403
  4. ID no existente retorna 404
  5. Pruebas de autorizacion y validacion
- **Dependencias:** MTEC-F01, MTEC-U01, Azure SQL configurado
- **Servicio:** ms-users
- **Fase:** Tecnica 2
- **Resuelve:** MTEC-10 (con cambio en frontend)

---

### Implementacion de negocio — ms-catalog

#### MTEC-C01 — Endpoints de publicaciones con filtros server-side
- **Tipo:** Story
- **Prioridad:** High
- **Descripcion:** Implementar `GET /v1/publicaciones` con soporte de filtros: `page`, `pageSize`, `q`, `categoria`, `sortBy`, `sortDir`, `precioMin`, `precioMax`. Implementar `GET /v1/publicaciones/{id}`, `POST /v1/publicaciones`, `GET /v1/usuarios/{id}/publicaciones`.
- **Criterios de aceptacion:**
  1. GET /publicaciones pagina correctamente (page, pageSize)
  2. Filtro por categoria retorna solo publicaciones de esa categoria
  3. Busqueda por texto (q) busca en titulo y descripcion
  4. POST crea publicacion con vendedorId del JWT (no del body)
  5. `createdAt` en respuesta es epoch seconds
  6. Pruebas unitarias por UseCase
- **Dependencias:** MTEC-F02, Cosmos DB emulador local o cuenta Azure
- **Servicio:** ms-catalog
- **Fase:** Tecnica 2
- **Resuelve:** MTEC-13, MTEC-9 (parcialmente)

#### MTEC-C02 — Endpoints de mensajeria y publicacion de eventos
- **Tipo:** Story
- **Prioridad:** High
- **Descripcion:** Implementar `GET /v1/chats` y `POST /v1/chats/{id}/mensajes`. Al enviar un mensaje, publicar evento `message.sent` en Azure Queue Storage.
- **Criterios de aceptacion:**
  1. GET /chats retorna lista paginada de chats del usuario autenticado
  2. POST /chats/{id}/mensajes guarda el mensaje y retorna id + createdAt (epoch)
  3. POST exitoso publica evento en Azure Queue
  4. Estructura del evento sigue el envelope definido en API_AND_EVENTS.md
  5. Prueba unitaria del UseCase + prueba de que el publisher es invocado
- **Dependencias:** MTEC-F02, MTEC-C01, Azure Queue accesible
- **Servicio:** ms-catalog
- **Fase:** Tecnica 2
- **Resuelve:** MTEC-9

#### MTEC-C03 — Upload de imagenes con SAS token
- **Tipo:** Story
- **Prioridad:** Medium
- **Descripcion:** Implementar `POST /v1/images/upload-url` que genera una SAS URL pre-firmada para subida directa a Azure Blob Storage. El frontend sube la imagen y luego incluye la URL publica en el POST de publicacion.
- **Criterios de aceptacion:**
  1. Endpoint retorna `uploadUrl` (SAS) y `publicUrl` con `expiresAt` (epoch)
  2. La URL SAS permite hacer PUT de un archivo de imagen desde el cliente
  3. La imagen es accesible publicamente por `publicUrl`
  4. SAS expira correctamente despues de `expiresAt`
- **Dependencias:** MTEC-F02, Azure Blob Storage aprovisionado
- **Servicio:** ms-catalog
- **Fase:** Tecnica 2-3
- **Resuelve:** MTEC-14

---

### Implementacion de negocio — ms-notifications

#### MTEC-N01 — Consumidor de cola y persistencia de notificaciones
- **Tipo:** Story
- **Prioridad:** High
- **Descripcion:** Implementar el consumidor de Azure Queue que procesa eventos `publication.created`, `message.sent`, etc. Para cada evento, crear y persistir una entidad `Notification` en Azure Table Storage. Implementar idempotencia con verificacion de `eventId`.
- **Criterios de aceptacion:**
  1. Consumidor procesa mensajes de la cola cada N segundos
  2. Mensaje procesado crea una fila en Azure Table Storage
  3. Mensaje duplicado (mismo eventId) no crea duplicados
  4. Mensaje con formato invalido va a DLQ despues de 5 reintentos
  5. `GET /v1/notificaciones` retorna notificaciones paginadas del usuario autenticado
  6. Prueba unitaria del UseCase con mock de repository y queue
- **Dependencias:** MTEC-F03, Azure Queue + Table Storage accesibles
- **Servicio:** ms-notifications
- **Fase:** Tecnica 2-3
- **Resuelve:** R15, R16

#### MTEC-N02 — Notificaciones web en tiempo real via SSE
- **Tipo:** Story
- **Prioridad:** High
- **Descripcion:** Implementar SSE en ms-notifications una vez aprobado un mecanismo de autenticacion compatible con navegador, `EventSource` y APIM. No usar tokens permanentes en URL.
- **Criterios de aceptacion:**
  1. El mecanismo de autenticacion para SSE esta aprobado y no usa tokens permanentes en URL
  2. Conexion sin autorizacion valida es rechazada
  3. Cuando se procesa un evento de la cola para ese usuario, el mensaje llega via SSE
  4. Demo funcional desde la SPA Angular (nuevo servicio en frontend)
- **Dependencias:** MTEC-N01
- **Servicio:** ms-notifications
- **Fase:** Tecnica 3
- **Resuelve:** R17, R29

#### MTEC-N03 — Validar discrepancia academica de push movil
- **Tipo:** Story
- **Prioridad:** High
- **Descripcion:** Solicitar definicion docente sobre el requisito de push movil, que contradice el alcance confirmado de aplicacion exclusivamente web. No implementar app movil, registro de dispositivos ni FCM hasta resolverlo.
- **Criterios de aceptacion:**
  1. El docente confirma por escrito si el requisito aplica a una aplicacion exclusivamente web
  2. La matriz de trazabilidad y criterios de entrega reflejan esa respuesta
  3. Cualquier alternativa web se disena antes de implementar y pasa revision de seguridad
- **Dependencias:** validacion docente
- **Servicio:** ms-notifications
- **Fase:** Tecnica 3
- **Resuelve:** R18, R30

---

### Integracion y seguridad

#### MTEC-I01 — Despliegue de 3 App Services en Azure con CI/CD
- **Tipo:** Task
- **Prioridad:** High
- **Descripcion:** Crear 3 Azure App Services y configurar 3 workflows de GitHub Actions para despliegue automatico desde la rama main.
- **Criterios de aceptacion:**
  1. 3 App Services funcionando con health check verde
  2. Push a main desencadena deploy de los servicios modificados (path filter)
  3. Secrets de Azure en GitHub Actions (no hardcodeados)
- **Dependencias:** MTEC-F01, MTEC-F02, MTEC-F03
- **Servicio:** Todos / DevOps
- **Fase:** Tecnica 3

#### MTEC-I02 — Configuracion de Azure APIM con politicas de seguridad
- **Tipo:** Task
- **Prioridad:** High
- **Descripcion:** Importar las 3 APIs en APIM. Configurar politicas: validate-jwt (JWKS de Google o JWT interno), subscription-key, correlation-id, rate-limiting, transformacion de timestamps si aplica.
- **Criterios de aceptacion:**
  1. Las 3 APIs importadas y rutas enrutadas correctamente
  2. Token JWT invalido -> 401 desde APIM (no llega al backend)
  3. Request sin subscription key -> 401
  4. X-Correlation-ID generado y propagado a todos los backends
- **Dependencias:** MTEC-I01, MTEC-U01
- **Servicio:** APIM
- **Fase:** Tecnica 3
- **Resuelve:** MTEC-12, R08, R11

#### MTEC-I03 — Certificados mTLS APIM -> App Services
- **Tipo:** Task
- **Prioridad:** High
- **Descripcion:** Generar certificado cliente en APIM. Configurar cada App Service para requerir ese certificado. Verificar que una peticion directa (sin APIM) sea rechazada.
- **Criterios de aceptacion:**
  1. Peticion directa al App Service URL retorna error TLS o 403
  2. Peticion via APIM con certificado correcto pasa
  3. Certificado almacenado en Key Vault; no en codigo
- **Dependencias:** MTEC-I01, MTEC-I02
- **Servicio:** APIM + App Services
- **Fase:** Tecnica 3
- **Resuelve:** R09, R10

---

### Entregables finales

#### MTEC-E01 — Coleccion Postman con pruebas por endpoint
- **Tipo:** Task
- **Prioridad:** High
- **Descripcion:** Crear y exportar coleccion Postman con todos los endpoints de los 3 servicios. Cada request debe tener al menos un test script (verificacion de status code, schema basico).
- **Criterios de aceptacion:**
  1. Coleccion exportada como JSON en `/postman/markettec-api.postman_collection.json`
  2. Variables de entorno para base URL y tokens
  3. Al menos 1 test de Postman por endpoint
  4. `newman run postman/markettec-api.postman_collection.json` ejecuta sin errores criticos
- **Dependencias:** Todos los servicios desplegados (MTEC-I01, MTEC-I02)
- **Servicio:** Todos
- **Fase:** Tecnica 4

#### MTEC-E02 — Evidencias de 3 tipos de almacenamiento Azure
- **Tipo:** Task
- **Prioridad:** Medium
- **Descripcion:** Capturar evidencias (screenshots o exportaciones) de datos reales en Azure SQL Database, Cosmos DB y Table Storage durante una demo de funcionamiento.
- **Criterios de aceptacion:**
  1. Screenshot de Azure Portal mostrando tabla de usuarios en SQL Database
  2. Screenshot de Cosmos DB con coleccion de publicaciones
  3. Screenshot de Table Storage con notificaciones
  4. Archivos de evidencia en `/docs/evidence/`
- **Dependencias:** MTEC-I01 + datos de prueba creados
- **Servicio:** Azure Storage
- **Fase:** Tecnica 4

#### MTEC-E03 — Video demostrativo de 5 minutos
- **Tipo:** Task
- **Prioridad:** High
- **Descripcion:** Grabar video de maximo 5 minutos mostrando autenticacion Google, creacion de publicacion, notificacion SSE en web y acceso via APIM. La evidencia de push depende de la validacion docente registrada en MTEC-N03.
- **Criterios de aceptacion:**
  1. Video de max 5 min en formato MP4 o link
  2. Muestra autenticacion Google end-to-end
  3. Muestra creacion de publicacion y notificacion resultante
  4. Muestra SSE en tiempo real en la SPA
  5. Documenta el resultado de la validacion del requisito de push
- **Dependencias:** Todo funcional
- **Servicio:** Todos
- **Fase:** Tecnica 4

---

## 3. Orden de ejecucion recomendado

```
[1] MTEC-A01 (Aprobacion arquitectura) -> MTEC-18 (ADR Express)
[2] MTEC-F01, MTEC-F02, MTEC-F03 (en paralelo: 1 por integrante)
[3] MTEC-U01 -> MTEC-U02 (ms-users)
    MTEC-C01 -> MTEC-C02 -> MTEC-C03 (ms-catalog)
    MTEC-N01 (ms-notifications)
[4] MTEC-I01 -> MTEC-I02 -> MTEC-I03 (deploy + APIM + certs)
    MTEC-N02 (SSE web) + MTEC-N03 (validacion docente de push)
[5] MTEC-11 (build frontend, paralelizable)
    MTEC-16 (accesibilidad, paralelizable)
    MTEC-17 (despues de MTEC-U01)
[6] MTEC-E01, MTEC-E02, MTEC-E03 (entregables finales)
```

---

*Nota: Los IDs propuestos (MTEC-F01, MTEC-U01, etc.) son internos de este documento. Los IDs definitivos en Jira se asignaran al crear los tickets.*
