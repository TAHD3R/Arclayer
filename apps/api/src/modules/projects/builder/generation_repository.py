from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.agents.runtime_builder_v1 import AgentRunBuilderSnapshotV1Record
from src.models.builder._enums import BuilderGenerationStatus
from src.models.builder.generation import BuilderGenerationRecord
from src.models.jobs.background_job import BackgroundJobRecord
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class BuilderGenerationRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def get_generation(
        self,
        *,
        project_id: UUID,
        generation_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> BuilderGenerationRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = BuilderGenerationRecord.filter(id=generation_id, project_id=project_id).using_db(tenant_conn)
            if for_update:
                query = query.select_for_update()
            return await query.first()

    async def create_generation(
        self,
        *,
        values: Mapping[str, Any],
        conn: BaseDBAsyncClient,
    ) -> BuilderGenerationRecord:
        async with self.connection(conn) as tenant_conn:
            return await BuilderGenerationRecord.create(using_db=tenant_conn, **values)

    async def get_latest_recovery_generation(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID,
        target_stage: str,
        targets: list[dict[str, str]],
        statuses: Sequence[BuilderGenerationStatus],
        conn: BaseDBAsyncClient | None = None,
    ) -> BuilderGenerationRecord | None:
        async with self.connection(conn) as tenant_conn:
            return await (
                BuilderGenerationRecord
                .filter(
                    project_id=project_id,
                    actor_user_id=actor_user_id,
                    target_stage=target_stage,
                    targets=targets,
                    status__in=statuses,
                )
                .using_db(tenant_conn)
                .order_by("-created_at", "-id")
                .first()
            )

    async def update_generation(
        self,
        *,
        record: BuilderGenerationRecord,
        values: Mapping[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> BuilderGenerationRecord:
        async with self.connection(conn) as tenant_conn:
            for name, value in values.items():
                setattr(record, name, value)
            await record.save(using_db=tenant_conn, update_fields=[*values, "updated_at"])
            return record

    async def get_job(
        self,
        *,
        job_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> BackgroundJobRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = BackgroundJobRecord.filter(id=job_id).using_db(tenant_conn)
            if for_update:
                query = query.select_for_update()
            return await query.first()

    async def get_agent_builder_snapshot(
        self,
        *,
        run_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> AgentRunBuilderSnapshotV1Record | None:
        async with self.connection(conn) as tenant_conn:
            return await AgentRunBuilderSnapshotV1Record.filter(run_id=run_id).using_db(tenant_conn).first()
