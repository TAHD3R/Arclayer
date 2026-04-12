from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.core.http.response import ApiResponse, ResponseModel
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.content.shared.router import _resolve_site_id
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access
from src.modules.workspaces.publish.preview_service import WorkspacePublishPreviewService
from src.modules.workspaces.publish.schema import (
    PublishArtifactsOut,
    PublishExportContractOut,
    PublishImpactOut,
)
from src.modules.workspaces.publish.service import WorkspacePublishService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/publish",
    tags=["domain.workspaces.publish"],
    dependencies=[require_workspace_permission("system:content:read")],
)


def get_workspace_publish_service() -> WorkspacePublishService:
    return WorkspacePublishService()


def get_workspace_publish_preview_service() -> WorkspacePublishPreviewService:
    return WorkspacePublishPreviewService()


@router.get(
    "/impact",
    response_model=ResponseModel[PublishImpactOut],
    response_model_exclude_none=True,
    summary="Preview publish impact (workspace RBAC protected)",
)
async def get_workspace_publish_impact(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspacePublishService, Depends(get_workspace_publish_service)],
) -> ResponseModel[PublishImpactOut]:
    """Preview publish impact (workspace RBAC protected)."""
    data = await service.preview_impact(workspace_id=ctx.workspace_id, site_id=site_id)
    return ApiResponse.success(data=data)


@router.post(
    "/artifacts",
    response_model=ResponseModel[PublishArtifactsOut],
    response_model_exclude_none=True,
    summary="Build published graph artifacts (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:publish")],
)
async def post_workspace_publish_artifacts(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspacePublishService, Depends(get_workspace_publish_service)],
) -> ResponseModel[PublishArtifactsOut]:
    """Build published graph artifacts (workspace RBAC protected)."""
    data = await service.build_artifacts(workspace_id=ctx.workspace_id, site_id=site_id)
    return ApiResponse.success(data=data)


@router.get(
    "/preview-contract",
    response_model=ResponseModel[PublishExportContractOut],
    response_model_exclude_none=True,
    summary="Read preview contract from publish artifacts",
)
async def get_workspace_publish_preview_contract(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspacePublishPreviewService, Depends(get_workspace_publish_preview_service)],
) -> ResponseModel[PublishExportContractOut]:
    """Read preview contract from publish artifacts."""
    data = await service.build_preview_contract(workspace_id=ctx.workspace_id, site_id=site_id)
    return ApiResponse.success(data=data)
