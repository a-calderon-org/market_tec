# ms-notifications

Fundacion ejecutable del servicio de notificaciones web de MarketTec. Usa Python 3.12 y FastAPI. No consume colas, no persiste notificaciones y no implementa SSE todavia.

## Requisitos y ejecucion

```bash
cd app/ms-notifications
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install --requirement requirements-dev.lock
python -m pip install --no-deps -e .
PORT=8000 SERVICE_NAME=ms-notifications uvicorn markettec_notifications.main:app --reload
curl -i http://localhost:8000/health
```

Pruebas:

```bash
python -m pytest
```

`requirements-dev.lock` fija tambien las dependencias transitivas usadas por desarrollo y CI. Debe regenerarse de forma deliberada cuando cambien las dependencias de `pyproject.toml`.

La documentacion OpenAPI tecnica queda disponible en `/docs` y `/openapi.json`.

## Arquitectura implementada

El router FastAPI de salud es un adaptador de entrada que invoca el protocolo `GetHealthQuery`; `GetHealthService` implementa el puerto y devuelve la dataclass pura `ServiceHealth`. `config/container.py` realiza la composicion.

Las rutas de negocio futuras usarán `/v1`. Azure Queue, Table Storage y el canal SSE se incorporarán mediante adaptadores cuando existan sus casos de uso. Antes de SSE debe resolverse una autenticacion web compatible con `EventSource` y APIM, sin tokens permanentes en URL. Se propaga o genera `X-Correlation-ID`, los logs HTTP son JSON y los timestamps son Epoch seconds.
