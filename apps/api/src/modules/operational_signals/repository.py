from __future__ import annotations

from datetime import datetime
from math import ceil
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q

from src.core.http.pagination import PageParams
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.operations_signals import (
    OperationalSignalProjection,
    OperationalSignalProjectionLifecycle,
    OperationalSignalTriage,
    OperationalSignalTriageHistory,
    OperationalSignalTriageNote,
    OperationalSignalTriageState,
)
from src.models.organization.user import User, UserStatus
from src.models.platform_identity.identity import PlatformInstanceOwnership, PlatformOperator, PlatformOperatorStatus
from src.modules.operational_signals.schema import (
    OperationalSignalListQuery,
    OperationalSignalOrder,
    OperationalSignalSourceLifecycle,
)


class OperationalSignalRepository(TortoiseORMRepository[OperationalSignalProjection]):
    async def list_projections(
        self,
        *,
        filters: OperationalSignalListQuery,
        params: PageParams,
        now: datetime,
    ) -> tuple[list[OperationalSignalProjection], int, int]:
        query = OperationalSignalProjection.all()
        if filters.source_lifecycle != OperationalSignalSourceLifecycle.ALL:
            query = query.filter(source_lifecycle=filters.source_lifecycle.value)
        query = await self._apply_filters(query=query, filters=filters, now=now)
        total = int(await query.distinct().count())
        pages = ceil(total / params.size) if total else 0
        if total == 0 or params.page > pages:
            return [], total, pages
        rows = await self._order(query=query, filters=filters).offset(params.offset).limit(params.limit)
        return list(rows), total, pages

    @staticmethod
    def _order(*, query, filters: OperationalSignalListQuery):
        if filters.order == OperationalSignalOrder.DETECTED_AT:
            prefix = "-" if filters.order_direction == "desc" else ""
            return query.distinct().order_by(f"{prefix}detected_at", f"{prefix}id")
        prefix = "-" if filters.order_direction == "desc" else ""
        return query.distinct().order_by(f"{prefix}priority_rank", f"{prefix}detected_at", f"{prefix}id")

    async def _apply_filters(self, *, query, filters: OperationalSignalListQuery, now: datetime):
        if not filters.include_reminded:
            hidden_projection_ids = await OperationalSignalTriage.filter(
                state=OperationalSignalTriageState.WAITING,
                reminder_at__gt=now,
                projection__source_lifecycle=OperationalSignalProjectionLifecycle.UNRESOLVED,
            ).values_list("projection_id", flat=True)
            if hidden_projection_ids:
                query = query.exclude(id__in=hidden_projection_ids)
        if filters.coordination_state == OperationalSignalTriageState.SOURCE_RECOVERED:
            query = query.filter(source_lifecycle=OperationalSignalProjectionLifecycle.RESOLVED)
        elif filters.coordination_state == OperationalSignalTriageState.UNCLAIMED:
            query = query.filter(source_lifecycle=OperationalSignalProjectionLifecycle.UNRESOLVED)
            query = query.filter(Q(triage__isnull=True) | Q(triage__state=OperationalSignalTriageState.UNCLAIMED))
        elif filters.coordination_state is not None:
            query = query.filter(source_lifecycle=OperationalSignalProjectionLifecycle.UNRESOLVED)
            query = query.filter(triage__state=filters.coordination_state)
        if filters.assignee_user_id is not None:
            query = query.filter(triage__assignee_user_id=filters.assignee_user_id)
        if filters.source_domain is not None:
            query = query.filter(source_domain=filters.source_domain)
        if filters.severity is not None:
            query = query.filter(severity=filters.severity.value)
        for field in ("workspace_id", "project_id", "site_id"):
            value = getattr(filters, field)
            if value is not None:
                query = query.filter(**{field: value})
        return query

    async def get_projection(
        self,
        *,
        signal_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> OperationalSignalProjection | None:
        query = OperationalSignalProjection.filter(id=signal_id)
        query = self.using_db(query, conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    async def list_triage(self, *, signal_ids: list[UUID]) -> dict[UUID, OperationalSignalTriage]:
        if not signal_ids:
            return {}
        rows = await OperationalSignalTriage.filter(projection_id__in=signal_ids)
        return {row.projection_id: row for row in rows}

    async def get_triage(
        self,
        *,
        signal_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> OperationalSignalTriage | None:
        query = OperationalSignalTriage.filter(projection_id=signal_id)
        query = self.using_db(query, conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    async def create_triage(self, *, projection_id: UUID, conn: BaseDBAsyncClient) -> OperationalSignalTriage:
        return await self.create_record(
            OperationalSignalTriage,
            conn=conn,
            projection_id=projection_id,
        )

    async def save_triage(
        self,
        triage: OperationalSignalTriage,
        *,
        fields: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> OperationalSignalTriage:
        return await self.update_fields(triage, fields=fields, conn=conn)

    async def append_history(self, *, conn: BaseDBAsyncClient, **values: object) -> OperationalSignalTriageHistory:
        return await self.create_record(OperationalSignalTriageHistory, conn=conn, **values)

    async def list_history(self, *, triage_id: UUID) -> list[OperationalSignalTriageHistory]:
        return list(await OperationalSignalTriageHistory.filter(triage_id=triage_id).order_by("revision"))

    async def append_note(self, *, conn: BaseDBAsyncClient, **values: object) -> OperationalSignalTriageNote:
        return await self.create_record(OperationalSignalTriageNote, conn=conn, **values)

    async def list_notes(self, *, triage_id: UUID) -> list[OperationalSignalTriageNote]:
        return list(await OperationalSignalTriageNote.filter(triage_id=triage_id).order_by("revision"))

    async def list_due_reminder_signal_ids(self, *, now: datetime) -> tuple[UUID, ...]:
        signal_ids = (
            await OperationalSignalTriage
            .filter(
                state=OperationalSignalTriageState.WAITING,
                reminder_at__lte=now,
                projection__source_lifecycle=OperationalSignalProjectionLifecycle.UNRESOLVED,
            )
            .order_by("projection_id")
            .values_list("projection_id", flat=True)
        )
        return tuple(UUID(str(signal_id)) for signal_id in signal_ids)

    async def assignee_is_eligible(self, *, user_id: UUID, conn: BaseDBAsyncClient) -> bool:
        if not await self.using_db(User.filter(id=user_id, status=UserStatus.ACTIVE), conn).exists():
            return False
        if await self.using_db(PlatformInstanceOwnership.filter(owner_user_id=user_id), conn).exists():
            return True
        return await self.using_db(
            PlatformOperator.filter(user_id=user_id, status=PlatformOperatorStatus.ACTIVE), conn
        ).exists()

    async def list_eligible_assignee_users(self) -> list[User]:
        owner_user_ids = await PlatformInstanceOwnership.all().values_list("owner_user_id", flat=True)
        operator_user_ids = await PlatformOperator.filter(
            status=PlatformOperatorStatus.ACTIVE,
        ).values_list("user_id", flat=True)
        eligible_user_ids = set(owner_user_ids) | set(operator_user_ids)
        if not eligible_user_ids:
            return []
        return list(
            await User.filter(id__in=eligible_user_ids, status=UserStatus.ACTIVE).order_by(
                "display_name",
                "username",
                "id",
            )
        )
