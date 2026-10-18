# Hoja de Ruta de Implementacion — Fase II

**Estado:** Propuesta — Pendiente de aprobacion
**Fecha:** 2026-10-18
**Entrega final:** 16 de noviembre de 2026, 07:00 a.m.
**Equipo:** 3 integrantes
**Semanas disponibles:** ~4 semanas (18 oct - 16 nov 2026)

> **Actualizacion Etapa B (2026-10-18):** **Verificado:** la fundacion tecnica de los tres servicios y sus CI esta implementada según [IMPLEMENTED_FOUNDATION.md](IMPLEMENTED_FOUNDATION.md). Los ADR permanecen `Proposed`, no se implemento negocio ni Azure y `app/backend` se conserva. La aplicacion es exclusivamente web; push movil/FCM queda pendiente de validacion docente, no planificado para implementacion.

---

## Cronograma general

```
Semana 1  (18-24 oct):  Fase Tecnica 1 - Fundacion
Semana 2  (25-31 oct):  Fase Tecnica 2 - Servicios de negocio
Semana 3  (1-7  nov):   Fase Tecnica 3 - Integracion distribuida
Semana 4  (8-14 nov):   Fase Tecnica 4 - Validacion y entrega
Semana 4+ (15-16 nov):  Buffer y entrega final
```

---

## Fase Tecnica 1 — Fundacion (Semana 1: 18-24 oct)

### Objetivo
Tener la estructura de los tres microservicios ejecutable localmente con su health check. Decisiones arquitectonicas aprobadas.

### Hitos verificables

| Hito | Criterio de verificacion | Dependencias |
|---|---|---|
| 1.1 Arquitectura aprobada | El equipo revisa y aprueba MICROSERVICES_ARCHITECTURE.md | Ninguna |
| 1.2 Estructura ms-users creada | `./mvnw verify`; `GET /health` | Implementado y verificado |
| 1.3 Estructura ms-catalog creada | `npm run check`; `GET /health` | Implementado y verificado |
| 1.4 Estructura ms-notifications creada | pytest; `GET /health` | Implementado y verificado localmente en Python 3.15; CI apunta a 3.12 |
| 1.5 Contratos OpenAPI generados | FastAPI expone OpenAPI tecnico; Spring/Express OpenAPI de negocio pendiente | Parcial; no ampliar alcance sin contratos aprobados |
| 1.6 Contratos preliminares revisados | El equipo valida API_AND_EVENTS.md | Aprobacion arquitectura |

### Tareas de Fase Tecnica 1

- [ ] Aprobacion de Etapa A por el equipo
- [x] Creacion del directorio `app/ms-users` con Maven + Spring Boot 3.5.16
- [x] Creacion del directorio `app/ms-catalog` con npm + Express + TypeScript
- [x] Creacion del directorio `app/ms-notifications` con Python + FastAPI
- [x] Configuracion de estructura hexagonal basica con un caso de uso real en cada servicio
- [x] Health check endpoint uniforme `GET /health` en cada servicio
- [x] README por microservicio con instrucciones de setup local
- [ ] Seleccion definitiva de almacenamiento (confirmar SQL vs PostgreSQL para ms-users)

### Camino critico en Fase 1

```
Aprobacion arquitectura --> Creacion estructuras --> Health checks funcionando
```

---

## Fase Tecnica 2 — Servicios de negocio (Semana 2: 25-31 oct)

### Objetivo
Implementar los casos de uso principales de cada microservicio. Compatibilidad con el frontend de Fase I.

### Hitos verificables

| Hito | Criterio de verificacion | Dependencias |
|---|---|---|
| 2.1 ms-users: endpoints de usuario | `GET /v1/usuarios/{id}` y `PUT /v1/usuarios/{id}` responden correctamente | Estructura ms-users + DB local |
| 2.2 ms-users: autenticacion Google | `POST /v1/auth/google` valida token real de Google y emite JWT | ms-users + JWKS de Google |
| 2.3 ms-catalog: endpoints de publicaciones | `GET`, `GET/{id}`, `POST /v1/publicaciones` responden | Estructura ms-catalog + Cosmos emulador |
| 2.4 ms-catalog: endpoints de chat | `GET /v1/chats` y `POST /v1/chats/{id}/mensajes` responden | ms-catalog funcionando |
| 2.5 ms-catalog: upload de imagenes | `POST /v1/images/upload-url` genera SAS token valido | Azure Blob o Azurite emulador |
| 2.6 Identidad dinamica | Ninguna llamada usa USR-001; el userId viene del JWT | ms-users autenticando |
| 2.7 Paginacion server-side | `GET /publicaciones?page=1&pageSize=12&categoria=X` funciona | ms-catalog |

