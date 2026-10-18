import logging

from fastapi import FastAPI

from markettec_notifications.adapters.inbound.http import (
    configure_http_conventions,
    create_health_router,
)
from markettec_notifications.config.container import create_container
from markettec_notifications.config.settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or Settings.from_environment()
    logging.basicConfig(level=resolved_settings.log_level, format="%(message)s")
    container = create_container(resolved_settings)

    app = FastAPI(
        title="MarketTec Notifications API",
        version="0.1.0",
        description="Technical foundation only; no notification business endpoints yet.",
    )
    configure_http_conventions(app, resolved_settings.service_name)
    app.include_router(create_health_router(container.get_health_query))
    return app


app = create_app()
