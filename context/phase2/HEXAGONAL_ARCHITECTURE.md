# Arquitectura Hexagonal — Fase II

**Estado:** Propuesta — Pendiente de aprobacion
**Fecha:** 2026-10-18

> **Actualizacion Etapa B (2026-10-18):** la estructura minima realmente creada y verificada se documenta en [IMPLEMENTED_FOUNDATION.md](IMPLEMENTED_FOUNDATION.md). Solo existe el caso de uso tecnico de salud; no se crearon entidades, repositorios o adaptadores ficticios. Las estructuras detalladas de este documento siguen siendo propuestas para casos de uso futuros. Las referencias a FCM/push movil quedan fuera del alcance web confirmado y pendientes de validacion docente.

---

## 1. Principios generales

La arquitectura hexagonal (Ports & Adapters, Alistair Cockburn) establece que el nucleo de la aplicacion (dominio + casos de uso) es independiente de cualquier tecnologia de infraestructura. Las dependencias siempre apuntan hacia adentro.

```
Adapters (in) --> Application (Ports in) --> Domain
Domain --> Application (Ports out) --> Adapters (out)
```

### Reglas obligatorias

1. El dominio NO importa clases de Spring, Express, FastAPI, JDBC, Mongoose, etc.
2. Los casos de uso se expresan mediante interfaces (puertos de entrada); los controladores los invocan.
3. Los repositorios concretos implementan interfaces de puerto de salida definidas en la capa de aplicacion.
4. Los controladores HTTP no contienen logica de negocio.
5. Las dependencias ciclicas estan prohibidas.
6. Todo el dominio y aplicacion es testeable sin infraestructura real (mocks/fakes de puertos).

---

## 2. Estructura conceptual por microservicio

```
<service>/
|-- domain/
|   |-- entities/          # Entidades con identidad (Publication, User, Notification)
|   |-- value-objects/     # Objetos sin identidad (Money, Email, UserId)
|   |-- domain-services/   # Logica que no pertenece a una sola entidad
|   `-- events/            # Eventos de dominio (PublicationCreated, MessageSent)
|
|-- application/
|   |-- use-cases/         # Implementacion de cada caso de uso
|   `-- ports/
|       |-- in/            # Interfaces invocadas por adaptadores de entrada (HTTP, Queue)
|       `-- out/           # Interfaces implementadas por adaptadores de salida (DB, Queue, APIs)
|
|-- adapters/
|   |-- in/
|   |   |-- http/          # Controladores REST / SSE
|   |   `-- messaging/     # Consumidores de cola / eventos
|   `-- out/
|       |-- persistence/   # Implementaciones de repositorios
|       |-- messaging/     # Publicadores de eventos
|       `-- external/      # Clientes de servicios externos (por ejemplo Google JWKS)
|
|-- config/                # Inyeccion de dependencias, configuracion de infraestructura
`-- tests/
    |-- unit/              # Pruebas de dominio y casos de uso (sin infraestructura)
    |-- integration/       # Pruebas de adaptadores con infraestructura local/emulada
    `-- architecture/      # ArchUnit (Spring) o pruebas de estructura (otros)
```

---

## 3. Estructura especifica por tecnologia

### 3.1. ms-users — Spring Boot + Java

**Estructura de paquetes Maven:**

