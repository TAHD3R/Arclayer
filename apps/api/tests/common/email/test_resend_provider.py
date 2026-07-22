from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from src.common.email.connector import EmailConnector
from src.common.email.provider import EmailMessage
from src.config import Settings
from src.core.extensions.manager import ExtensionManager


@pytest.mark.asyncio
async def test_resend_connector_posts_expected_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "email_123"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(httpx, "AsyncClient", lambda **_kwargs: client)

    project_root = Path(__file__).resolve().parents[5]
    manager = ExtensionManager(project_root)
    await manager.load_extension(project_root / "plugins" / "arclayer-email")
    await manager.register_all(app=None)
    registration = manager.registry.connectors.resolve("email.resend")
    assert registration is not None
    connector = registration.factory()
    assert isinstance(connector, EmailConnector)
    provider = connector.create_provider(
        settings=Settings(),
        config={
            "providers": {
                "resend": {
                    "api_key": "re_test",
                    "mail_from": "noreply@example.com",
                    "mail_from_name": "Arclayer",
                }
            }
        },
    )

    result = await provider.send(
        EmailMessage.single(
            recipient="to@example.com",
            subject="Hello",
            html_body="<p>Hello</p>",
            text_body="Hello",
        )
    )

    assert result.provider_id == "resend"
    assert result.message_id == "email_123"
    assert requests[0].headers["authorization"] == "Bearer re_test"
    assert requests[0].read().decode()
    payload = requests[0].content.decode()
    assert '"from":"Arclayer <noreply@example.com>"' in payload
    assert '"to":["to@example.com"]' in payload