### Tareas de Fase Tecnica 2 — ms-users (asignacion sugerida: 1 integrante)

- [ ] Implementar entidad `User` y value objects (`UserId`, `Email`, `GoogleSubject`)
- [ ] Implementar `UserRepository` (interfaz) y `UserJpaRepository` (JPA)
- [ ] Implementar `AuthenticateWithGoogleUseCase` con verificacion JWKS
- [ ] Implementar `GetUserProfileUseCase` y `UpdateUserProfileUseCase`
- [ ] Implementar controladores REST: `AuthController`, `UserController`
- [ ] Migracion de base de datos: Flyway o Liquibase con schema inicial
- [ ] Pruebas unitarias de casos de uso con mocks de puertos

### Tareas de Fase Tecnica 2 — ms-catalog (asignacion sugerida: 1 integrante)

- [ ] Implementar entidades `Publication`, `Chat`, `Message`
- [ ] Implementar repositorios con Azure Cosmos DB (emulador local)
- [ ] Implementar casos de uso de publicaciones y chats
- [ ] Controladores REST con DTOs y mappers
- [ ] Publicar eventos en Azure Queue al crear publicacion o enviar mensaje
- [ ] Filtros server-side en `GET /publicaciones`
- [ ] Pruebas unitarias de casos de uso

### Tareas de Fase Tecnica 2 — ms-notifications (asignacion sugerida: 1 integrante)

- [ ] Implementar entidad `Notification` (dataclass)
- [ ] Implementar consumidor de Azure Queue (polling o trigger)
- [ ] Persistir notificaciones en Azure Table Storage (Azurite local)
- [ ] Implementar SSE para tiempo real despues de resolver autenticacion navegador/APIM
- [ ] Validar con el docente la discrepancia del requisito de push movil; no implementar FCM en la aplicacion web actual
- [ ] Pruebas unitarias de casos de uso

---

## Fase Tecnica 3 — Integracion distribuida (Semana 3: 1-7 nov)

### Objetivo
Conectar los tres microservicios con APIM, certificados, cola y notificaciones. Demo del flujo completo.

### Hitos verificables

| Hito | Criterio de verificacion | Dependencias |
|---|---|---|
| 3.1 App Services desplegados | 3 URLs de Azure App Services responenden health check | Estructuras de Fase 2 |
| 3.2 APIM configurado | Peticion desde Postman via APIM llega al backend correcto | App Services + APIM |
| 3.3 Certificados instalados | Peticion directa al App Service (sin APIM) retorna error | APIM + App Services |
| 3.4 JWT validado en APIM | Token manipulado retorna 401 desde APIM | APIM + ms-users |
| 3.5 Cola funcionando | Crear publicacion genera un mensaje en Azure Queue | ms-catalog en Azure |
| 3.6 Notificacion persistida | Notificacion aparece en `GET /notificaciones` despues de publicar | ms-notifications + Queue |
| 3.7 SSE funcionando | SPA muestra notificacion en tiempo real con autenticacion aprobada | ms-notifications + frontend |
| 3.8 Push movil | Discrepancia de alcance validada con docente | No implementar hasta recibir definicion compatible con producto web |

### Tareas de Fase Tecnica 3

- [ ] Crear y configurar 3 Azure App Services
- [ ] Configurar CI/CD: 3 workflows GitHub Actions
- [ ] Configurar Azure APIM: importar OpenAPI de cada servicio
- [ ] Configurar politicas APIM: validate-jwt, subscription-key, correlation-id
- [ ] Generar y configurar certificado cliente APIM
- [ ] Configurar IP restrictions en App Services
- [ ] Configurar Azure Key Vault + Managed Identities
- [ ] Aprovisionar Azure SQL Database (ms-users)
- [ ] Aprovisionar Azure Cosmos DB (ms-catalog)
- [ ] Aprovisionar Azure Table Storage (ms-notifications)
- [ ] Aprovisionar Azure Queue Storage
- [ ] Aprovisionar Azure Blob Storage
- [ ] Demo integrada del flujo: crear publicacion -> evento -> notificacion -> SSE -> SPA

---

