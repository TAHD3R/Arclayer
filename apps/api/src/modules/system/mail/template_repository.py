from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.organization.user import User
from src.models.system.email_template import EmailTemplateRecord, EmailTemplateRevisionRecord
from src.models.system.notification_campaign import (
    NotificationCampaignState,
    NotificationCampaignVariantRecord,
)


class EmailTemplateRepository(TortoiseORMRepository[EmailTemplateRecord]):
    def __init__(self) -> None:
        super().__init__(EmailTemplateRecord)

    async def list_records(self) -> list[EmailTemplateRecord]:
        return await EmailTemplateRecord.all().order_by("key", "locale")

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[BaseDBAsyncClient]:
        async with in_transaction() as conn:
            yield conn

    async def get(
        self,
        template_id: UUID,
        *,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> EmailTemplateRecord | None:
        queryset = EmailTemplateRecord.filter(id=template_id)
        if for_update:
            queryset = queryset.select_for_update()
        return await self.using_db(queryset, conn).first()

    async def create(
        self,
        *,
        data: dict[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> EmailTemplateRecord:
        return await self.create_record(EmailTemplateRecord, conn=conn, **data)

    async def update_fields(
        self,
        instance: EmailTemplateRecord,
        *,
        fields: dict[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> EmailTemplateRecord:
        return await super().update_fields(instance, fields=fields, conn=conn)

    async def delete(
        self,
        *,
        id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> bool:
        return bool(await self.delete_by_id(EmailTemplateRecord, id, conn=conn))

    async def count_active_references(self, *, key: str, locale: str) -> int:
        payloads = await (
            NotificationCampaignVariantRecord
            .filter(locale=locale)
            .exclude(campaign__state=NotificationCampaignState.ARCHIVED)
            .exclude(email_payload=None)
            .values_list("email_payload", flat=True)
        )
        return sum(
            1
            for payload in payloads
            if isinstance(payload, dict) and (payload.get("templateKey") or payload.get("template_key")) == key
        )

    async def create_revision(
        self,
        *,
        data: dict[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> EmailTemplateRevisionRecord:
        return await self.create_record(EmailTemplateRevisionRecord, conn=conn, **data)

    async def list_revisions(
        self,
        *,
        key: str,
        locale: str | None,
        offset: int,
        limit: int,
    ) -> tuple[list[EmailTemplateRevisionRecord], int]:
        queryset = EmailTemplateRevisionRecord.filter(key=key)
        if locale:
            queryset = queryset.filter(locale=locale)
        total = int(await queryset.count())
        rows = await queryset.order_by("-created_at", "-version").offset(offset).limit(limit)
        return list(rows), total

    async def get_revision(self, revision_id: UUID) -> EmailTemplateRevisionRecord | None:
        return await EmailTemplateRevisionRecord.filter(id=revision_id).first()

    async def list_revision_actors(self, user_ids: set[UUID]) -> dict[UUID, User]:
        if not user_ids:
            return {}
        users = await User.filter(id__in=user_ids)
        return {UUID(str(user.id)): user for user in users}

    async def get_by_identity(self, *, key: str, locale: str) -> EmailTemplateRecord | None:
        return await EmailTemplateRecord.filter(key=key, locale=locale).first()
