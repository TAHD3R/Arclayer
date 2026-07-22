from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.skills.skill_update import SkillUpdatePreviewRecord
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class WorkspaceSkillUpdateRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def get_by_preview_idempotency_key(
        self,
        *,
        workspace_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillUpdatePreviewRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillUpdatePreviewRecord
                .filter(
                    workspace_id=workspace_id,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_by_acceptance_idempotency_key(
        self,
        *,
        workspace_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillUpdatePreviewRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillUpdatePreviewRecord
                .filter(
                    workspace_id=workspace_id,
                    acceptance_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_for_update(
        self,
        *,
        workspace_id: UUID,
        preview_id: UUID,
        installation_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> SkillUpdatePreviewRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillUpdatePreviewRecord
                .filter(
                    workspace_id=workspace_id,
                    id=preview_id,
                    installation_id=installation_id,
                )
                .using_db(tenant_conn)
                .select_for_update()
                .first()
            )

    async def create_preview(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> SkillUpdatePreviewRecord:
        async with self.connection(conn) as tenant_conn:
            return await SkillUpdatePreviewRecord.create(using_db=tenant_conn, **values)

    async def save(
        self,
        *,
        preview: SkillUpdatePreviewRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await preview.save(
                using_db=tenant_conn,
                update_fields=(*update_fields, "updated_at"),
            )
