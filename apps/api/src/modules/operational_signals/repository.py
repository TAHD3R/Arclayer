from __future__ import annotations

from datetime import datetime
from math import ceil
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q

from src.core.http.pagination import PageParams
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.jobs.background_job import BackgroundJobRecord, JobInternalStatus
from src.models.operations_signals import (
    OperationalSignalTriage,
    OperationalSignalTriageHistory,
    OperationalSignalTriageState,
)
from src.models.organization.user import User, UserStatus
from src.models.platform_identity.identity import PlatformInstanceOwnership, PlatformOperator, PlatformOperatorStatus
from src.modules.operational_signals.schema import OperationalSignalListQuery, OperationalSignalSourceLifecycle


class OperationalSignalRepository(TortoiseORMRepository[BackgroundJobRecord]):
    async def list_source_jobs(
        self,
        *,
        filters: OperationalSignalListQuery,
        params: PageParams,
        now: datetime,
    ) -> tuple[list[BackgroundJobRecord], int, int]:
        query = BackgroundJobRecord.all()
        if filters.source_lifecycle == OperationalSignalSourceLifecycle.UNRESOLVED:
            query = query.filter(internal_status=JobInternalStatus.FAILED)
        elif filters.source_lifecycle == OperationalSignalSourceLifecycle.RESOLVED:
            query = query.exclude(internal_status=JobInternalStatus.FAILED).filter(
                operational_signal_triage__isnull=False
            )
        else:
            query = query.filter(
                Q(internal_status=JobInternalStatus.FAILED) | Q(operational_signal_triage__isnull=False)
            )
        query = await self._apply_filters(query=query, filters=filters, now=now)
        total = int(await query.distinct().count())
        pages = ceil(total / params.size) if total else 0
        if total == 0 or params.page > pages:
            return [], total, pages
        rows = (
            await query
            .distinct()
            .order_by("completed_at", "created_at", "id")
            .offset(params.offset)
            .limit(params.limit)
        )
        return list(rows), total, pages

    async def _apply_filters(self, *, query, filters: OperationalSignalListQuery, now: datetime):
        if not filters.include_reminded:
            hidden_signal_ids = await OperationalSignalTriage.filter(
                state=OperationalSignalTriageState.REMIND_LATER,
                reminder_at__gt=now,
            ).values_list("signal_id", flat=True)
            if hidden_signal_ids:
                query = query.exclude(id__in=hidden_signal_ids)
        if filters.coordination_state == OperationalSignalTriageState.NEEDS_ATTENTION:
            query = query.filter(
                Q(operational_signal_triage__isnull=True)
                | Q(operational_signal_triage__state=OperationalSignalTriageState.NEEDS_ATTENTION)
            )
        elif filters.coordination_state is not None:
            query = query.filter(operational_signal_triage__state=filters.coordination_state)
        if filters.assignee_user_id is not None:
            query = query.filter(operational_signal_triage__assignee_user_id=filters.assignee_user_id)
        for field in ("workspace_id", "project_id", "site_id"):
            value = getattr(filters, field)
            if value is not None:
                query = query.filter(**{field: value})
        return query

    async def get_source_job(
        self,
        *,
        signal_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> BackgroundJobRecord | None:
        query = BackgroundJobRecord.filter(id=signal_id)
        query = self.using_db(query, conn)
        if for_update:
            query = query.select_for_update()
        job = await query.first()
        if job is None:
            return None
        if job.internal_status == JobInternalStatus.FAILED:
            return job
        if await self.using_db(OperationalSignalTriage.filter(signal_id=signal_id), conn).exists():
            return job
        return None

    async def list_triage(self, *, signal_ids: list[UUID]) -> dict[UUID, OperationalSignalTriage]:
        if not signal_ids:
            return {}
        rows = await OperationalSignalTriage.filter(signal_id__in=signal_ids)
        return {UUID(str(row.signal_id)): row for row in rows}

    async def get_triage(
        self,
        *,
        signal_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> OperationalSignalTriage | None:
        query = OperationalSignalTriage.filter(signal_id=signal_id)
        query = self.using_db(query, conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    async def create_triage(self, *, signal_id: UUID, conn: BaseDBAsyncClient) -> OperationalSignalTriage:
        return await self.create_record(
            OperationalSignalTriage,
            conn=conn,
            signal_id=signal_id,
            source_job_id=signal_id,
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

    async def list_due_reminder_signal_ids(
        self,
        *,
        now: datetime,
    ) -> tuple[UUID, ...]:
        signal_ids = (
            await OperationalSignalTriage
            .filter(
                state=OperationalSignalTriageState.REMIND_LATER,
                reminder_at__lte=now,
                source_job__internal_status=JobInternalStatus.FAILED,
            )
            .order_by("signal_id")
            .values_list("signal_id", flat=True)
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
