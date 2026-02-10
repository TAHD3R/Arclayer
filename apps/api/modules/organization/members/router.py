from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from apps.api.common.protocols.tortoise import HasOrganizationId, HasUserId
from apps.api.common.types.public_uuid import PublicUUID
from apps.api.config import Settings, get_settings
from apps.api.core.http.pagination import DependsPagination, PageData, PageParams
from apps.api.core.http.response import Response, ResponseModel
from apps.api.modules.organization.deps import get_current_org_membership
from apps.api.modules.organization.members.schema import (
    OrganizationMemberDeleteResult,
    OrganizationMemberInviteRequest,
    OrganizationMemberInviteResult,
    OrganizationMemberOut,
    OrganizationMemberRoleUpdateRequest,
)
from apps.api.modules.organization.members.service import OrganizationMemberService
from apps.api.modules.organization.models.org_membership import OrgMembership

router = APIRouter(prefix="/organizations/me", tags=["Organization"])


@router.get(
    "/members",
    response_model=ResponseModel[PageData[OrganizationMemberOut]],
    summary="List organization members",
)
async def list_organization_members(
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    params: PageParams = DependsPagination,
    q: str | None = Query(default=None, description="Search query by username/email/display name."),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[OrganizationMemberOut]]:
    service = OrganizationMemberService(settings)
    out = await service.list_members(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        params=params,
        q=q,
    )
    return Response.success(data=out)


@router.post(
    "/invitations",
    response_model=ResponseModel[OrganizationMemberInviteResult],
    summary="Invite organization member",
)
async def invite_organization_member(
    payload: OrganizationMemberInviteRequest,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationMemberInviteResult]:
    service = OrganizationMemberService(settings)
    out = await service.invite_member(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        actor_user_id=UUID(str(cast(HasUserId, orgm).user_id)),
        actor_role=orgm.role,
        payload=payload,
    )
    return Response.success(data=out)


@router.patch(
    "/members/{member_id}/role",
    response_model=ResponseModel[OrganizationMemberOut],
    summary="Update organization member role",
)
async def patch_organization_member_role(
    member_id: PublicUUID,
    payload: OrganizationMemberRoleUpdateRequest,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationMemberOut]:
    service = OrganizationMemberService(settings)
    out = await service.update_member_role(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        actor_membership=orgm,
        target_membership_id=UUID(str(member_id)),
        role=payload.role,
    )
    return Response.success(data=out)


@router.delete(
    "/members/{member_id}",
    response_model=ResponseModel[OrganizationMemberDeleteResult],
    summary="Remove organization member",
)
async def delete_organization_member(
    member_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationMemberDeleteResult]:
    service = OrganizationMemberService(settings)
    out = await service.remove_member(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        actor_membership=orgm,
        target_membership_id=UUID(str(member_id)),
    )
    return Response.success(data=out)
