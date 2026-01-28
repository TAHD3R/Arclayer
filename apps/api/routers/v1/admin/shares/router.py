from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.config import Settings, get_settings
from apps.api.core.organization.deps import get_current_org_id
from apps.api.http.response import Response, ResponseModel
from apps.api.routers.v1.admin.shares.schema import AdminShareCreateRequest, AdminShareLinkOut, AdminShareRevokeOut
from apps.api.routers.v1.admin.shares.service import AdminSharesService
from apps.api.routers.v1.auth.deps import get_current_user

router = APIRouter(tags=["Services: Share Links"])


def get_admin_shares_service(settings: Settings = Depends(get_settings)) -> AdminSharesService:
    return AdminSharesService(settings)


@router.post("/assets/{asset_id}/share-links", response_model=ResponseModel[AdminShareLinkOut])
async def create_share_link(
    asset_id: UUID,
    payload: AdminShareCreateRequest,
    org_id: UUID = Depends(get_current_org_id),
    user=Depends(get_current_user),
    service: AdminSharesService = Depends(get_admin_shares_service),
) -> ResponseModel[AdminShareLinkOut]:
    link = await service.create_share_link(
        org_id=org_id,
        asset_id=asset_id,
        created_by_user_id=user.id,
        expires_in_seconds=payload.expires_in_seconds,
    )
    return Response.success(data=AdminShareLinkOut.model_validate(link, from_attributes=True))


@router.post("/share-links/{link_id}/revoke", response_model=ResponseModel[AdminShareRevokeOut])
async def revoke_share_link(
    link_id: UUID,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: AdminSharesService = Depends(get_admin_shares_service),
) -> ResponseModel[AdminShareRevokeOut]:
    link = await service.revoke_share_link(org_id=org_id, link_id=link_id)
    return Response.success(data=AdminShareRevokeOut(id=link.id, revoked_at=link.revoked_at))
