from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.config import Settings, get_settings
from apps.api.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.core.http.response import Response, ResponseModel
from apps.api.modules.assets.admin.shares.schema import AdminShareCreateRequest, AdminShareLinkOut, AdminShareRevokeOut
from apps.api.modules.assets.admin.shares.service import AdminSharesService
from apps.api.modules.auth.deps import get_current_user
from apps.api.modules.workspaces.authz.deps import require_workspace_permission
from apps.api.modules.workspaces.deps import WorkspaceContext, require_workspace_manage_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}",
    tags=["Workspace: Share Links"],
    dependencies=[require_workspace_permission("admin:access")],
)


def get_admin_shares_service(settings: Settings = Depends(get_settings)) -> AdminSharesService:
    return AdminSharesService(settings)


@router.get(
    "/assets/{asset_id}/share-links",
    response_model=ResponseModel[PageData[AdminShareLinkOut]],
    summary="List share links for asset",
)
async def list_share_links(
    asset_id: UUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    _user=Depends(get_current_user),
    params: PageParams = Depends(get_page_params),
    service: AdminSharesService = Depends(get_admin_shares_service),
) -> ResponseModel[PageData[AdminShareLinkOut]]:
    page = await service.list_share_links(workspace_id=ctx.workspace_id, asset_id=asset_id, params=params)
    return Response.success(data=page)


@router.post(
    "/assets/{asset_id}/share-links",
    response_model=ResponseModel[AdminShareLinkOut],
    summary="Create share link for asset",
)
async def create_share_link(
    asset_id: UUID,
    payload: AdminShareCreateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user=Depends(get_current_user),
    service: AdminSharesService = Depends(get_admin_shares_service),
) -> ResponseModel[AdminShareLinkOut]:
    link = await service.create_share_link(
        workspace_id=ctx.workspace_id,
        asset_id=asset_id,
        created_by_user_id=user.id,
        expires_in_seconds=payload.expires_in_seconds,
    )
    return Response.success(data=AdminShareLinkOut.model_validate(link, from_attributes=True))


@router.post(
    "/share-links/{link_id}/revoke",
    response_model=ResponseModel[AdminShareRevokeOut],
    summary="Revoke share link",
)
async def revoke_share_link(
    link_id: UUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    _user=Depends(get_current_user),
    service: AdminSharesService = Depends(get_admin_shares_service),
) -> ResponseModel[AdminShareRevokeOut]:
    link = await service.revoke_share_link(workspace_id=ctx.workspace_id, link_id=link_id)
    revoked_at = link.revoked_at
    if revoked_at is None:
        raise RuntimeError("Share link revoked_at is missing after revoke operation")
    return Response.success(data=AdminShareRevokeOut(id=link.id, revoked_at=revoked_at))
