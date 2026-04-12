from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.content.contracts.schema import (
    ContentPresentationListOut,
)
from src.modules.workspaces.content.items.read_service import (
    WorkspaceContentCanonicalItemReadService,
)
from src.modules.workspaces.content.items.repository import WorkspaceContentItemsRepository
from src.modules.workspaces.content.shared.router import _resolve_site_id
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

presentations_router = APIRouter(
    prefix="/workspaces/{workspace_id}/content",
    tags=["domain.workspaces.content"],
    dependencies=[require_workspace_permission("system:content:read")],
)


def get_workspace_content_presentations_service() -> WorkspaceContentCanonicalItemReadService:
    return WorkspaceContentCanonicalItemReadService(repo=WorkspaceContentItemsRepository())


@presentations_router.get(
    "/items/{item_id}/versions/{version_number}/presentations",
    response_model=ResponseModel[ContentPresentationListOut],
    response_model_exclude_none=True,
    summary="List rebuilt content presentations for a version (workspace RBAC protected)",
)
async def list_workspace_content_presentations(
    item_id: PublicUUID,
    version_number: int,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[
        WorkspaceContentCanonicalItemReadService,
        Depends(get_workspace_content_presentations_service),
    ],
) -> ResponseModel[ContentPresentationListOut]:
    """List rebuilt content presentations for a version (workspace RBAC protected)."""
    items = await service.list_presentations(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        version_number=version_number,
    )
    return ApiResponse.success(data=ContentPresentationListOut(items=items))
