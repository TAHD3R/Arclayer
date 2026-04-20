from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.content.contracts.schema import ContentSeoProfileOut
from src.modules.workspaces.content.items.read_service import (
    WorkspaceContentCanonicalItemReadService,
)
from src.modules.workspaces.content.items.repository import WorkspaceContentItemsRepository
from src.modules.workspaces.content.shared.router import _resolve_site_id
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

seo_router = APIRouter(
    prefix="/_internal/workspace-content",
    tags=["domain.workspaces.content"],
    dependencies=[require_workspace_permission("system:content:read")],
)


def get_workspace_content_seo_service() -> WorkspaceContentCanonicalItemReadService:
    return WorkspaceContentCanonicalItemReadService(repo=WorkspaceContentItemsRepository())


@seo_router.get(
    "/items/{item_id}/versions/{version_number}/seo",
    response_model=ResponseModel[ContentSeoProfileOut],
    response_model_exclude_none=True,
    summary="Get rebuilt content SEO profile for a version (workspace RBAC protected)",
)
async def get_workspace_content_seo_profile(
    item_id: PublicUUID,
    version_number: int,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[
        WorkspaceContentCanonicalItemReadService,
        Depends(get_workspace_content_seo_service),
    ],
) -> ResponseModel[ContentSeoProfileOut]:
    """Get rebuilt content SEO profile for a version (workspace RBAC protected)."""
    data = await service.get_seo_profile(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        version_number=version_number,
    )
    return ApiResponse.success(data=data)
