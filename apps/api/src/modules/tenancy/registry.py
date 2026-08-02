from __future__ import annotations

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.services import BaseService
from src.models.tenancy.workspace_tenant import (
    WorkspaceTenantIsolationMode,
    WorkspaceTenantRecord,
    WorkspaceTenantStatus,
)
from src.modules.tenancy.migrations import TenantMigrationRunner
from src.modules.tenancy.schema_names import build_workspace_schema_name, validate_tenant_schema_name


class WorkspaceTenantRegistryService(BaseService):
    def __init__(self) -> None:
        super().__init__()

    async def get_by_workspace_id(
        self,
        workspace_id: UUID,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceTenantRecord | None:
        return await WorkspaceTenantRecord.get_or_none(workspace_id=workspace_id, using_db=conn)

    async def ensure_for_workspace(
        self,
        workspace_id: UUID,
        organization_id: UUID,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceTenantRecord:
        schema_name = validate_tenant_schema_name(build_workspace_schema_name(workspace_id))
        record = await self.get_by_workspace_id(workspace_id, conn=conn)
        if record is not None:
            return record
        record, _created = await WorkspaceTenantRecord.get_or_create(
            using_db=conn,
            workspace_id=workspace_id,
            defaults={
                "organization_id": organization_id,
                "schema_name": schema_name,
                "isolation_mode": WorkspaceTenantIsolationMode.WORKSPACE_SCHEMA,
                "status": WorkspaceTenantStatus.PENDING,
                "schema_version": 0,
                "failure_reason": None,
            },
        )
        return record

    async def ensure_ready_for_workspace(
        self,
        workspace_id: UUID,
        organization_id: UUID,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceTenantRecord:
        record = await self.ensure_for_workspace(
            workspace_id=workspace_id,
            organization_id=organization_id,
            conn=conn,
        )
        migration_version = max(
            (migration.version for migration in TenantMigrationRunner().migrations),
            default=0,
        )
        if record.status == WorkspaceTenantStatus.READY and record.schema_version >= migration_version:
            return record

        try:
            applied_version = await TenantMigrationRunner().apply_all(record.schema_name, conn=conn)
        except Exception as exc:
            if conn is None:
                await self.mark_schema_failed(workspace_id, str(exc))
            raise

        return await self.mark_schema_ready(workspace_id, schema_version=applied_version, conn=conn)

    async def require_ready_for_workspace(
        self,
        workspace_id: UUID,
        organization_id: UUID,
        *,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceTenantRecord:
        record = await self.get_by_workspace_id(workspace_id, conn=conn)
        if record is None:
            raise RuntimeError("WORKSPACE_TENANT_RECORD_MISSING")
        if UUID(str(record.organization_id)) != organization_id:
            raise RuntimeError("WORKSPACE_TENANT_ORGANIZATION_MISMATCH")
        migration_version = max(
            (migration.version for migration in TenantMigrationRunner().migrations),
            default=0,
        )
        if record.status != WorkspaceTenantStatus.READY or record.schema_version < migration_version:
            raise RuntimeError("WORKSPACE_TENANT_SCHEMA_NOT_READY")
        return record

    async def mark_schema_ready(
        self,
        workspace_id: UUID,
        schema_version: int,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceTenantRecord:
        query = WorkspaceTenantRecord.filter(workspace_id=workspace_id)
        if conn is not None:
            query = query.using_db(conn)
        await query.update(
            status=WorkspaceTenantStatus.READY,
            schema_version=schema_version,
            failure_reason=None,
        )
        record = await self.get_by_workspace_id(workspace_id, conn=conn)
        if record is None:
            raise RuntimeError("WorkspaceTenantRecord not found after ready update")
        return record

    async def mark_schema_failed(
        self,
        workspace_id: UUID,
        reason: str,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceTenantRecord:
        query = WorkspaceTenantRecord.filter(workspace_id=workspace_id)
        if conn is not None:
            query = query.using_db(conn)
        await query.update(
            status=WorkspaceTenantStatus.FAILED,
            failure_reason=reason,
        )
        record = await self.get_by_workspace_id(workspace_id, conn=conn)
        if record is None:
            raise RuntimeError("WorkspaceTenantRecord not found after failure update")
        return record