## Fase Tecnica 4 — Validacion y entrega (Semana 4: 8-14 nov)

### Objetivo
Completar documentacion, pruebas, coleccion Postman, video y preparar defensa.

### Hitos verificables

| Hito | Criterio de verificacion | Dependencias |
|---|---|---|
| 4.1 Coleccion Postman completa | Todos los endpoints en coleccion; cada uno con al menos 1 test | Fase 3 completa |
| 4.2 Newman ejecuta correctamente | `newman run collection.json` sin errores | Coleccion Postman |
| 4.3 Swagger accesible | Swagger UI de cada microservicio accesible via APIM | Fase 3 + APIM |
| 4.4 README actualizados | 3 READMEs con setup, ejecucion y variables de entorno | Implementacion completa |
| 4.5 Video grabado | Video de max 5 min mostrando flujos principales | Demo funcional |
| 4.6 Evidencias de almacenamiento | Screenshots de Azure Portal con datos reales en 3 servicios | Fase 3 + datos de prueba |
| 4.7 Defensa preparada | Cada integrante puede explicar su microservicio y la arquitectura general | Todo lo anterior |

### Tareas de Fase Tecnica 4

- [ ] Crear coleccion Postman exportable con todos los endpoints
- [ ] Agregar scripts de test en cada request de Postman
- [ ] Verificar Swagger/OpenAPI de cada microservicio
- [ ] Exportar definicion APIM
- [ ] Actualizar context/ con el estado final
- [ ] Grabar video demostrativo (max 5 min)
- [ ] Capturar evidencias de 3 tipos de almacenamiento
- [ ] Preparar asignacion de secciones para la defensa tecnica
- [ ] Buffer: correccion de bugs criticos (15-16 nov)

---

## Camino critico del proyecto

```
Aprobacion arquitectura
        |
        v
Creacion de estructuras (3 microservicios en paralelo)
        |
        v
Implementacion de casos de uso + persistencia local
        |
        v
Despliegue en Azure App Services
        |
        +--> Configuracion APIM + Certificados
        |
        v
Integracion cola + notificaciones
        |
        v
Demo completa del flujo
        |
        v
Postman + Swagger + Video
        |
        v
ENTREGA: 16 nov 2026 07:00
```

**Elemento de mayor riesgo en camino critico:** Configuracion de certificados mTLS. Si se bloquea, puede consumir 1-2 dias adicionales. Mitigacion: comenzar configuracion en paralelo con Fase 2, no esperar a Fase 3.

---

## Riesgos del plan

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| Configuracion de certificados mas compleja de lo esperado | Alta | Alto | Iniciar en semana 2; tener alternativa de IP restriction como fallback |
| Cosmos DB emulator no disponible localmente | Media | Medio | Usar cuenta Azure gratuita desde el inicio para dev |
| Spring Boot JVM OOM en App Service B2 | Baja | Alto | Configurar JVM heap max 1.5 GB; evaluar B2 o P1v3 |
| Requisito academico de push contradice alcance web | Alta | Alto | Solicitar validacion docente; no simular una app movil inexistente |
| Build Angular exit 134 no resuelto (MTEC-11) | Media | Medio | Resolver en paralelo en Semana 1; no bloquea backend |
| Coordinacion entre 3 integrantes trabajando en paralelo | Media | Medio | Daily standup corto; PRs con revision de otro integrante |

---

## Sugerencia de asignacion por integrante

> La asignacion definitiva depende de la experiencia y disponibilidad del equipo. Esta es una sugerencia logica:

| Integrante | Microservicio principal | Responsabilidades adicionales |
|---|---|---|
| Integrante A | ms-users (Spring Boot) | Configuracion APIM + certificados + JWT |
| Integrante B | ms-catalog (Node.js) | Azure Blob + Cosmos DB + filtros server-side |
| Integrante C | ms-notifications (Python) | Azure Queue + Table + SSE web |

Cada integrante tambien contribuye a: CI/CD de su servicio, Postman de sus endpoints, README de su servicio y la defensa tecnica de su area.

---

## Buffer y entrega

| Dia | Actividad |
|---|---|
| 15 nov (domingo) | Buffer final: bugs criticos, completar evidencias, ensayo de defensa |
| 16 nov 07:00 | Entrega final |

---

*Nota: Este roadmap es orientativo. Las dependencias tecnicas pueden alterar el orden; cualquier cambio debe documentarse.*
