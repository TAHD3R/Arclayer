from __future__ import annotations

from typing import Protocol
from uuid import UUID

from src.modules.assets.jobs.thumbnail_contract import AssetThumbnailOutcomeMarker
from src.modules.jobs.execution_errors import JobExecutionStateInvariantError
from src.modules.tenancy.router_helpers import job_tenant_scope
from src.modules.tenancy.schema import TenantContext, TenantScope


class AssetThumbnailRecoveryProjectResolver(Protocol):
    async def resolve_for_reconciliation(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
    ) -> TenantContext: ...


class AssetThumbnailRecoveryTenantRepository(Protocol):
    async def get_outcome_marker(
        self,
        *,
        project_id: UUID,
        asset_id: UUID,
    ) -> AssetThumbnailOutcomeMarker | None: ...


class RoutedAssetThumbnailRecoveryOutcomeRepository:
    """Read a tenant marker from an explicitly resolved maintenance Job scope."""

    __slots__ = ("_project_resolver", "_tenant_repository")

    def __init__(
        self,
        *,
        project_resolver: AssetThumbnailRecoveryProjectResolver,
        tenant_repository: AssetThumbnailRecoveryTenantRepository,
    ) -> None:
        self._project_resolver = project_resolver
        self._tenant_repository = tenant_repository

    async def get_outcome_marker(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        asset_id: UUID,
    ) -> AssetThumbnailOutcomeMarker | None:
        context = await self._project_resolver.resolve_for_reconciliation(
            workspace_id=workspace_id,
            project_id=project_id,
        )
        if context.scope != TenantScope.JOB or context.workspace_id != workspace_id or context.project_id != project_id:
            raise JobExecutionStateInvariantError(
                "Thumbnail recovery tenant scope differs from its canonical source project"
            )
        with job_tenant_scope(context):
            return await self._tenant_repository.get_outcome_marker(
                project_id=project_id,
                asset_id=asset_id,
            )
