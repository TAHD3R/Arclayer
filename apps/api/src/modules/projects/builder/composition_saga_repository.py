from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.builder._enums import BuilderCompositionSagaStatus
from src.models.builder.composition_saga import BuilderCompositionSagaRecord
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class BuilderCompositionSagaRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def get_saga(
        self,
        *,
        project_id: UUID,
        saga_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> BuilderCompositionSagaRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = BuilderCompositionSagaRecord.filter(id=saga_id, project_id=project_id).using_db(tenant_conn)
            if for_update:
                query = query.select_for_update()
            return await query.first()

    async def create_saga(
        self,
        *,
        values: Mapping[str, Any],
        conn: BaseDBAsyncClient,
    ) -> BuilderCompositionSagaRecord:
        async with self.connection(conn) as tenant_conn:
            return await BuilderCompositionSagaRecord.create(using_db=tenant_conn, **values)

    async def update_saga(
        self,
        *,
        record: BuilderCompositionSagaRecord,
        values: Mapping[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> BuilderCompositionSagaRecord:
        async with self.connection(conn) as tenant_conn:
            for name, value in values.items():
                setattr(record, name, value)
            await record.save(using_db=tenant_conn, update_fields=[*values, "updated_at"])
            return record

    async def get_latest_recovery_saga(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID,
        targets: list[dict[str, str]],
        statuses: Sequence[BuilderCompositionSagaStatus],
        conn: BaseDBAsyncClient | None = None,
    ) -> BuilderCompositionSagaRecord | None:
        async with self.connection(conn) as tenant_conn:
            return await (
                BuilderCompositionSagaRecord
                .filter(
                    project_id=project_id,
                    actor_user_id=actor_user_id,
                    targets=targets,
                    status__in=statuses,
                )
                .using_db(tenant_conn)
                .order_by("-created_at", "-id")
                .first()
            )


__all__ = ["BuilderCompositionSagaRepository"]
