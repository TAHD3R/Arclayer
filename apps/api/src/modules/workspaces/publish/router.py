from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.workspaces.authz.http.service import require_workspace_permission
from apps.api.src.modules.workspaces.content.shared.router import _resolve_site_id
from apps.api.src.modules.workspaces.http.schema import WorkspaceContext
from apps.api.src.modules.workspaces.http.service import require_workspace_manage_access
from apps.api.src.modules.workspaces.publish.export_service import WorkspacePublishExportService
from apps.api.src.modules.workspaces.publish.preview_service import WorkspacePublishPreviewService
from apps.api.src.modules.workspaces.publish.schema import (
    PublishArtifactsOut,
    PublishExportBundleOut,
    PublishExportContractOut,
    PublishExportTarget,
    PublishImpactOut,
)
from apps.api.src.modules.workspaces.publish.service import WorkspacePublishService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/publish",
    tags=["Workspace: Publish"],
    dependencies=[require_workspace_permission("system:content:read")],
)


def get_workspace_publish_service() -> WorkspacePublishService:
    return WorkspacePublishService()


def get_workspace_publish_preview_service() -> WorkspacePublishPreviewService:
    return WorkspacePublishPreviewService()


def get_workspace_publish_export_service(
    preview_service: Annotated[WorkspacePublishPreviewService, Depends(get_workspace_publish_preview_service)],
) -> WorkspacePublishExportService:
    return WorkspacePublishExportService(preview_service=preview_service)


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
    data = await service.preview_impact(workspace_id=ctx.workspace_id, site_id=site_id)
    return Response.success(data=data)


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
    data = await service.build_artifacts(workspace_id=ctx.workspace_id, site_id=site_id)
    return Response.success(data=data)


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
    data = await service.build_preview_contract(workspace_id=ctx.workspace_id, site_id=site_id)
    return Response.success(data=data)


@router.post(
    "/exports/{target}",
    response_model=ResponseModel[PublishExportBundleOut],
    response_model_exclude_none=True,
    summary="Build export bundle from publish contract",
    dependencies=[require_workspace_permission("system:content:publish")],
)
async def post_workspace_publish_export_bundle(
    target: PublishExportTarget,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspacePublishExportService, Depends(get_workspace_publish_export_service)],
) -> ResponseModel[PublishExportBundleOut]:
    data = await service.build_export_bundle(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        target=target,
    )
    return Response.success(data=data)
