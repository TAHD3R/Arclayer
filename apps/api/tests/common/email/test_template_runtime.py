from __future__ import annotations

from dataclasses import dataclass

import pytest

from src.common.email.template_renderer import EmailTemplateRenderError
from src.common.email.template_runtime import (
    EmailTemplateDisabledError,
    EmailTemplateNotFoundError,
    EmailTemplateRuntime,
)


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
        self.version_requests: list[tuple[str, str, int]] = []

    async def get_by_identity(self, *, key: str, locale: str) -> _TemplateRecord | None:
        self.requests.append((key, locale))
        return self.records.get((key, locale))

    async def get_by_version(self, *, key: str, locale: str, version: int) -> _TemplateRecord | None:
        self.version_requests.append((key, locale, version))
        return self.records.get((f"{key}@{version}", locale))


@pytest.mark.asyncio
async def test_runtime_renders_exact_normalized_locale_and_escapes_html() -> None:
    reader = _TemplateReader({
        ("welcome", "en-US"): _TemplateRecord(
            subject_template="Welcome {{ username }}",
            html_template="<p>{{ username }}</p>",
            text_template="Welcome {{ username }}",
        )
    })

    rendered = await EmailTemplateRuntime(reader).render(
        key="welcome",
        locale="en_US",
        variables={"username": "<Philip>"},
    )

    assert reader.requests == [("welcome", "en-US")]
    assert rendered.subject == "Welcome <Philip>"
    assert rendered.html == "<p>&lt;Philip&gt;</p>"
    assert rendered.text == "Welcome <Philip>"


@pytest.mark.asyncio
async def test_runtime_exposes_missing_and_disabled_templates() -> None:
    reader = _TemplateReader({
        ("welcome", "zh-CN"): _TemplateRecord(
            subject_template="欢迎",
            html_template="<p>欢迎</p>",
            text_template="欢迎",
            is_enabled=False,
        )
    })
    runtime = EmailTemplateRuntime(reader)

    with pytest.raises(EmailTemplateDisabledError, match="MAIL_TEMPLATE_DISABLED:welcome:zh-CN"):
        await runtime.render(key="welcome", locale="zh-CN", variables={})
    with pytest.raises(EmailTemplateNotFoundError, match="MAIL_TEMPLATE_NOT_FOUND:login_code:zh-CN"):
        await runtime.render(key="login_code", locale=None, variables={})


@pytest.mark.asyncio
async def test_runtime_exposes_missing_template_variables() -> None:
    reader = _TemplateReader({
        ("welcome", "zh-CN"): _TemplateRecord(
            subject_template="欢迎 {{ username }}",
            html_template="<p>{{ username }}</p>",
            text_template="欢迎 {{ username }}",
        )
    })

    with pytest.raises(EmailTemplateRenderError, match="MAIL_TEMPLATE_RENDER_FAILED"):
        await EmailTemplateRuntime(reader).render(key="welcome", locale="zh-CN", variables={})


@pytest.mark.asyncio
async def test_runtime_renders_the_exact_requested_template_version() -> None:
    reader = _TemplateReader({
        ("announcement@3", "zh-CN"): _TemplateRecord(
            subject_template="版本 {{ version }}",
            html_template="<p>版本 {{ version }}</p>",
            text_template="版本 {{ version }}",
        )
    })

    rendered = await EmailTemplateRuntime(reader).render_version(
        key="announcement",
        locale="zh-CN",
        version=3,
        variables={"version": "3"},
    )

    assert reader.version_requests == [("announcement", "zh-CN", 3)]
    assert rendered.subject == "版本 3"