```
com.markettec.users/
|-- domain/
|   |-- model/
|   |   |-- User.java                # Entidad Usuario (sin anotaciones JPA en dominio)
|   |   |-- ExternalIdentity.java    # Mapping Google sub -> userId
|   |   `-- UserStatus.java          # Enum de estado
|   |-- valueobject/
|   |   |-- UserId.java
|   |   |-- Email.java
|   |   `-- GoogleSubject.java
|   |-- service/
|   |   `-- IdentityMappingService.java
|   `-- event/
|       `-- UserRegisteredEvent.java
|
|-- application/
|   |-- usecase/
|   |   |-- GetUserProfileUseCase.java
|   |   |-- UpdateUserProfileUseCase.java
|   |   |-- AuthenticateWithGoogleUseCase.java
|   |   `-- GetMyIdentityUseCase.java
|   `-- port/
|       |-- in/
|       |   |-- GetUserProfilePort.java
|       |   |-- UpdateUserProfilePort.java
|       |   `-- AuthenticateWithGooglePort.java
|       `-- out/
|           |-- UserRepository.java          # Interfaz (sin JPA)
|           |-- ExternalIdentityRepository.java
|           |-- GoogleJwksProvider.java      # Interfaz para verificacion JWKS
|           `-- EventPublisher.java          # Interfaz para publicar eventos de dominio
|
|-- adapter/
|   |-- in/
|   |   `-- web/
|   |       |-- UserController.java
|   |       |-- AuthController.java
|   |       |-- dto/
|   |       |   |-- UserResponse.java
|   |       |   |-- UpdateUserRequest.java
|   |       |   `-- GoogleAuthRequest.java
|   |       `-- mapper/
|   |           `-- UserDtoMapper.java
|   `-- out/
|       |-- persistence/
|       |   |-- UserJpaRepository.java
|       |   |-- UserEntity.java              # Entidad JPA (aqui si tienen anotaciones)
|       |   `-- UserPersistenceAdapter.java  # Implementa UserRepository
|       |-- googleauth/
|       |   `-- GoogleJwksAdapter.java       # Implementa GoogleJwksProvider
|       `-- messaging/
|           `-- AzureQueueEventPublisher.java
|
`-- config/
    |-- SecurityConfig.java
    |-- ApplicationConfig.java          # Beans de casos de uso
    `-- WebConfig.java
```

**Convenciones Spring Boot:**
- Usar `@Service`, `@Repository`, `@Controller` solo en la capa de adaptadores y config.
- El dominio usa POJOs puros; sin `@Entity` en entidades de dominio.
- Inyeccion por constructor en todos los casos de uso.
- Separar `UserEntity` (JPA) de `User` (dominio); el adaptador hace el mapeo.

---

### 3.2. ms-catalog — Node.js + Express + TypeScript

**Estructura de modulos:**

```
src/
|-- domain/
|   |-- entities/
|   |   |-- Publication.ts
|   |   |-- Chat.ts
|   |   `-- Message.ts
|   |-- value-objects/
|   |   |-- Money.ts
|   |   |-- PublicationId.ts
|   |   `-- Category.ts
|   |-- events/
|   |   |-- PublicationCreatedEvent.ts
|   |   `-- MessageSentEvent.ts
|   `-- services/
|       `-- PublicationDomainService.ts
|
|-- application/
|   |-- use-cases/
|   |   |-- ListPublicationsUseCase.ts
|   |   |-- GetPublicationDetailUseCase.ts
|   |   |-- CreatePublicationUseCase.ts
|   |   |-- GetUserPublicationsUseCase.ts
|   |   |-- ListChatsUseCase.ts
|   |   `-- SendMessageUseCase.ts
|   `-- ports/
|       |-- in/
|       |   |-- PublicationPort.ts
|       |   `-- ChatPort.ts
|       `-- out/
|           |-- PublicationRepository.ts
|           |-- ChatRepository.ts
|           |-- ImageStoragePort.ts
|           `-- EventPublisherPort.ts
|
|-- adapters/
|   |-- in/
|   |   `-- http/
|   |       |-- PublicationController.ts
|   |       |-- ChatController.ts
|   |       |-- ImageController.ts
|   |       |-- dtos/
|   |       `-- mappers/
|   `-- out/
|       |-- persistence/
|       |   |-- CosmosPublicationRepository.ts
|       |   `-- CosmosChatRepository.ts
|       |-- storage/
|       |   `-- AzureBlobStorageAdapter.ts
|       `-- messaging/
|           `-- AzureQueuePublisher.ts
|
|-- config/
|   |-- container.ts                   # Composicion de dependencias (sin framework IoC)
|   `-- express.ts                     # Configuracion del servidor
|
`-- tests/
    |-- unit/
    |-- integration/
    `-- architecture/
```

**Convenciones Node.js/TypeScript:**
- Usar interfaces TypeScript para todos los puertos.
- Inyeccion de dependencias manual en `container.ts` (sin inversify a menos que se justifique).
- Los controladores reciben los casos de uso como parametros en el constructor o factory.
- Separar DTOs de request/response de las entidades de dominio.

---

### 3.3. ms-notifications — Python + FastAPI

**Estructura de modulos:**

```
app/
|-- domain/
|   |-- models/
|   |   `-- notification.py      # Dataclass pura; sin SQLAlchemy
|   |-- events/
|   |   `-- domain_events.py
|   `-- services/
|       `-- notification_service.py
|
|-- application/
|   |-- use_cases/
|   |   |-- persist_notification.py
|   |   |-- deliver_realtime.py
|   `-- ports/
|       |-- in_ports/
|       |   `-- notification_port.py
|       `-- out_ports/
|           |-- notification_repository_port.py
|           |-- realtime_delivery_port.py
|
|-- adapters/
|   |-- in_adapters/
|   |   |-- queue_consumer.py    # Consume Azure Queue Storage
|   |   `-- sse_handler.py       # FastAPI SSE; autenticacion pendiente
|   `-- out_adapters/
|       |-- azure_table_repository.py
|       |-- sse_connection_manager.py
|
|-- config/
|   |-- settings.py              # Pydantic Settings
|   `-- dependencies.py          # FastAPI Depends() factories
|
`-- tests/
    |-- unit/
    `-- integration/
```

**Convenciones Python/FastAPI:**
- Usar `dataclasses` o Pydantic BaseModel en el dominio (no mezclar con ORM).
- Inyeccion de dependencias via `Depends()` de FastAPI en adaptadores de entrada.
- Separar modelos Pydantic de API de los modelos de dominio.
- El consumidor de cola corre como background task de FastAPI o proceso separado con `asyncio`.

---

## 4. Flujo de dependencias por capa

```
HTTP Request
     |
     v
[Adapter IN: Controller/Consumer]
     |
     v (invoca puerto de entrada)
[Application: Use Case]
     |
     v (accede via puerto de salida)
[Adapter OUT: Repository/Publisher/ExternalClient]
     |
     v
[Infrastructure: DB/Queue/API externa]
```

**El dominio NUNCA es tocado directamente por los adaptadores.** Todo pasa por los puertos.

---

## 5. Estrategia de pruebas

### Por capa

| Capa | Tipo de prueba | Herramienta | Lo que se testea |
|---|---|---|---|
| Dominio | Unitaria | JUnit5 / Vitest / pytest | Reglas de negocio puras; sin mocks de infra |
| Casos de uso | Unitaria con mocks | Mockito / vitest mock / pytest-mock | Orchestracion de puertos; comportamiento de flujo |
| Controladores HTTP | Integracion parcial | MockMvc / Supertest / TestClient | Mapeo HTTP, validacion de request, codigos de respuesta |
| Repositorios | Integracion con emulador | Testcontainers / CosmosDB emulator / Azurite | Queries reales contra DB emulada |
| Arquitectura | Estructura | ArchUnit / custom TypeScript | Cumplimiento de reglas de dependencia |

### Restricciones de pruebas de arquitectura (ms-users / Spring Boot)

```java
// Ejemplo conceptual con ArchUnit
layeredArchitecture()
  .layer("Domain").definedBy("..domain..")
  .layer("Application").definedBy("..application..")
  .layer("Adapters").definedBy("..adapter..")
  .whereLayer("Domain").mayNotAccessAnyLayer()
  .whereLayer("Application").mayOnlyAccessLayers("Domain")
  .whereLayer("Adapters").mayOnlyAccessLayers("Application", "Domain")
```

---

## 6. Reglas de organizacion

1. Los nombres de los puertos de entrada terminan en `Port` o `UseCase`.
2. Los nombres de los puertos de salida terminan en `Port` o `Repository`.
3. Las implementaciones de adaptadores terminan en `Adapter` o el nombre del proveedor.
4. Los DTOs de HTTP se ubican en el paquete/modulo del adaptador, nunca en el dominio.
5. Los eventos de dominio son inmutables y contienen solo datos serializables.
6. Un caso de uso corresponde a un unico caso de uso de negocio; no se crean "servicios genericos".
7. No crear interfaces vacias o entidades vacias para completar directorios.

---

*Nota: Esta estructura es conceptual. La implementacion real se aprobara en la Etapa B.*
