from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.content.contracts.schema import ContentComponentBindingListOut
from src.modules.workspaces.content.items.read_service import (
    WorkspaceContentCanonicalItemReadService,
)
from src.modules.workspaces.content.items.repository import WorkspaceContentItemsRepository
from src.modules.workspaces.content.shared.router import _resolve_site_id
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

bindings_router = APIRouter(
    prefix="/workspaces/{workspace_id}/content",
    tags=["domain.workspaces.content"],
    dependencies=[require_workspace_permission("system:content:read")],
)


def get_workspace_content_bindings_service() -> WorkspaceContentCanonicalItemReadService:
    return WorkspaceContentCanonicalItemReadService(repo=WorkspaceContentItemsRepository())


@bindings_router.get(
    "/items/{item_id}/versions/{version_number}/bindings",
    response_model=ResponseModel[ContentComponentBindingListOut],
    response_model_exclude_none=True,
    summary="List rebuilt component bindings for a version (workspace RBAC protected)",
)
async def list_workspace_content_bindings(
    item_id: PublicUUID,
    version_number: int,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[
        WorkspaceContentCanonicalItemReadService,
        Depends(get_workspace_content_bindings_service),
    ],
) -> ResponseModel[ContentComponentBindingListOut]:
    """List rebuilt component bindings for a version (workspace RBAC protected)."""
    items = await service.list_component_bindings(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        version_number=version_number,
    )
    return ApiResponse.success(data=ContentComponentBindingListOut(items=items))
