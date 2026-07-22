from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.skills.skill_github_import import SkillGitHubImportRecord
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class WorkspaceSkillGitHubImportRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def get_import(
        self,
        *,
        workspace_id: UUID,
        import_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillGitHubImportRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillGitHubImportRecord
                .filter(workspace_id=workspace_id, id=import_id)
                .using_db(tenant_conn)
                .first()
            )

    async def get_import_for_update(
        self,
        *,
        workspace_id: UUID,
        import_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> SkillGitHubImportRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillGitHubImportRecord
                .filter(workspace_id=workspace_id, id=import_id)
                .using_db(tenant_conn)
                .select_for_update()
                .first()
            )

    async def get_by_idempotency_key(
        self,
        *,
        workspace_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> SkillGitHubImportRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillGitHubImportRecord
                .filter(
                    workspace_id=workspace_id,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def create_import(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> SkillGitHubImportRecord:
        async with self.connection(conn) as tenant_conn:
            return await SkillGitHubImportRecord.create(using_db=tenant_conn, **values)

    async def save_import(
        self,
        *,
        record: SkillGitHubImportRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await record.save(
                using_db=tenant_conn,
                update_fields=(*update_fields, "updated_at"),
            )
