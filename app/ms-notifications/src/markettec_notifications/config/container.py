import time
from dataclasses import dataclass

from markettec_notifications.application.ports.get_health_query import GetHealthQuery
from markettec_notifications.application.use_cases.get_health_service import GetHealthService
from markettec_notifications.config.settings import Settings


@dataclass(frozen=True, slots=True)
class Container:
    get_health_query: GetHealthQuery


def create_container(settings: Settings) -> Container:
    return Container(
        get_health_query=GetHealthService(settings.service_name, lambda: int(time.time()))
    )
