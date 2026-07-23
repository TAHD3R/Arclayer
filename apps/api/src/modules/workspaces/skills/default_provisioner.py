from __future__ import annotations

from typing import Protocol
from uuid import UUID

from src.config import Settings
from src.models.skills._enums import SkillPackageScope
from src.modules.tenancy.router_helpers import ensure_workspace_tenant_context
from src.modules.workspaces.skills.lifecycle_repository import WorkspaceSkillLifecycleRepository
from src.modules.workspaces.skills.lifecycle_service import WorkspaceSkillLifecycleService
from src.modules.workspaces.skills.official_catalog_repository import OfficialSkillCatalogRepository
from src.modules.workspaces.skills.official_catalog_service import WorkspaceOfficialSkillCatalogService
from src.modules.workspaces.skills.repository import WorkspaceSkillsRepository
from src.modules.workspaces.skills.schema import SkillInstallationCreateRequest


class WorkspaceOfficialSkillProvisioner(Protocol):
    async def provision(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
    ) -> None: ...


class DefaultWorkspaceOfficialSkillProvisioner:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def provision(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
    ) -> None:
        tenant_context = await ensure_workspace_tenant_context(
            workspace_id=workspace_id,
            organization_id=organization_id,
        )
        lifecycle_repository = WorkspaceSkillLifecycleRepository(tenant_context)
        catalog_service = WorkspaceOfficialSkillCatalogService(
            catalog=OfficialSkillCatalogRepository(),
            installations=lifecycle_repository,
            settings=self._settings,
        )
        lifecycle_service = WorkspaceSkillLifecycleService(
            packages=WorkspaceSkillsRepository(tenant_context),
            lifecycle=lifecycle_repository,
            official_catalog=catalog_service,
            settings=self._settings,
        )
        page = await catalog_service.list_catalog(
            workspace_id=workspace_id,
            limit=100,
            cursor=None,
            query=None,
        )
        for item in page.items:
            target = await catalog_service.resolve_installation_target(
                package_id=UUID(str(item.package_id)),
                version_id=UUID(str(item.version_id)),
            )
            await lifecycle_service.create_installation(
                workspace_id=workspace_id,
                organization_id=organization_id,
                actor_user_id=actor_user_id,
                idempotency_key=f"official-default:{item.package_id}",
                payload=SkillInstallationCreateRequest(
                    package_scope=SkillPackageScope.SYSTEM,
                    package_id=item.package_id,
                    version_id=item.version_id,
                    expected_package_checksum=target.package_checksum,
                    validation_finding_hash=target.validation_finding_hash,
                    accepted_required_tools=tuple(tool.tool_id for tool in target.manifest.required_tools),
                    accepted_permissions=tuple(permission.action for permission in target.manifest.permissions),
                    accepted_data_egress=tuple(egress.destination for egress in target.manifest.data_egress),
                ),
            )


__all__ = [
    "DefaultWorkspaceOfficialSkillProvisioner",
    "WorkspaceOfficialSkillProvisioner",
]
