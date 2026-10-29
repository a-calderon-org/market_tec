# Fundacion implementada de microservicios — Fase II, Etapa B

**Estado:** Verificado localmente
**Fecha:** 2026-10-18
**Alcance:** Fundacion tecnica; sin funcionalidades de negocio ni recursos Azure

## Resultado real

Se crearon tres proyectos independientes y se conservo `app/backend` sin modificaciones destructivas:

| Servicio | Stack fijado | Puerto predeterminado | Health real | Verificacion local |
|---|---|---:|---|---|
| `app/ms-users` | Java 21, Spring Boot 3.5.16, Maven 3.9.11 | 8080 | `GET /health` | JDK 24 local, `release 21`: 8 pruebas |
| `app/ms-catalog` | Node.js 24, TypeScript 7.0.2, Express 5.3.0 | 3000 | `GET /health` | Node 24.21 local: typecheck, build y 2 pruebas HTTP |
| `app/ms-notifications` | Python 3.12 objetivo, FastAPI 0.144.0, Uvicorn 0.54.0 | 8000 | `GET /health` | Python 3.15 local: 3 pruebas HTTP/importacion sin advertencias |

El host no tiene JDK 21 ni Python 3.12. Maven compilo con JDK 24 usando `release 21`; TypeScript y las pruebas Node se ejecutaron con Node 24.21 ya disponible mediante NVM; Python se probo con 3.15. Los workflows apuntan explicitamente a JDK 21, Node 24 y Python 3.12, pero no fueron ejecutados desde esta sesion. Se comprobo ademas que todas las ruedas fijadas para Python estan disponibles para CPython 3.12/Linux, aunque ese runtime no pudo ejecutarse localmente. La advertencia de deprecacion de `fastapi.testclient` respecto a la migracion de Starlette desde `httpx` hacia `httpx2` se elimino usando directamente `httpx.AsyncClient` con transporte ASGI; pytest vuelve a pasar con las advertencias tratadas como errores.

Ademas de las suites, los tres procesos se arrancaron y consultaron por HTTP real en sus puertos predeterminados; todos devolvieron `status: UP` y propagaron el correlation ID enviado.

## Hexagono minimo real

El unico comportamiento implementado es consultar el estado tecnico. En los tres servicios sigue el mismo flujo:

```text
adaptador HTTP -> puerto GetHealthQuery -> caso de uso GetHealthService -> ServiceHealth
```

- El modelo `ServiceHealth` no depende de Spring, Express ni FastAPI.
- La composicion ocurre en `config/`.
- No existen puertos de salida ni adaptadores Azure vacios. Se agregaran cuando haya un caso de uso que los consuma.
- `ms-users` incluye ArchUnit para impedir dependencias salientes desde dominio y aplicacion, imports de Spring/Jakarta en esas capas y ciclos entre paquetes superiores.

## Convenciones tecnicas implementadas

- Health uniforme: `GET /health`, sin prefijo de version por ser endpoint tecnico.
- Rutas de negocio futuras: `/v1`, aun no implementadas.
- `X-Correlation-ID`: se conserva si es no vacio y tiene hasta 128 caracteres; de lo contrario se genera UUID.
- El correlation ID se devuelve tanto en header como en la respuesta health/error.
- Logs HTTP basicos estructurados: pares clave/valor en Spring y JSON en Node/Python.
- Timestamps tecnicos: entero Epoch Unix en segundos. Esto implementa la convencion solicitada para la fundacion, sin convertir ADR-003 (`Proposed`) en una decision aceptada para todos los contratos futuros.
- Errores HTTP: envelope `error` con `code`, `message`, `details`, `correlationId` y `timestamp`.
- Configuracion sin secretos: `PORT`, `SERVICE_NAME` y `LOG_LEVEL` donde aplica; cada servicio incluye `.env.example`.
- `ms-catalog` valida y respeta `LOG_LEVEL`; los logs de error de Node/Python registran el tipo, no el mensaje potencialmente sensible de la excepcion.

## Ejecucion

```bash
cd app/ms-users && ./mvnw spring-boot:run
cd app/ms-catalog && npm ci && npm run dev
cd app/ms-notifications && python3.12 -m venv .venv && source .venv/bin/activate
python -m pip install -r requirements-dev.lock && python -m pip install --no-deps -e .
uvicorn markettec_notifications.main:app --reload
```

Los comandos detallados y pruebas estan en el README de cada servicio.

## Integracion continua

Se agregaron workflows de CI con filtros por ruta:

- `.github/workflows/ci-ms-users.yml`: JDK 21 y `./mvnw verify`.
- `.github/workflows/ci-ms-catalog.yml`: Node desde `.nvmrc`, filtro que tambien observa ese archivo, `npm ci` y `npm run check`.
- `.github/workflows/ci-ms-notifications.yml`: Python 3.12, dependencias transitivas fijadas en `requirements-dev.lock`, instalacion editable sin resolver nuevamente, importacion y pytest.

No contienen pasos de despliegue ni alteran el workflow existente de Angular.

## Extensiones futuras y decisiones pendientes

- `ms-users`: puertos de persistencia, verificacion Google y emision JWT solo despues de validar el flujo `Google ID Token -> ms-users -> JWT interno -> APIM -> microservicios`.
- `ms-catalog`: puertos Cosmos DB, Blob Storage y publicacion en Queue al implementar casos de uso reales.
- `ms-notifications`: puertos Queue/Table y entrega SSE. Antes de SSE debe definirse autenticacion compatible con `EventSource`, navegador y APIM; no se aceptan tokens permanentes en URL.
- SQL Database frente a PostgreSQL para `ms-users` sigue **No determinado**.
- ADR-001 fue **Accepted** el 2026-10-29; ADR-002 y ADR-003 continúan `Proposed`.
- `app/backend` se conserva hasta resolver ADR-002.
- La aplicacion es exclusivamente web. El requisito academico de push movil/FCM queda como discrepancia pendiente de validacion docente; esta etapa no crea app movil, registro de dispositivos ni FCM.

## Relacion con Jira

La fundacion justifica proponer tres tickets de entrega independientes: fundacion de `ms-users`, `ms-catalog` y `ms-notifications`. Tambien deben proponerse tickets posteriores separados para identidad/JWT, cada almacenamiento, Queue, Blob, APIM/mTLS, OpenAPI de negocio y autenticacion de SSE. No se creo ni modifico ningun ticket.

La etapa no resuelve MTEC-9, MTEC-10, MTEC-12, MTEC-13, MTEC-14, MTEC-15 ni MTEC-18; solo reduce el trabajo previo para MTEC-15 y MTEC-18.
