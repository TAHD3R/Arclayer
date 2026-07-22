from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from src.models.system.email_template import EmailTemplateRecord
from src.modules.system.mail.template_defaults import (
    DEFAULT_EMAIL_TEMPLATES,
    ensure_default_email_templates,
)


def test_default_templates_cover_every_runtime_key_in_both_locales() -> None:
    identities = {(template.key, template.locale) for template in DEFAULT_EMAIL_TEMPLATES}
    expected_keys = {
        "reset_password",
        "welcome",
        "email_change_code",
        "registration_verification",
        "login_code",
        "security_alert",
        "invitation",
        "workspace_invitation",
        "test",
        "notification",
    }

    assert len(identities) == len(DEFAULT_EMAIL_TEMPLATES)
    assert {key for key, _locale in identities} == expected_keys
    assert {locale for _key, locale in identities} == {"zh-CN", "en-US"}


@pytest.mark.asyncio
async def test_default_template_sync_only_uses_get_or_create(monkeypatch: pytest.MonkeyPatch) -> None:
    get_or_create = AsyncMock(return_value=(object(), True))
    monkeypatch.setattr(EmailTemplateRecord, "get_or_create", get_or_create)

    await ensure_default_email_templates()

    assert get_or_create.await_count == len(DEFAULT_EMAIL_TEMPLATES)
    first_call = get_or_create.await_args_list[0]
    assert first_call.kwargs["key"] == "reset_password"
    assert first_call.kwargs["locale"] == "zh-CN"
    assert first_call.kwargs["defaults"]["version"] == 1
