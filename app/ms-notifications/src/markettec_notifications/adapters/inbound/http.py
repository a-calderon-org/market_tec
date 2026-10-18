import json
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import asdict
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from markettec_notifications.application.ports.get_health_query import GetHealthQuery

CORRELATION_HEADER = "X-Correlation-ID"
LOGGER = logging.getLogger("markettec_notifications.http")


def create_health_router(get_health_query: GetHealthQuery) -> APIRouter:
    router = APIRouter()

    @router.get("/health", tags=["technical"])
    async def health(request: Request) -> dict[str, Any]:
        return {
            **asdict(get_health_query.get_health()),
            "correlationId": request.state.correlation_id,
        }

    return router


def configure_http_conventions(app: FastAPI, service_name: str) -> None:
    @app.middleware("http")
    async def correlation_and_logging(
        request: Request,
        call_next: Callable[[Request], Awaitable[Any]],
    ) -> Any:
        candidate = request.headers.get(CORRELATION_HEADER, "").strip()
        correlation_id = candidate if candidate and len(candidate) <= 128 else str(uuid4())
        request.state.correlation_id = correlation_id
        started_at = time.perf_counter()
        response = await call_next(request)
        response.headers[CORRELATION_HEADER] = correlation_id
        LOGGER.info(
            json.dumps(
                {
                    "level": "info",
                    "event": "request_completed",
                    "service": service_name,
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "durationMs": round((time.perf_counter() - started_at) * 1000, 3),
                    "correlationId": correlation_id,
                    "timestamp": int(time.time()),
                }
            )
        )
        return response

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exception: HTTPException) -> JSONResponse:
        code = "ROUTE_NOT_FOUND" if exception.status_code == 404 else "HTTP_ERROR"
        message = (
            "The requested route does not exist."
            if exception.status_code == 404
            else str(exception.detail)
        )
        return JSONResponse(
            status_code=exception.status_code,
            content=_error_body(request, code, message),
        )

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exception: Exception) -> JSONResponse:
        LOGGER.error(
            json.dumps(
                {
                    "level": "error",
                    "event": "request_failed",
                    "service": service_name,
                    "correlationId": getattr(request.state, "correlation_id", None),
                    "errorType": type(exception).__name__,
                    "timestamp": int(time.time()),
                }
            )
        )
        return JSONResponse(
            status_code=500,
            content=_error_body(
                request,
                "INTERNAL_ERROR",
                "The service could not process the request.",
            ),
        )


def _error_body(request: Request, code: str, message: str) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": [],
            "correlationId": getattr(request.state, "correlation_id", str(uuid4())),
            "timestamp": int(time.time()),
        }
    }
