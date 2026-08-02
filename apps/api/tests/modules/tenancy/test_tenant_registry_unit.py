from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.tenancy.workspace_tenant import WorkspaceTenantRecord, WorkspaceTenantStatus
from src.modules.tenancy import registry as registry_module
from src.modules.tenancy.registry import WorkspaceTenantRegistryService


@pytest.mark.asyncio
async def test_ready_provisioning_with_a_caller_connection_does_not_mark_tenant_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    caller_conn = cast(BaseDBAsyncClient, object())
    record = cast(
        WorkspaceTenantRecord,
        SimpleNamespace(
            status=WorkspaceTenantStatus.PENDING,
            schema_name="workspace_abcdef1234567890abcd",
            schema_version=0,
        ),
    )

    class _FailingMigrationRunner:
        migrations = (SimpleNamespace(version=1),)

        async def apply_all(self, schema_name: str, *, conn: BaseDBAsyncClient | None = None) -> int:
            assert schema_name == record.schema_name
            assert conn is caller_conn
            raise RuntimeError("tenant migration failed")

    service = WorkspaceTenantRegistryService()
    ensure_for_workspace = AsyncMock(return_value=record)
    mark_schema_failed = AsyncMock()
    monkeypatch.setattr(service, "ensure_for_workspace", ensure_for_workspace)
    monkeypatch.setattr(service, "mark_schema_failed", mark_schema_failed)
    monkeypatch.setattr(registry_module, "TenantMigrationRunner", _FailingMigrationRunner)

    with pytest.raises(RuntimeError, match="tenant migration failed"):
        await service.ensure_ready_for_workspace(
            workspace_id=workspace_id,
            organization_id=organization_id,
            conn=caller_conn,
        )

    ensure_for_workspace.assert_awaited_once_with(
        workspace_id=workspace_id,
        organization_id=organization_id,
        conn=caller_conn,
    )
    mark_schema_failed.assert_not_awaited()
