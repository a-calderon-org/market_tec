import asyncio

from httpx import ASGITransport, AsyncClient

from markettec_notifications.config.settings import Settings
from markettec_notifications.main import create_app


app_under_test = create_app(
    Settings(service_name="ms-notifications", port=8000, log_level="CRITICAL")
)


async def request(path: str, headers: dict[str, str] | None = None):
    transport = ASGITransport(app=app_under_test)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path, headers=headers)


def test_application_imports() -> None:
    from markettec_notifications.main import app

    assert app.title == "MarketTec Notifications API"


def test_health_returns_epoch_and_propagates_correlation_id() -> None:
    response = asyncio.run(
        request("/health", headers={"X-Correlation-ID": "notifications-test"})
    )

    assert response.status_code == 200
    assert response.headers["X-Correlation-ID"] == "notifications-test"
    body = response.json()
    assert body["status"] == "UP"
    assert body["service"] == "ms-notifications"
    assert isinstance(body["timestamp"], int)
    assert body["correlationId"] == "notifications-test"


def test_unknown_route_returns_standard_error() -> None:
    response = asyncio.run(request("/does-not-exist"))

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "ROUTE_NOT_FOUND"
    assert response.json()["error"]["message"] == "The requested route does not exist."
    assert response.json()["error"]["correlationId"] == response.headers["X-Correlation-ID"]
