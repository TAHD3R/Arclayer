from __future__ import annotations

from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.common.email.errors import raise_mail_delivery_error
from src.common.email.helpers import raise_if_fatal
from src.common.email.template_renderer import (
    EmailTemplateRenderError,
    EmailTemplateSourceError,
    render_email_template,
    validate_email_html_template,
    validate_email_template_source,
)
from src.common.email.template_runtime import (
    EmailTemplateDisabledError,
    EmailTemplateNotFoundError,
)
from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound, ServiceUnavailable
from src.core.http.pagination import PageData, PageParams, paginate_items
from src.core.services import BaseService
from src.models.system.email_template import EmailTemplateRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.system.mail.schema import (
    MailTemplateCategory,
    MailTemplateCreateRequest,
    MailTemplateGroupOut,
    MailTemplateOut,
    MailTemplateOwner,
    MailTemplatePatchRequest,
    MailTemplatePreviewOut,
    MailTemplatePreviewRequest,
    MailTemplateRevisionDetailOut,
    MailTemplateRevisionOut,
    MailTemplateSourceState,
    MailTemplateTestSendOut,
    MailTemplateTestSendRequest,
)
from src.modules.system.mail.template_contracts import (
    ActivityWriter,
    EmailTemplateRepositoryProtocol,
    EmailTemplateSender,
)
from src.modules.system.mail.template_projection import (
    build_template_groups,
    filter_template_groups,
    get_default_email_template,
    is_builtin_template_key,
    is_required_template_key,
    sort_template_groups,
)
from src.modules.system.mail.template_revision_service import (
    EMAIL_TEMPLATE_SNAPSHOT_FIELDS,
    EmailTemplateRevisionService,
    string_list,
)


class EmailTemplateService(BaseService):
    def __init__(
        self,
        repository: EmailTemplateRepositoryProtocol,
        *,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
        email_sender: EmailTemplateSender | None = None,
    ) -> None:
        super().__init__(settings)
        self.repository = repository
        self._activity_writer = activity_writer
        self._email_sender = email_sender
        self._revisions = EmailTemplateRevisionService(
            repository,
            settings=self.settings,
            activity_writer=activity_writer,
        )

    async def list_templates(
        self,
        *,
        params: PageParams,
        display_locale: str,
        q: str | None = None,
        ordering: str | None = None,
        category: MailTemplateCategory | None = None,
        owner: MailTemplateOwner | None = None,
        locale: str | None = None,
        enabled: bool | None = None,
        validation_state: str | None = None,
        source_state: MailTemplateSourceState | None = None,
    ) -> PageData[MailTemplateGroupOut]:
        groups = build_template_groups(
            await self.repository.list_records(),
            display_locale=display_locale,
        )
        filtered = filter_template_groups(
            groups,
            q=q,
            category=category,
            owner=owner,
            locale=locale,
            enabled=enabled,
            validation_state=validation_state,
            source_state=source_state,
        )
        return paginate_items(sort_template_groups(filtered, ordering), params=params)

    async def get_template(self, template_id: UUID) -> MailTemplateOut:
        return self._out(await self._require(template_id))

    async def create_template(self, payload: MailTemplateCreateRequest) -> MailTemplateOut:
        self._ensure_runtime_policy(key=payload.key, is_enabled=payload.is_enabled)
        self._validate_template_source(payload.subject_template)
        self._validate_html_template(payload.html_template)
        self._validate_template_source(payload.text_template)
        async with self.repository.transaction() as conn:
            try:
                record = await self.repository.create(data=payload.model_dump(), conn=conn)
            except IntegrityError as exc:
                raise Conflict(error="MAIL_TEMPLATE_ALREADY_EXISTS") from exc
            await self._revisions.record(
                record,
                action="created",
                changed_fields=list(EMAIL_TEMPLATE_SNAPSHOT_FIELDS),
                actor_user_id=self.resolve_actor_context().actor_user_id,
                conn=conn,
            )
        return self._out(record)

    async def update_template(
        self,
        template_id: UUID,
        payload: MailTemplatePatchRequest,
    ) -> MailTemplateOut:
        changes = payload.model_dump(exclude_unset=True, exclude={"expected_version"})
        self._validate_changes(changes)
        async with self.repository.transaction() as conn:
            record = await self._require(template_id, conn=conn, for_update=True)
            self._ensure_expected_version(record, payload.expected_version)
            self._ensure_runtime_policy(key=record.key, is_enabled=changes.get("is_enabled"))
            changed_fields = self._changed_fields(record, changes)
            changes["version"] = record.version + 1
            updated = await self.repository.update_fields(record, fields=changes, conn=conn)
            await self._revisions.record(
                updated,
                action="updated",
                changed_fields=changed_fields,
                actor_user_id=self.resolve_actor_context().actor_user_id,
                conn=conn,
            )
        return self._out(updated)

    async def delete_template(self, template_id: UUID, *, expected_version: int) -> None:
        async with self.repository.transaction() as conn:
            record = await self._require(template_id, conn=conn, for_update=True)
            self._ensure_expected_version(record, expected_version)
            if is_builtin_template_key(record.key):
                raise Conflict(error="MAIL_TEMPLATE_BUILTIN_DELETE_FORBIDDEN")
            reference_count = await self.repository.count_active_references(
                key=record.key,
                locale=record.locale,
            )
            if reference_count:
                raise Conflict(
                    error="MAIL_TEMPLATE_IN_USE",
                    meta={"referenceCount": reference_count},
                )
            record = await self.repository.update_fields(
                record,
                fields={"version": record.version + 1},
                conn=conn,
            )
            await self._revisions.record(
                record,
                action="deleted",
                changed_fields=[],
                actor_user_id=self.resolve_actor_context().actor_user_id,
                conn=conn,
            )
            await self.repository.delete(id=template_id, conn=conn)

    async def restore_default(self, template_id: UUID, *, expected_version: int) -> MailTemplateOut:
        async with self.repository.transaction() as conn:
            record = await self._require(template_id, conn=conn, for_update=True)
            self._ensure_expected_version(record, expected_version)
            default = get_default_email_template(record.key, record.locale)
            if default is None:
                raise Conflict(error="MAIL_TEMPLATE_DEFAULT_NOT_AVAILABLE")
            fields = {
                "name": default.name,
                "description": None,
                "subject_template": default.subject,
                "html_template": default.html,
                "text_template": default.text,
                "variables": list(default.variables),
                "is_enabled": True,
                "version": record.version + 1,
            }
            changed_fields = self._changed_fields(record, fields)
            updated = await self.repository.update_fields(record, fields=fields, conn=conn)
            await self._revisions.record(
                updated,
                action="restored",
                changed_fields=changed_fields,
                actor_user_id=self.resolve_actor_context().actor_user_id,
                conn=conn,
            )
        return self._out(updated)

    async def list_history(
        self,
        *,
        key: str,
        locale: str | None,
        params: PageParams,
    ) -> PageData[MailTemplateRevisionOut]:
        return await self._revisions.list_history(key=key, locale=locale, params=params)

    async def get_revision(self, revision_id: UUID) -> MailTemplateRevisionDetailOut:
        return await self._revisions.get_revision(revision_id)

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

    async def send_test(
        self,
        template_id: UUID,
        payload: MailTemplateTestSendRequest,
    ) -> MailTemplateTestSendOut:
        record = await self._require(template_id)
        if not record.is_enabled:
            raise Conflict(error="MAIL_TEMPLATE_DISABLED")
        if self._email_sender is None:
            raise RuntimeError("EMAIL_TEMPLATE_SENDER_NOT_CONFIGURED")
        try:
            result = await self._email_sender.send_template_version(
                recipient=str(payload.recipient),
                template_key=record.key,
                template_version=record.version,
                locale=record.locale,
                variables=payload.variables,
                idempotency_key=f"mail-template-test:{uuid7().hex}",
            )
        except EmailTemplateDisabledError as exc:
            raise Conflict(error="MAIL_TEMPLATE_DISABLED") from exc
        except EmailTemplateNotFoundError as exc:
            raise NotFound(error="MAIL_TEMPLATE_NOT_FOUND") from exc
        except (EmailTemplateSourceError, EmailTemplateRenderError) as exc:
            raise BadRequest(error="MAIL_TEMPLATE_RENDER_FAILED") from exc
        except ValueError as exc:
            raise BadRequest(error="MAIL_INVALID_RECIPIENT") from exc
        except RuntimeError as exc:
            if str(exc) == "MAIL_DISABLED":
                raise BadRequest(error="MAIL_DISABLED") from exc
            raise
        except BaseException as exc:
            raise_if_fatal(exc)
            raise_mail_delivery_error(
                exc,
                namespace="errors",
                failure_key="MAIL_TEMPLATE_TEST_SEND_FAILED",
                failure_error="MAIL_TEMPLATE_TEST_SEND_FAILED",
            )
        if not result.success:
            raise ServiceUnavailable(error="MAIL_TEMPLATE_TEST_SEND_FAILED")
        await self._activity_writer(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name="system.mail.template.test_sent",
                actor_user_id=self.resolve_actor_context().actor_user_id,
                entity_type="email_template",
                entity_id=UUID(str(record.id)),
                source="api",
                properties={
                    "key": str(record.key),
                    "locale": str(record.locale),
                    "version": int(record.version),
                    "provider": result.provider_id,
                    "message_id": result.message_id,
                },
            ),
        )
        return MailTemplateTestSendOut(
            state="accepted",
            provider=result.provider_id,
            message_id=result.message_id,
            attempts=result.attempts,
            latency_ms=result.latency_ms,
        )

    async def _require(
        self,
        template_id: UUID,
        *,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> EmailTemplateRecord:
        record = await self.repository.get(template_id, conn=conn, for_update=for_update)
        if record is None:
            raise NotFound(error="MAIL_TEMPLATE_NOT_FOUND")
        return record

    def _validate_changes(self, changes: dict[str, Any]) -> None:
        for key in ("subject_template", "html_template", "text_template"):
            value = changes.get(key)
            if not isinstance(value, str):
                continue
            if key == "html_template":
                self._validate_html_template(value)
            else:
                self._validate_template_source(value)

    @staticmethod
    def _changed_fields(record: Any, fields: dict[str, Any]) -> list[str]:
        return [key for key, value in fields.items() if key != "version" and getattr(record, key) != value]

    @staticmethod
    def _ensure_expected_version(record: Any, expected_version: int) -> None:
        if int(record.version) != expected_version:
            raise Conflict(error="MAIL_TEMPLATE_REVISION_CONFLICT")

    @staticmethod
    def _ensure_runtime_policy(*, key: str, is_enabled: Any) -> None:
        if is_enabled is False and is_required_template_key(key):
            raise Conflict(error="MAIL_TEMPLATE_REQUIRED_DISABLE_FORBIDDEN")

    @staticmethod
    def _variables(record: Any) -> list[str]:
        return string_list(record.variables, field_name="variables")

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
        return MailTemplateOut(
            id=record.id,
            key=record.key,
            locale=record.locale,
            name=record.name,
            description=record.description,
            subject_template=record.subject_template,
            html_template=record.html_template,
            text_template=record.text_template,
            variables=EmailTemplateService._variables(record),
            is_enabled=record.is_enabled,
            version=record.version,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )
