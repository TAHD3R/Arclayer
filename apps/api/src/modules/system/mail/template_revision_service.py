from __future__ import annotations

from math import ceil
from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.services import BaseService
from src.modules.analytics.audit import ActivityAuditPayload
from src.modules.system.mail.schema import (
    MailTemplateRevisionAction,
    MailTemplateRevisionActorOut,
    MailTemplateRevisionDetailOut,
    MailTemplateRevisionOut,
)
from src.modules.system.mail.template_contracts import ActivityWriter, EmailTemplateRepositoryProtocol

EMAIL_TEMPLATE_SNAPSHOT_FIELDS = (
    "name",
    "description",
    "subject_template",
    "html_template",
    "text_template",
    "variables",
    "is_enabled",
)


class EmailTemplateRevisionService(BaseService):
    def __init__(
        self,
        repository: EmailTemplateRepositoryProtocol,
        *,
        settings: Settings,
        activity_writer: ActivityWriter,
    ) -> None:
        super().__init__(settings)
        self.repository = repository
        self._activity_writer = activity_writer

    async def record(
        self,
        record: Any,
        *,
        action: MailTemplateRevisionAction,
        changed_fields: list[str],
        actor_user_id: UUID | None,
        conn: BaseDBAsyncClient | None,
    ) -> None:
        audit_event = await self._activity_writer(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=f"system.mail.template.{action}",
                actor_user_id=actor_user_id,
                entity_type="email_template",
                entity_id=UUID(str(record.id)),
                source="api",
                properties={
                    "key": str(record.key),
                    "locale": str(record.locale),
                    "version": int(record.version),
                    "changed_fields": list(changed_fields),
                },
            ),
            conn=conn,
        )
        await self.repository.create_revision(
            data={
                "template_id": record.id,
                "key": record.key,
                "locale": record.locale,
                "version": record.version,
                "action": action,
                "name": record.name,
                "description": record.description,
                "subject_template": record.subject_template,
                "html_template": record.html_template,
                "text_template": record.text_template,
                "variables": string_list(record.variables, field_name="variables"),
                "is_enabled": record.is_enabled,
                "changed_fields": list(changed_fields),
                "actor_user_id": actor_user_id,
                "audit_event_id": audit_event.id,
            },
            conn=conn,
        )

    async def list_history(
        self,
        *,
        key: str,
        locale: str | None,
        params: PageParams,
    ) -> PageData[MailTemplateRevisionOut]:
        rows, total = await self.repository.list_revisions(
            key=key,
            locale=locale,
            offset=params.offset,
            limit=params.limit,
        )
        actor_ids = {UUID(str(row.actor_user_id)) for row in rows if row.actor_user_id}
        actors = await self.repository.list_revision_actors(actor_ids)
        pages = ceil(total / params.size)
        return PageData[MailTemplateRevisionOut](
            items=[self._summary(row, actors=actors) for row in rows],
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=params.page + 1 if params.page < pages else None,
            prev=min(params.page - 1, pages) if pages and params.page > 1 else None,
        )

    async def get_revision(self, revision_id: UUID) -> MailTemplateRevisionDetailOut:
        revision = await self.repository.get_revision(revision_id)
        if revision is None:
            raise NotFound(error="MAIL_TEMPLATE_REVISION_NOT_FOUND")
        actor_ids = {UUID(str(revision.actor_user_id))} if revision.actor_user_id else set()
        actors = await self.repository.list_revision_actors(actor_ids)
        summary = self._summary(revision, actors=actors)
        return MailTemplateRevisionDetailOut(
            **summary.model_dump(),
            name=revision.name,
            description=revision.description,
            subject_template=revision.subject_template,
            html_template=revision.html_template,
            text_template=revision.text_template,
            variables=string_list(revision.variables, field_name="variables"),
            is_enabled=revision.is_enabled,
        )

    @staticmethod
    def _summary(revision: Any, *, actors: dict[UUID, Any]) -> MailTemplateRevisionOut:
        actor = None
        if revision.actor_user_id:
            user = actors.get(UUID(str(revision.actor_user_id)))
            if user is not None:
                actor = MailTemplateRevisionActorOut(
                    id=UUID(str(user.id)),
                    username=str(user.username),
                    display_name=user.display_name,
                    avatar_url=user.avatar_url,
                )
        return MailTemplateRevisionOut(
            id=UUID(str(revision.id)),
            template_id=UUID(str(revision.template_id)),
            key=str(revision.key),
            locale=str(revision.locale),
            version=int(revision.version),
            action=revision.action,
            changed_fields=string_list(revision.changed_fields, field_name="changed_fields"),
            actor=actor,
            created_at=revision.created_at,
        )


def string_list(value: Any, *, field_name: str) -> list[str]:
    if not isinstance(value, list):
        raise TypeError(f"Email template {field_name} must be a list")
    return [str(item) for item in value]
