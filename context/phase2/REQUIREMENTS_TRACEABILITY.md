# Trazabilidad de Requisitos — Fase II

**Estado:** Propuesta — Pendiente de aprobacion
**Fecha:** 2026-10-18
**Entrega academica:** 16 de noviembre de 2026, 07:00 a.m.
**Equipo:** 3 integrantes

> **Actualizacion Etapa B (2026-10-18):** consultar [IMPLEMENTED_FOUNDATION.md](IMPLEMENTED_FOUNDATION.md) para evidencia ejecutada. La aplicacion es exclusivamente web. R18 y R30 se conservan por trazabilidad academica, pero son una discrepancia pendiente de validacion docente y no estan satisfechos.

---

## Leyenda de estado

| Estado | Significado |
|---|---|
| Planificado | Identificado y asignado a un componente; no comenzado |
| En Disenio | Decisiones arquitectonicas pendientes de aprobacion |
| En Progreso | Implementacion iniciada |
| Completado | Implementado y verificado |
| No Aplica | Requisito condicional para equipos de 4/5 integrantes |

---

## Matriz de trazabilidad

| # | Requisito Academico | Componente Responsable | Trabajo Necesario | Evidencia de Cumplimiento | Estado |
|---|---|---|---|---|---|
| R01 | Minimo 3 microservicios independientes | ms-users, ms-catalog, ms-notifications | Fundaciones independientes creadas; despliegues aun pendientes | Codigo en `/app/`; pruebas independientes locales | En Progreso |
| R02 | Cada microservicio desplegado en Azure App Services | ms-users, ms-catalog, ms-notifications | Configurar 3 App Services + 3 workflows CI/CD | URL publica de cada servicio accesible | Planificado |
| R03 | Al menos uno implementado en Spring Boot | ms-users | Proyecto base Spring Boot 3.5.16 + Java 21 creado | `./mvnw verify` ejecutado | Completado |
| R04 | Arquitectura hexagonal obligatoria en Spring Boot | ms-users | Capas con caso de uso health real y dependencias hacia adentro | Prueba ArchUnit ejecutada | Completado |
| R05 | Tecnologias distintas entre los 3 servicios | Spring Boot, Node.js, Python | Tres stacks diferentes creados | `pom.xml`, `package.json`, `pyproject.toml` | Completado |
| R06 | Microservicio especifico para notificaciones | ms-notifications | Servicio dedicado que consume cola y emite notificaciones | App Service independiente; endpoints de notificaciones | En Disenio |
| R07 | Exposicion de endpoints de negocio de Fase I | ms-users + ms-catalog | Implementar 8 endpoints existentes + nuevos | Coleccion Postman con todos los endpoints ejecutables | En Disenio |
| R08 | Publicacion exclusiva via Azure APIM | APIM + todos los microservicios | Configurar APIM con todas las APIs; restringir acceso directo a App Services | App Services no accesibles sin APIM; peticion directa retorna 403 | Planificado |
| R09 | Conexion APIM-backend protegida con certificados | APIM + App Services | Configurar mTLS; cada servicio verifica thumbprint del certificado APIM | Certificado instalado; prueba de rechazo sin certificado | Planificado |
| R10 | Solo APIM puede invocar backends protegidos | App Services | IP restriction + mTLS en cada App Service | Peticion directa desde IP no-APIM retorna 403/SSL error | Planificado |
| R11 | Autenticacion y validacion de tokens | ms-users + APIM | validate-jwt en APIM con JWKS de Google; ms-users emite JWT interno | Token invalido retorna 401; token valido procede | En Disenio |
| R12 | Autorizacion de acciones sobre recursos | ms-users + ms-catalog | Verificar que el userId del JWT coincide con el recurso solicitado | Test que demuestra rechazo de acceso cruzado | Planificado |
| R13 | Gestion de secretos y certificados | Azure Key Vault | Crear Key Vault; configurar Managed Identity por App Service | Sin credenciales en codigo; secretos en Key Vault | Planificado |
| R14 | Microservicio de notificaciones dedicado | ms-notifications | Implementar consumidor de cola + entrega | ms-notifications funcional e independiente | En Disenio |
| R15 | Flujo asincrono: evento -> cola -> notificacion | ms-catalog + Queue + ms-notifications | Publicar eventos en cola; consumir y procesar | Demo funcional del flujo completo | En Disenio |
| R16 | Persistencia de notificaciones | ms-notifications | Azure Table Storage con entidad Notification | Notificaciones visibles en `GET /notificaciones` despues de recibir evento | En Disenio |
| R17 | Notificaciones en tiempo real en web | ms-notifications | SSE con autenticacion navegador/APIM aprobada | Demo en vivo: notificacion aparece en SPA sin reload | En Disenio |
| R18 | Notificaciones push movil | Discrepancia academica | Validar con docente frente al alcance exclusivamente web; no crear app movil/FCM sin esa definicion | Confirmacion docente y criterio revisado | No determinado |
| R19 | Cada microservicio con almacenamiento distinto | ms-users (SQL), ms-catalog (Cosmos), ms-notifications (Table) | Configurar 3 servicios Azure distintos | 3 connection strings diferentes; 3 tipos verificados | En Disenio |
| R20 | Al menos 3 tipos de servicios de datos en Azure | Azure SQL + Cosmos DB + Table Storage | Aprovisionar y conectar 3 tipos | Evidencia de conexion desde cada servicio | Planificado |
| R21 | Codigo fuente de 3 microservicios | ms-users, ms-catalog, ms-notifications | Fundacion implementada; negocio pendiente | Directorios `/app/ms-users`, `/app/ms-catalog`, `/app/ms-notifications` | En Progreso |
| R22 | Documentacion individual por microservicio | ms-users, ms-catalog, ms-notifications | README de fundacion por servicio | 3 archivos README.md | Completado |
| R23 | GitHub Actions por microservicio | CI/CD | 3 workflows CI independientes creados; ejecucion remota pendiente | Archivos `ci-ms-*.yml` | En Progreso |
| R24 | Despliegues independientes en Azure App Services | CI/CD + Azure | Deploy desde main a cada App Service | Badge de estado verde en cada workflow | Planificado |
| R25 | Documentacion APIM | APIM | Configurar portal de desarrollador o exportar definicion | Portal APIM con documentacion de endpoints | Planificado |
| R26 | Swagger/OpenAPI | ms-users + ms-catalog + ms-notifications | Generar OpenAPI desde codigo (springdoc, swagger-ui-express, fastapi auto) | URL `/v3/api-docs` o equivalente accesible | En Disenio |
| R27 | Coleccion Postman exportada en JSON | Todos los servicios | Crear y exportar coleccion con todos los endpoints | Archivo `.json` en repositorio | Planificado |
| R28 | Al menos 1 prueba ejecutable por endpoint en Postman | Todos los servicios | Agregar scripts de test en Postman por cada request | Coleccion ejecutable con `newman`; resultados exportados | Planificado |
| R29 | Demostracion funcional de notificaciones web en tiempo real | ms-notifications + SPA | SSE funcionando; SPA mostrando notificaciones | Grabacion de pantalla del flujo | En Disenio |
| R30 | Demostracion funcional de notificaciones push moviles | Discrepancia academica | Validar con docente; producto confirmado no tiene cliente movil | Confirmacion docente y matriz actualizada | No determinado |
| R31 | Evidencia de 3 tipos de almacenamiento Azure | Azure Storage | Capturas de pantalla + datos en cada servicio | Screenshots de Azure Portal mostrando datos reales | Planificado |
| R32 | Video demostrativo max 5 minutos | Equipo | Grabar demo con flujos principales | Video en formato MP4 o link a YouTube | Planificado |
| R33 | Defensa tecnica con todos los integrantes | Equipo | Preparar asignacion de secciones por integrante | Todos los integrantes responden preguntas tecnicas | Planificado |

---

## Requisitos condicionales — No aplican al equipo de 3 integrantes

Los siguientes requisitos aplican exclusivamente a equipos de 4 o 5 integrantes segun el enunciado academico:

| Requisito | Condicion | Estado |
|---|---|---|
| Requisito especifico para equipo de 4 | Solo para 4 integrantes | No Aplica |
| Requisito especifico para equipo de 5 | Solo para 5 integrantes | No Aplica |

> Si el enunciado especifica requisitos adicionales para equipos de 4 o 5, deben registrarse aqui una vez confirmados. Por ahora, todos los requisitos generales aplican.

---

## Resumen de cumplimiento por categoria

| Categoria | Total | Completados | En Disenio | Planificados | En Progreso | No determinado |
|---|---:|---:|---:|---:|---:|---:|
| Microservicios y APIs | 6 (R01-R05, R07) | 3 | 1 | 1 | 1 | 0 |
| Seguridad | 7 (R06, R08-R13) | 0 | 2 | 5 | 0 | 0 |
| Notificaciones | 5 (R14-R18) | 0 | 4 | 0 | 0 | 1 |
| Almacenamiento | 2 (R19-R20) | 0 | 1 | 1 | 0 | 0 |
| Entregables | 13 (R21-R33) | 1 | 2 | 7 | 2 | 1 |
| **Total** | **33** | **4** | **10** | **14** | **3** | **2** |

---

*Nota: Esta matriz se actualiza a medida que avanza la implementacion.*
