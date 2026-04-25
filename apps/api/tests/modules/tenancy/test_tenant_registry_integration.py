from __future__ import annotations

from uuid import uuid4

import pytest
from tortoise.transactions import in_transaction

from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization
from src.models.organization.user import User
from src.models.tenancy.workspace_tenant import WorkspaceTenantStatus
from src.models.workspaces.workspace import Workspace
from src.modules.tenancy.database import quote_schema_name
from src.modules.tenancy.migrations import TenantMigrationRunner
from src.modules.tenancy.registry import WorkspaceTenantRegistryService
from src.modules.tenancy.router_helpers import bind_workspace_tenant_context


async def _workspace_ids() -> tuple[Workspace, Organization]:
    organization = await Organization.create(slug=f"org_{uuid4().hex[:12]}", name="Tenant Org")
    owner = await User.create(username=f"user_{uuid4().hex[:10]}", email=f"{uuid4().hex[:10]}@example.com")
    await OrgMembership.create(
        organization_id=organization.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Tenant Workspace",
        is_active=True,
        created_by_user_id=owner.id,
    )
    return workspace, organization


@pytest.mark.asyncio
async def test_workspace_tenant_registry_is_idempotent(prepared_db) -> None:
    _ = prepared_db
    service = WorkspaceTenantRegistryService()
    workspace, organization = await _workspace_ids()
    first = await service.ensure_for_workspace(workspace_id=workspace.id, organization_id=organization.id)
    second = await service.ensure_for_workspace(workspace_id=workspace.id, organization_id=organization.id)
    assert first.id == second.id
    assert first.schema_name == second.schema_name


@pytest.mark.asyncio
async def test_workspace_tenant_registry_status_updates_are_visible(prepared_db) -> None:
    _ = prepared_db
    service = WorkspaceTenantRegistryService()
    workspace, organization = await _workspace_ids()
    record = await service.ensure_for_workspace(workspace_id=workspace.id, organization_id=organization.id)
    failed = await service.mark_schema_failed(workspace.id, "ddl failed")
    assert failed.id == record.id
    assert failed.status == WorkspaceTenantStatus.FAILED
    assert failed.failure_reason == "ddl failed"

    ready = await service.mark_schema_ready(workspace.id, schema_version=2)
    assert ready.status == WorkspaceTenantStatus.READY
    assert ready.schema_version == 2
    assert ready.failure_reason is None


@pytest.mark.asyncio
async def test_tenant_migration_runner_is_idempotent(prepared_db) -> None:
    _ = prepared_db
    service = WorkspaceTenantRegistryService()
    runner = TenantMigrationRunner()
    workspace, organization = await _workspace_ids()
    record = await service.ensure_for_workspace(workspace_id=workspace.id, organization_id=organization.id)
    first_version = await runner.apply_all(record.schema_name)
    second_version = await runner.apply_all(record.schema_name)
    assert first_version == second_version == 2


@pytest.mark.asyncio
async def test_workspace_tenant_context_creates_ready_schema(prepared_db) -> None:
    _ = prepared_db
    workspace, organization = await _workspace_ids()

    context = await bind_workspace_tenant_context(
        workspace_id=workspace.id,
        organization_id=organization.id,
    )

    record = await WorkspaceTenantRegistryService().get_by_workspace_id(workspace.id)
    assert record is not None
    assert record.status == WorkspaceTenantStatus.READY
    assert record.schema_version == 2
    assert context.schema_name == record.schema_name

    async with in_transaction() as conn:
        schema_rows = await conn.execute_query(
            "SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
            [record.schema_name],
        )
        migration_rows = await conn.execute_query(
            f"SELECT version, status FROM {quote_schema_name(record.schema_name)}.tenant_schema_migrations ORDER BY version"
        )

    schema_payload = schema_rows[1] if isinstance(schema_rows, tuple) else schema_rows
    migration_payload = migration_rows[1] if isinstance(migration_rows, tuple) else migration_rows
    assert schema_payload
    assert [row["version"] for row in migration_payload] == [1, 2]
    assert {row["status"] for row in migration_payload} == {"applied"}
