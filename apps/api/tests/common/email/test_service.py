from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, cast

import pytest

from src.common.email.provider import EmailMessage, SendResult
from src.common.email.service import EmailService
from src.common.email.template_renderer import (
    EmailTemplateRenderError,
    EmailTemplateSourceError,
    RenderedEmailTemplate,
)
from src.common.email.template_runtime import (
    EmailTemplateDisabledError,
    EmailTemplateNotFoundError,
    EmailTemplateRuntime,
)
from src.common.types.json_types import JsonObject
from src.config import Settings


@dataclass(frozen=True)
class _TemplateRecord:
    subject_template: str
    html_template: str
    text_template: str
    is_enabled: bool = True


class _TemplateReader:
    def __init__(self, records: dict[tuple[str, str], _TemplateRecord]) -> None:
        self.records = records
        self.requests: list[tuple[str, str]] = []

    async def get_by_identity(self, *, key: str, locale: str) -> _TemplateRecord | None:
        self.requests.append((key, locale))
        return self.records.get((key, locale))


class _RecordingTemplateRuntime:
    def __init__(self) -> None:
        self.requests: list[tuple[str, str | None, JsonObject]] = []

    async def render(
        self,
        *,
        key: str,
        locale: str | None,
        variables: JsonObject,
    ) -> RenderedEmailTemplate:
        self.requests.append((key, locale, dict(variables)))
        return RenderedEmailTemplate(
            subject=f"Rendered {key}",
            html=f"<p>Rendered {key}</p>",
            text=f"Rendered {key}",
        )


class _RaisingTemplateRuntime:
    def __init__(self, error: Exception) -> None:
        self.error = error

    async def render(
        self,
        *,
        key: str,
        locale: str | None,
        variables: JsonObject,
    ) -> RenderedEmailTemplate:
        _ = key
        _ = locale
        _ = variables
        raise self.error


class _CapturingEmailService(EmailService):
    def __init__(self, settings: Settings, template_runtime: EmailTemplateRuntime) -> None:
        super().__init__(settings, template_runtime=template_runtime)
        self.sent_messages: list[EmailMessage] = []

    async def _enabled(self) -> bool:
        return True

    async def _send(self, message: EmailMessage) -> SendResult:
        self.sent_messages.append(message)
        return SendResult(success=True, provider_id="test")


