from __future__ import annotations

from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.knowledge._enums import KnowledgeGuidanceScope, KnowledgeProjectGuidanceMode
from src.models.knowledge.guidance import KnowledgeGuidanceLayerRecord
from src.models.tenancy.workspace_tenant import WorkspaceTenantRecord
from src.modules.tenancy.database import TenantDatabaseRouter, set_public_search_path
from src.modules.tenancy.registry import WorkspaceTenantRegistryService
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope


class KnowledgeGuidanceLayerProvisioner(Protocol):
    async def provision_workspace_layer(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def provision_project_layer(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None: ...


class WorkspaceTenantRegistry(Protocol):
    async def ensure_ready_for_workspace(
        self,
        workspace_id: UUID,
        organization_id: UUID,
        *,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceTenantRecord: ...

    async def require_ready_for_workspace(
        self,
        workspace_id: UUID,
        organization_id: UUID,
        *,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceTenantRecord: ...


class TenantKnowledgeGuidanceLayerProvisioner:
    def __init__(self, *, registry: WorkspaceTenantRegistry) -> None:
        self._registry = registry

    async def provision_workspace_layer(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        tenant = await self._registry.ensure_ready_for_workspace(
            workspace_id=workspace_id,
            organization_id=organization_id,
            conn=conn,
        )
        await self._create_layer(
            tenant_context=self._tenant_context(
                organization_id=organization_id,
                workspace_id=workspace_id,
                tenant=tenant,
            ),
            workspace_id=workspace_id,
            scope_kind=KnowledgeGuidanceScope.WORKSPACE,
            scope_id=workspace_id,
            project_mode=None,
            actor_user_id=actor_user_id,
            conn=conn,
        )

    async def provision_project_layer(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        tenant = await self._registry.require_ready_for_workspace(
            workspace_id=workspace_id,
            organization_id=organization_id,
            conn=conn,
        )
        await self._create_layer(
            tenant_context=self._tenant_context(
                organization_id=organization_id,
                workspace_id=workspace_id,
                tenant=tenant,
            ).with_project(project_id=project_id),
            workspace_id=workspace_id,
            scope_kind=KnowledgeGuidanceScope.PROJECT,
            scope_id=project_id,
            project_mode=KnowledgeProjectGuidanceMode.SUPPLEMENT,
            actor_user_id=actor_user_id,
            conn=conn,
        )

    async def _create_layer(
        self,
        *,
        tenant_context: TenantContext,
        workspace_id: UUID,
        scope_kind: KnowledgeGuidanceScope,
        scope_id: UUID,
        project_mode: KnowledgeProjectGuidanceMode | None,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        tenant_conn = await TenantDatabaseRouter(tenant_context).bind(conn)
        await KnowledgeGuidanceLayerRecord.create(
            using_db=tenant_conn,
            workspace_id=workspace_id,
            scope_kind=scope_kind,
            scope_id=scope_id,
            project_mode=project_mode,
            metadata_revision=1,
            created_by_user_id=actor_user_id,
            updated_by_user_id=actor_user_id,
        )
        await set_public_search_path(conn)

    @staticmethod
    def _tenant_context(
        *,
        organization_id: UUID,
        workspace_id: UUID,
        tenant: WorkspaceTenantRecord,
    ) -> TenantContext:
        return TenantContext(
            identity=TenantIdentity(
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=None,
                runtime_id=None,
                site_id=None,
                schema_name=tenant.schema_name,
                isolation_mode=TenantIsolationMode(str(tenant.isolation_mode)),
            ),
            scope=TenantScope.WORKSPACE,
        )


def build_knowledge_guidance_layer_provisioner() -> KnowledgeGuidanceLayerProvisioner:
    return TenantKnowledgeGuidanceLayerProvisioner(registry=WorkspaceTenantRegistryService())
