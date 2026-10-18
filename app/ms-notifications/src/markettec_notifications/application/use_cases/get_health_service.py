from collections.abc import Callable

from markettec_notifications.domain.service_health import ServiceHealth


class GetHealthService:
    def __init__(self, service_name: str, clock: Callable[[], int]) -> None:
        self._service_name = service_name
        self._clock = clock

    def get_health(self) -> ServiceHealth:
        return ServiceHealth(
            status="UP",
            service=self._service_name,
            timestamp=self._clock(),
        )
