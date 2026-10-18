from typing import Protocol

from markettec_notifications.domain.service_health import ServiceHealth


class GetHealthQuery(Protocol):
    def get_health(self) -> ServiceHealth:
        """Return the current technical service health."""