@pytest.mark.asyncio
async def test_service_sends_content_rendered_from_persisted_template() -> None:
    reader = _TemplateReader({
        ("welcome", "en-US"): _TemplateRecord(
            subject_template="Welcome {{ username }}",
            html_template="<p>Hello {{ username }}</p>",
            text_template="Hello {{ username }}",
        )
    })
    service = _CapturingEmailService(Settings(), EmailTemplateRuntime(reader))

    await service.send_welcome(
        recipient="philip@example.com",
        username="Philip",
        locale="en_US",
    )

    assert reader.requests == [("welcome", "en-US")]
    assert service.sent_messages == [
        EmailMessage.single(
            recipient="philip@example.com",
            subject="Welcome Philip",
            html_body="<p>Hello Philip</p>",
            text_body="Hello Philip",
            template_id="welcome",
        )
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method_name", "kwargs", "expected_key", "expected_variables"),
    [
        (
            "send_reset_password",
            {"reset_token": "reset-token", "expires_in": 900},
            "reset_password",
            {
                "reset_url": "https://app.example.com/reset-password?token=reset-token",
                "reset_token": "reset-token",
                "expires_in": 900,
            },
        ),
        (
            "send_welcome",
            {"username": "Philip"},
            "welcome",
            {"username": "Philip"},
        ),
        (
            "send_email_change_code",
            {"code": "123456", "expires_in": 600},
            "email_change_code",
            {"code": "123456", "expires_in": 600},
        ),
        (
            "send_registration_verification",
            {"verification_token": "verify-token", "expires_in": 1200},
            "registration_verification",
            {
                "verification_url": ("https://app.example.com/login?mode=register&verify_token=verify-token"),
                "verification_token": "verify-token",
                "expires_in": 1200,
            },
        ),
        (
            "send_login_code",
            {"code": "654321", "expires_in": 300},
            "login_code",
            {"code": "654321", "expires_in": 300},
        ),
        (
            "send_security_alert",
            {
                "title": "New login",
                "intro": "A new session was created.",
                "event_label": "Login",
                "ip_address": "203.0.113.4",
                "user_agent": "Test Browser",
                "occurred_at": datetime(2026, 7, 22, 8, 30, tzinfo=UTC),
            },
            "security_alert",
            {
                "title": "New login",
                "intro": "A new session was created.",
                "event_label": "Login",
                "occurred_at": "2026-07-22T08:30:00+00:00",
                "ip_address": "203.0.113.4",
                "user_agent": "Test Browser",
            },
        ),
        (
            "send_invitation",
            {
                "invite_url": "https://app.example.com/invitations/token",
                "invite_token": "invite-token",
                "expires_at": None,
                "organization_name": "Arclayer",
            },
            "invitation",
            {
                "organization_name": "Arclayer",
                "invite_url": "https://app.example.com/invitations/token",
                "invite_token": "invite-token",
                "expires_at": "",
            },
        ),
        (
            "send_workspace_invitation",
            {
                "invite_url": "https://app.example.com/invitations/workspace-token",
                "invite_token": "workspace-token",
                "expires_at": datetime(2026, 7, 30, tzinfo=UTC),
                "workspace_name": "Website",
                "inviter_name": "Philip",
            },
            "workspace_invitation",
            {
                "workspace_name": "Website",
                "inviter_name": "Philip",
                "invite_url": "https://app.example.com/invitations/workspace-token",
                "invite_token": "workspace-token",
                "expires_at": "2026-07-30T00:00:00+00:00",
            },
        ),
        ("send_test_email", {}, "test", {}),
        (
            "send_notification",
            {
                "title": "Maintenance window",
                "body": "The system will restart at 02:00 UTC.",
                "action_to": "/system/overview",
                "action_label": "View status",
            },
            "notification",
            {
                "title": "Maintenance window",
                "body": "The system will restart at 02:00 UTC.",
                "action_to": "/system/overview",
                "action_label": "View status",
            },
        ),
    ],
)
async def test_service_uses_persisted_template_for_every_email_type(
    method_name: str,
    kwargs: dict[str, Any],
    expected_key: str,
    expected_variables: JsonObject,
) -> None:
    settings = Settings()
    settings.application.frontend_base_url = "https://app.example.com/"
    runtime = _RecordingTemplateRuntime()
    service = _CapturingEmailService(settings, cast(EmailTemplateRuntime, runtime))

    method = getattr(service, method_name)
    await method(recipient="philip@example.com", locale="en_US", **kwargs)

    assert runtime.requests == [(expected_key, "en_US", expected_variables)]
    assert service.sent_messages[0].template_id == expected_key
    assert service.sent_messages[0].html_body == f"<p>Rendered {expected_key}</p>"
    assert service.sent_messages[0].text_body == f"Rendered {expected_key}"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "error",
    [
        EmailTemplateNotFoundError("MAIL_TEMPLATE_NOT_FOUND:welcome:en-US"),
        EmailTemplateDisabledError("MAIL_TEMPLATE_DISABLED:welcome:en-US"),
        EmailTemplateSourceError("MAIL_TEMPLATE_INVALID"),
        EmailTemplateRenderError("MAIL_TEMPLATE_RENDER_FAILED"),
    ],
)
async def test_service_does_not_swallow_template_errors(error: Exception) -> None:
    runtime = cast(EmailTemplateRuntime, _RaisingTemplateRuntime(error))
    service = _CapturingEmailService(Settings(), runtime)

    with pytest.raises(type(error), match=str(error)):
        await service.send_welcome(
            recipient="philip@example.com",
            username="Philip",
            locale="en-US",
        )

    assert service.sent_messages == []
