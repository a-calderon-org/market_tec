from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ServiceHealth:
    status: str
    service: str
    timestamp: int
