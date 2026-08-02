from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.knowledge._enums import KnowledgeGuidanceScope, KnowledgeProjectGuidanceMode
from src.models.tenancy.workspace_tenant import WorkspaceTenantRecord
from src.modules.tenancy import guidance_provisioner
from src.modules.tenancy.guidance_provisioner import TenantKnowledgeGuidanceLayerProvisioner, WorkspaceTenantRegistry
from src.modules.tenancy.schema import TenantContext, TenantIsolationMode, TenantScope


class _RecordingRegistry:
    def __init__(self, tenant: WorkspaceTenantRecord) -> None:
        self.tenant = tenant
        self.ensure_calls: list[dict[str, object]] = []
        self.require_calls: list[dict[str, object]] = []

    async def ensure_ready_for_workspace(
        self,
        workspace_id: UUID,
        organization_id: UUID,
        *,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceTenantRecord:
        kwargs: dict[str, object] = {
            "workspace_id": workspace_id,
            "organization_id": organization_id,
            "conn": conn,
        }
        self.ensure_calls.append(kwargs)
        return self.tenant

    async def require_ready_for_workspace(
        self,
        workspace_id: UUID,
        organization_id: UUID,
        *,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceTenantRecord:
        kwargs: dict[str, object] = {
            "workspace_id": workspace_id,
            "organization_id": organization_id,
            "conn": conn,
        }
        self.require_calls.append(kwargs)
        return self.tenant


class _RecordingRouter:
    def __init__(self, context: TenantContext, routers: list[_RecordingRouter]) -> None:
        self.context = context
        self.bind_calls: list[BaseDBAsyncClient] = []
        routers.append(self)

    async def bind(self, conn: BaseDBAsyncClient) -> BaseDBAsyncClient:
        self.bind_calls.append(conn)
        return conn


def _tenant() -> WorkspaceTenantRecord:
    return cast(
        WorkspaceTenantRecord,
        SimpleNamespace(
            schema_name="workspace_abcdef1234567890abcd",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
    )


def _install_recording_tenant_database(
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[list[_RecordingRouter], list[BaseDBAsyncClient], list[dict[str, object]]]:
    routers: list[_RecordingRouter] = []
    restored_connections: list[BaseDBAsyncClient] = []
    created_layers: list[dict[str, object]] = []

    def router_factory(context: TenantContext) -> _RecordingRouter:
        return _RecordingRouter(context, routers)

    async def restore_public_search_path(conn: BaseDBAsyncClient) -> None:
        restored_connections.append(conn)

    async def create_layer(**kwargs: object) -> object:
        created_layers.append(kwargs)
        return SimpleNamespace()

    monkeypatch.setattr(guidance_provisioner, "TenantDatabaseRouter", router_factory)
    monkeypatch.setattr(guidance_provisioner, "set_public_search_path", restore_public_search_path)
    monkeypatch.setattr(guidance_provisioner.KnowledgeGuidanceLayerRecord, "create", create_layer)
    return routers, restored_connections, created_layers


@pytest.mark.asyncio
async def test_workspace_layer_provisioning_uses_the_caller_connection_and_restores_public_search_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tenant = _tenant()
    registry = _RecordingRegistry(tenant)
    provisioner = TenantKnowledgeGuidanceLayerProvisioner(registry=cast(WorkspaceTenantRegistry, registry))
    routers, restored_connections, created_layers = _install_recording_tenant_database(monkeypatch)
    organization_id = uuid4()
    workspace_id = uuid4()
    actor_user_id = uuid4()
    conn = cast(BaseDBAsyncClient, object())

    await provisioner.provision_workspace_layer(
        organization_id=organization_id,
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        conn=conn,
    )

    assert registry.ensure_calls == [
        {
            "organization_id": organization_id,
            "workspace_id": workspace_id,
            "conn": conn,
        }
    ]
    assert registry.require_calls == []
    assert len(routers) == 1
    router = routers[0]
    assert router.bind_calls == [conn]
    context = router.context
    assert context.scope is TenantScope.WORKSPACE
    assert context.identity.organization_id == organization_id
    assert context.identity.workspace_id == workspace_id
    assert context.identity.project_id is None
    assert context.identity.schema_name == tenant.schema_name
    assert context.isolation_mode is TenantIsolationMode.WORKSPACE_SCHEMA
    assert created_layers == [
        {
            "using_db": conn,
            "workspace_id": workspace_id,
            "scope_kind": KnowledgeGuidanceScope.WORKSPACE,
            "scope_id": workspace_id,
            "project_mode": None,
            "metadata_revision": 1,
            "created_by_user_id": actor_user_id,
            "updated_by_user_id": actor_user_id,
        }
    ]
    assert restored_connections == [conn]


@pytest.mark.asyncio
async def test_project_layer_provisioning_uses_ready_tenant_and_supplement_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tenant = _tenant()
    registry = _RecordingRegistry(tenant)
    provisioner = TenantKnowledgeGuidanceLayerProvisioner(registry=cast(WorkspaceTenantRegistry, registry))
    routers, restored_connections, created_layers = _install_recording_tenant_database(monkeypatch)
    organization_id = uuid4()
    workspace_id = uuid4()
    project_id = uuid4()
    actor_user_id = uuid4()
    conn = cast(BaseDBAsyncClient, object())

    await provisioner.provision_project_layer(
        organization_id=organization_id,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        conn=conn,
    )

    assert registry.ensure_calls == []
    assert registry.require_calls == [
        {
            "organization_id": organization_id,
            "workspace_id": workspace_id,
            "conn": conn,
        }
    ]
    assert len(routers) == 1
    context = routers[0].context
    assert routers[0].bind_calls == [conn]
    assert context.scope is TenantScope.PROJECT
    assert context.identity.organization_id == organization_id
    assert context.identity.workspace_id == workspace_id
    assert context.identity.project_id == project_id
    assert created_layers == [
        {
            "using_db": conn,
            "workspace_id": workspace_id,
            "scope_kind": KnowledgeGuidanceScope.PROJECT,
            "scope_id": project_id,
            "project_mode": KnowledgeProjectGuidanceMode.SUPPLEMENT,
            "metadata_revision": 1,
            "created_by_user_id": actor_user_id,
            "updated_by_user_id": actor_user_id,
        }
    ]
    assert restored_connections == [conn]


@pytest.mark.asyncio
async def test_layer_insert_failure_propagates_without_attempting_public_search_path_restore(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tenant = _tenant()
    registry = _RecordingRegistry(tenant)
    provisioner = TenantKnowledgeGuidanceLayerProvisioner(registry=cast(WorkspaceTenantRegistry, registry))
    routers, restored_connections, _created_layers = _install_recording_tenant_database(monkeypatch)
    organization_id = uuid4()
    workspace_id = uuid4()
    actor_user_id = uuid4()
    conn = cast(BaseDBAsyncClient, object())

    async def fail_layer_insert(**_kwargs: object) -> object:
        raise RuntimeError("guidance layer insert failed")

    monkeypatch.setattr(guidance_provisioner.KnowledgeGuidanceLayerRecord, "create", fail_layer_insert)

    with pytest.raises(RuntimeError, match="guidance layer insert failed"):
        await provisioner.provision_workspace_layer(
            organization_id=organization_id,
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            conn=conn,
        )

    assert len(routers) == 1
    assert routers[0].bind_calls == [conn]
    assert restored_connections == []
