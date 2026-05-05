from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.queryset import QuerySet

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.analytics.audit_event import AuditEvent
from src.models.organization.user import User
from src.modules.analytics.schema import AuditEventListQuery


class AuditEventRepository(TortoiseORMRepository):
    def build_queryset(
        self,
        *,
        organization_id: UUID | None,
        filters: AuditEventListQuery,
        conn: BaseDBAsyncClient | None = None,
    ) -> QuerySet[AuditEvent]:
        qs = AuditEvent.all()
        qs = self.using_db(qs, conn)

        if organization_id is not None:
            qs = qs.filter(organization_id=organization_id)

        if filters.organization_id is not None:
            qs = qs.filter(organization_id=filters.organization_id)
        if filters.workspace_id is not None:
            qs = qs.filter(workspace_id=filters.workspace_id)
        if filters.actor_user_id is not None:
            qs = qs.filter(actor_user_id=filters.actor_user_id)
        if filters.subject_user_id is not None:
            qs = qs.filter(subject_user_id=filters.subject_user_id)
        if filters.entity_type is not None:
            qs = qs.filter(entity_type=filters.entity_type)
        if filters.entity_id is not None:
            qs = qs.filter(entity_id=filters.entity_id)
        if filters.event_name is not None:
            needle = (filters.event_name or "").strip()
            if needle:
                # Product behavior: treat as a search term (partial match) instead of strict equality.
                # Notes:
                # - This may not fully leverage the btree index, but keeps the UX intuitive.
                # - If we need indexed prefix search later, we can add a dedicated param like `event_name_prefix`.
                qs = qs.filter(event_name__icontains=needle)

        occurred_from: datetime | None = filters.occurred_from
        occurred_to: datetime | None = filters.occurred_to
        if occurred_from is not None:
            qs = qs.filter(occurred_at__gte=occurred_from)
        if occurred_to is not None:
            qs = qs.filter(occurred_at__lte=occurred_to)

        return qs.order_by("-occurred_at", "-id")

    async def get_event_by_id(self, *, event_id: UUID) -> AuditEvent | None:
        return await AuditEvent.get_or_none(id=event_id)

    async def list_users_by_ids(self, *, user_ids: set[UUID]) -> list[User]:
        if not user_ids:
            return []
        return await User.filter(id__in=list(user_ids)).all()

    async def create_many(
        self,
        *,
        rows: list[dict[str, Any]],
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        if not rows:
            return
        objs = [AuditEvent(**row) for row in rows]
        # Tortoise bulk_create is the fastest path for high-frequency append-only tables.
        if conn is None:
            await AuditEvent.bulk_create(objs)  # type: ignore[attr-defined]
            return
        await AuditEvent.bulk_create(objs, using_db=conn)  # type: ignore[attr-defined]
