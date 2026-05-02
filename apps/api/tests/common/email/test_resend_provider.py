from __future__ import annotations

import httpx
import pytest

from src.common.email.provider import EmailMessage
from src.common.email.providers.resend import ResendEmailProvider
from src.config import Settings


@pytest.mark.asyncio
async def test_resend_provider_posts_expected_payload() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "email_123"})

    def client_factory() -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(handler))

    provider = ResendEmailProvider(
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
        http_client_factory=client_factory,
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
