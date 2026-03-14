from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.workspaces.authz.http.service import require_workspace_permission
from apps.api.src.modules.workspaces.content.contracts.schema import (
    ContentPresentationListOut,
)
from apps.api.src.modules.workspaces.content.items.read_service import (
    WorkspaceContentCanonicalItemReadService,
)
from apps.api.src.modules.workspaces.content.items.repository import WorkspaceContentItemsRepository
from apps.api.src.modules.workspaces.content.shared.router import _resolve_site_id
from apps.api.src.modules.workspaces.http.schema import WorkspaceContext
from apps.api.src.modules.workspaces.http.service import require_workspace_manage_access

presentations_router = APIRouter(
    prefix="/workspaces/{workspace_id}/content",
    tags=["Workspace: Content"],
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
    items = await service.list_presentations(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        version_number=version_number,
    )
    return Response.success(data=ContentPresentationListOut(items=items))
