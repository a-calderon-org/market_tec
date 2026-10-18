import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Settings:
    service_name: str
    port: int
    log_level: str

    @classmethod
    def from_environment(cls) -> "Settings":
        port = int(os.getenv("PORT", "8000"))
        if not 1 <= port <= 65_535:
            raise ValueError("PORT must be between 1 and 65535")
        return cls(
            service_name=os.getenv("SERVICE_NAME", "ms-notifications"),
            port=port,
            log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        )
