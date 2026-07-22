from __future__ import annotations

from uuid import UUID

from tortoise.exceptions import IntegrityError

from src.common.email.template_renderer import (
    EmailTemplateRenderError,
    EmailTemplateSourceError,
    render_email_template,
    validate_email_html_template,
    validate_email_template_source,
)
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.models.system.email_template import EmailTemplateRecord
from src.modules.system.mail.schema import (
    MailTemplateCreateRequest,
    MailTemplateOut,
    MailTemplatePatchRequest,
    MailTemplatePreviewOut,
    MailTemplatePreviewRequest,
)
from src.modules.system.mail.template_repository import EmailTemplateRepository


class EmailTemplateService:
    def __init__(self, repository: EmailTemplateRepository | None = None) -> None:
        self.repository = repository or EmailTemplateRepository()

    async def list_templates(self) -> list[MailTemplateOut]:
        return [self._out(record) for record in await self.repository.list_records()]

    async def create_template(self, payload: MailTemplateCreateRequest) -> MailTemplateOut:
        self._validate_template_source(payload.subject_template)
        self._validate_html_template(payload.html_template)
        self._validate_template_source(payload.text_template)
        try:
            record = await self.repository.create(data=payload.model_dump())
        except IntegrityError as exc:
            raise Conflict(error="MAIL_TEMPLATE_ALREADY_EXISTS") from exc
        return self._out(record)

    async def update_template(
        self,
        template_id: UUID,
        payload: MailTemplatePatchRequest,
    ) -> MailTemplateOut:
        record = await self._require(template_id)
        changes = payload.model_dump(exclude_unset=True)
        for key in ("subject_template", "html_template", "text_template"):
            value = changes.get(key)
            if isinstance(value, str):
                if key == "html_template":
                    self._validate_html_template(value)
                else:
                    self._validate_template_source(value)
        changes["version"] = record.version + 1
        updated = await self.repository.update_fields(record, fields=changes)
        return self._out(updated)

    async def delete_template(self, template_id: UUID) -> None:
        await self._require(template_id)
        await self.repository.delete(id=template_id)

    def preview(self, payload: MailTemplatePreviewRequest) -> MailTemplatePreviewOut:
        try:
            rendered = render_email_template(
                subject_template=payload.subject_template,
                html_template=payload.html_template,
                text_template=payload.text_template,
                variables=payload.variables,
            )
        except EmailTemplateSourceError as exc:
            raise BadRequest(error=str(exc)) from exc
        except EmailTemplateRenderError as exc:
            raise BadRequest(error="MAIL_TEMPLATE_RENDER_FAILED") from exc
        return MailTemplatePreviewOut(subject=rendered.subject, html=rendered.html, text=rendered.text)

    async def _require(self, template_id: UUID) -> EmailTemplateRecord:
        record = await self.repository.get(template_id)
        if record is None:
            raise NotFound(error="MAIL_TEMPLATE_NOT_FOUND")
        return record

    @classmethod
    def _validate_template_source(cls, source: str) -> None:
        try:
            validate_email_template_source(source)
        except EmailTemplateSourceError as exc:
            raise BadRequest(error="MAIL_TEMPLATE_INVALID") from exc

    @classmethod
    def _validate_html_template(cls, source: str) -> None:
        try:
            validate_email_html_template(source)
        except EmailTemplateSourceError as exc:
            raise BadRequest(error=str(exc)) from exc

    @staticmethod
    def _out(record: EmailTemplateRecord) -> MailTemplateOut:
        variables = record.variables if isinstance(record.variables, list) else []
        return MailTemplateOut(
            id=record.id,
            key=record.key,
            locale=record.locale,
            name=record.name,
            description=record.description,
            subject_template=record.subject_template,
            html_template=record.html_template,
            text_template=record.text_template,
            variables=[str(value) for value in variables],
            is_enabled=record.is_enabled,
            version=record.version,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )
