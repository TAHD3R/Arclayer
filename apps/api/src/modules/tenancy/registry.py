from __future__ import annotations

from uuid import UUID

from src.models.tenancy.workspace_tenant import (
    WorkspaceTenantIsolationMode,
    WorkspaceTenantRecord,
    WorkspaceTenantStatus,
)
from src.modules.tenancy.migrations import TenantMigrationRunner
from src.modules.tenancy.schema_names import build_workspace_schema_name, validate_tenant_schema_name


class WorkspaceTenantRegistryService:
    async def get_by_workspace_id(self, workspace_id: UUID) -> WorkspaceTenantRecord | None:
        return await WorkspaceTenantRecord.get_or_none(workspace_id=workspace_id)

    async def ensure_for_workspace(self, workspace_id: UUID, organization_id: UUID) -> WorkspaceTenantRecord:
        schema_name = validate_tenant_schema_name(build_workspace_schema_name(workspace_id))
        record = await WorkspaceTenantRecord.get_or_none(workspace_id=workspace_id)
        if record is not None:
            return record
        record, _created = await WorkspaceTenantRecord.get_or_create(
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

    async def ensure_ready_for_workspace(self, workspace_id: UUID, organization_id: UUID) -> WorkspaceTenantRecord:
        record = await self.ensure_for_workspace(workspace_id=workspace_id, organization_id=organization_id)
        migration_version = max(
            (migration.version for migration in TenantMigrationRunner().migrations),
            default=0,
        )
        if record.status == WorkspaceTenantStatus.READY and record.schema_version >= migration_version:
            return record

        try:
            applied_version = await TenantMigrationRunner().apply_all(record.schema_name)
        except Exception as exc:
            await self.mark_schema_failed(workspace_id, str(exc))
            raise

        return await self.mark_schema_ready(workspace_id, schema_version=applied_version)

    async def mark_schema_ready(self, workspace_id: UUID, schema_version: int) -> WorkspaceTenantRecord:
        await WorkspaceTenantRecord.filter(workspace_id=workspace_id).update(
            status=WorkspaceTenantStatus.READY,
            schema_version=schema_version,
            failure_reason=None,
        )
        record = await self.get_by_workspace_id(workspace_id)
        if record is None:
            raise RuntimeError("WorkspaceTenantRecord not found after ready update")
        return record

    async def mark_schema_failed(self, workspace_id: UUID, reason: str) -> WorkspaceTenantRecord:
        await WorkspaceTenantRecord.filter(workspace_id=workspace_id).update(
            status=WorkspaceTenantStatus.FAILED,
            failure_reason=reason,
        )
        record = await self.get_by_workspace_id(workspace_id)
        if record is None:
            raise RuntimeError("WorkspaceTenantRecord not found after failure update")
        return record
