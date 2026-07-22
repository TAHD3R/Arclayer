from __future__ import annotations

from collections.abc import Collection, Mapping
from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.agents.runtime_builder_v1 import AgentRunBuilderSnapshotV1Record
from src.models.agents.runtime_design_system_v1 import AgentRunDesignSystemSnapshotV1Record
from src.models.design_systems._enums import DesignSystemConceptGenerationStatus
from src.models.design_systems.concept_generation import DesignSystemConceptGenerationRecord
from src.models.jobs.background_job import BackgroundJobRecord
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class DesignSystemConceptGenerationRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def get_generation(
        self,
        *,
        project_id: UUID,
        design_system_id: UUID,
        generation_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> DesignSystemConceptGenerationRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = DesignSystemConceptGenerationRecord.filter(
                id=generation_id,
                project_id=project_id,
                design_system_id=design_system_id,
            ).using_db(tenant_conn)
            if for_update:
                query = query.select_for_update()
            return await query.first()

    async def get_latest_generation(
        self,
        *,
        project_id: UUID,
        design_system_id: UUID,
        actor_user_id: UUID,
        statuses: Collection[DesignSystemConceptGenerationStatus],
        conn: BaseDBAsyncClient | None = None,
    ) -> DesignSystemConceptGenerationRecord | None:
        async with self.connection(conn) as tenant_conn:
            return await (
                DesignSystemConceptGenerationRecord
                .filter(
                    project_id=project_id,
                    design_system_id=design_system_id,
                    actor_user_id=actor_user_id,
                    status__in=tuple(statuses),
                )
                .using_db(tenant_conn)
                .order_by("-created_at", "-id")
                .first()
            )

    async def create_generation(
        self,
        *,
        values: Mapping[str, Any],
        conn: BaseDBAsyncClient,
    ) -> DesignSystemConceptGenerationRecord:
        async with self.connection(conn) as tenant_conn:
            return await DesignSystemConceptGenerationRecord.create(using_db=tenant_conn, **values)

    async def update_generation(
        self,
        *,
        record: DesignSystemConceptGenerationRecord,
        values: Mapping[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> DesignSystemConceptGenerationRecord:
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

    async def get_design_system_snapshot(
        self,
        *,
        run_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> AgentRunDesignSystemSnapshotV1Record | None:
        async with self.connection(conn) as tenant_conn:
            return await AgentRunDesignSystemSnapshotV1Record.filter(run_id=run_id).using_db(tenant_conn).first()

    async def get_builder_snapshot(
        self,
        *,
        run_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> AgentRunBuilderSnapshotV1Record | None:
        async with self.connection(conn) as tenant_conn:
            return await AgentRunBuilderSnapshotV1Record.filter(run_id=run_id).using_db(tenant_conn).first()
