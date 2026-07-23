from __future__ import annotations

from typing import Protocol

from src.common.email.template_renderer import RenderedEmailTemplate, render_email_template
from src.common.types.json_types import JsonObject
from src.core.i18n import get_request_locale
from src.models.system.email_template import EmailTemplateRecord, EmailTemplateRevisionRecord


class EmailTemplateNotFoundError(RuntimeError):
    pass


class EmailTemplateDisabledError(RuntimeError):
    pass


class EmailTemplateRecordView(Protocol):
    subject_template: str
    html_template: str
    text_template: str
    is_enabled: bool


class EmailTemplateReader(Protocol):
    async def get_by_identity(self, *, key: str, locale: str) -> EmailTemplateRecordView | None: ...

    async def get_by_version(
        self,
        *,
        key: str,
        locale: str,
        version: int,
    ) -> EmailTemplateRecordView | None: ...


class OrmEmailTemplateReader:
    async def get_by_identity(self, *, key: str, locale: str) -> EmailTemplateRecord | None:
        return await EmailTemplateRecord.filter(key=key, locale=locale).first()

    async def get_by_version(
        self,
        *,
        key: str,
        locale: str,
        version: int,
    ) -> EmailTemplateRecord | EmailTemplateRevisionRecord | None:
        revision = await EmailTemplateRevisionRecord.filter(key=key, locale=locale, version=version).first()
        if revision is not None:
            return revision
        return await EmailTemplateRecord.filter(key=key, locale=locale, version=version).first()


class EmailTemplateRuntime:
    def __init__(self, reader: EmailTemplateReader | None = None) -> None:
        self.reader = reader or OrmEmailTemplateReader()

    async def render(
        self,
        *,
        key: str,
        locale: str | None,
        variables: JsonObject,
    ) -> RenderedEmailTemplate:
        normalized_locale = get_request_locale(None, default_locale=locale)
        record = await self.reader.get_by_identity(key=key, locale=normalized_locale)
        if record is None:
            raise EmailTemplateNotFoundError(f"MAIL_TEMPLATE_NOT_FOUND:{key}:{normalized_locale}")
        if not record.is_enabled:
            raise EmailTemplateDisabledError(f"MAIL_TEMPLATE_DISABLED:{key}:{normalized_locale}")
        return render_email_template(
            subject_template=record.subject_template,
            html_template=record.html_template,
            text_template=record.text_template,
            variables=variables,
        )

    async def render_version(
        self,
        *,
        key: str,
        locale: str,
        version: int,
        variables: JsonObject,
    ) -> RenderedEmailTemplate:
        record = await self.reader.get_by_version(key=key, locale=locale, version=version)
        if record is None:
            raise EmailTemplateNotFoundError(f"MAIL_TEMPLATE_VERSION_NOT_FOUND:{key}:{locale}:{version}")
        if not record.is_enabled:
            raise EmailTemplateDisabledError(f"MAIL_TEMPLATE_VERSION_DISABLED:{key}:{locale}:{version}")
        return render_email_template(
            subject_template=record.subject_template,
            html_template=record.html_template,
            text_template=record.text_template,
            variables=variables,
        )
