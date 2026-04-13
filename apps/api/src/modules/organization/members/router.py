from __future__ import annotations

from datetime import datetime
from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from src.common.protocols.tortoise import HasOrganizationId
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import BadRequest
from src.core.http.pagination import DependsPagination, PageData, PageParams
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.user import UserStatus
from src.modules.organization.http.service import get_current_org_membership
from src.modules.organization.members.schema import (
    OrganizationInvitationOut,
    OrganizationInvitationRenewRequest,
    OrganizationInvitationRenewResult,
    OrganizationInvitationRevokeResult,
    OrganizationInviteLinkCreateRequest,
    OrganizationInviteLinkCreateResult,
    OrganizationInviteLinkOut,
    OrganizationInviteLinkParticipantOut,
    OrganizationInviteLinkRenewResult,
    OrganizationMemberDeleteResult,
    OrganizationMemberInviteRequest,
    OrganizationMemberInviteResult,
    OrganizationMemberOut,
    OrganizationMemberRoleUpdateRequest,
)
from src.modules.organization.members.service import OrganizationMemberService

router = APIRouter(prefix="/organizations/me", tags=["domain.organization.members"])


@router.get(
    "/members",
    response_model=ResponseModel[PageData[OrganizationMemberOut]],
    summary="List organization members",
)
async def list_organization_members(
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    params: PageParams = DependsPagination,
    q: str | None = Query(default=None, description="Search query by username/email/display name."),
    ordering: str | None = Query(
        default=None,
        description="Ordering fields, e.g. -joined_at, email.",
    ),
    role: OrgRole | None = Query(default=None, description="Filter by organization role."),
    role_code: str | None = Query(
        default=None,
        alias="roleCode",
        description="Filter by effective organization role code.",
    ),
    membership_status: str | None = Query(
        default=None,
        alias="membershipStatus",
        description="Filter by organization membership status.",
    ),
    user_status: UserStatus | None = Query(
        default=None,
        alias="userStatus",
        description="Filter by user account status.",
    ),
    has_workspace: bool | None = Query(
        default=None,
        alias="hasWorkspace",
        description="Filter by whether user is associated with workspaces.",
    ),
    joined_from: datetime | None = Query(
        default=None,
        alias="joinedFrom",
        description="Filter members joined at or after this ISO datetime.",
    ),
    joined_to: datetime | None = Query(
        default=None,
        alias="joinedTo",
        description="Filter members joined at or before this ISO datetime.",
    ),
    last_login_from: datetime | None = Query(
        default=None,
        alias="lastLoginFrom",
        description="Filter members with last login at or after this ISO datetime.",
    ),
    last_login_to: datetime | None = Query(
        default=None,
        alias="lastLoginTo",
        description="Filter members with last login at or before this ISO datetime.",
    ),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[OrganizationMemberOut]]:
    """List organization members."""
    service = OrganizationMemberService(settings)
    out = await service.list_members(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        actor_membership=orgm,
        params=params,
        q=q,
        ordering=ordering,
        role=role,
        role_code=role_code,
        membership_status=membership_status,
        user_status=user_status,
        has_workspace=has_workspace,
        joined_from=joined_from,
        joined_to=joined_to,
        last_login_from=last_login_from,
        last_login_to=last_login_to,
    )
    return ApiResponse.success(data=out)


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
    """Invite organization member."""
    service = OrganizationMemberService(settings)
    if not await service.email_service.is_enabled():
        raise BadRequest(
            message=t("settings", "MAIL_DISABLED"),
            error="MAIL_DISABLED",
        )
    out = await service.invite_member(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        actor_membership=orgm,
        payload=payload,
    )
    return ApiResponse.success(data=out)


@router.get(
    "/invitations",
    response_model=ResponseModel[PageData[OrganizationInvitationOut]],
    summary="List organization invitations",
)
async def list_organization_invitations(
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    params: PageParams = DependsPagination,
    q: str | None = Query(default=None, description="Search query by email/role."),
    ordering: str | None = Query(
        default=None,
        description="Ordering fields, e.g. -created_at, email.",
    ),
    status: str | None = Query(default=None, description="Filter by invitation status."),
    mine: bool | None = Query(default=None, description="If true, only invitations created by me."),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[OrganizationInvitationOut]]:
    """List organization invitations."""
    service = OrganizationMemberService(settings)
    out = await service.list_invitations(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        actor_membership=orgm,
        params=params,
        q=q,
        ordering=ordering,
        status=status,
        mine=mine,
    )
    return ApiResponse.success(data=out)


@router.post(
    "/invitations/{invitation_id}/renew",
    response_model=ResponseModel[OrganizationInvitationRenewResult],
    summary="Renew organization invitation",
)
async def renew_organization_invitation(
    invitation_id: PublicUUID,
    payload: OrganizationInvitationRenewRequest,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationInvitationRenewResult]:
    """Renew organization invitation."""
    service = OrganizationMemberService(settings)
    out = await service.renew_invitation(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        actor_membership=orgm,
        invitation_id=UUID(str(invitation_id)),
        expires_in_seconds=payload.expires_in_seconds,
    )
    return ApiResponse.success(data=out)


@router.post(
    "/invitations/{invitation_id}/revoke",
    response_model=ResponseModel[OrganizationInvitationRevokeResult],
    summary="Revoke organization invitation",
)
async def revoke_organization_invitation(
    invitation_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationInvitationRevokeResult]:
    """Revoke organization invitation."""
    service = OrganizationMemberService(settings)
    revoked = await service.revoke_invitation(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        actor_membership=orgm,
        invitation_id=UUID(str(invitation_id)),
    )
    return ApiResponse.success(
        data=OrganizationInvitationRevokeResult(invitation_id=UUID(str(invitation_id)), revoked=revoked)
    )


@router.post(
    "/invitations/links",
    response_model=ResponseModel[OrganizationInviteLinkCreateResult],
    summary="Create organization invite link",
)
async def create_organization_invite_link(
    payload: OrganizationInviteLinkCreateRequest,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationInviteLinkCreateResult]:
    """Create organization invite link."""
    service = OrganizationMemberService(settings)
    out = await service.create_invite_link(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        actor_membership=orgm,
        payload=payload,
    )
    return ApiResponse.success(data=out)


@router.get(
    "/invitations/links",
    response_model=ResponseModel[PageData[OrganizationInviteLinkOut]],
    summary="List organization invite links",
)
async def list_organization_invite_links(
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    params: PageParams = DependsPagination,
    q: str | None = Query(default=None, description="Search query by code/domain/role."),
    ordering: str | None = Query(
        default=None,
        description="Ordering fields, e.g. -created_at, display_code.",
    ),
    mine: bool | None = Query(default=None, description="If true, only links created by me."),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[OrganizationInviteLinkOut]]:
    """List organization invite links."""
    service = OrganizationMemberService(settings)
    out = await service.list_invite_links(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        actor_membership=orgm,
        params=params,
        q=q,
        ordering=ordering,
        mine=mine,
    )
    return ApiResponse.success(data=out)


@router.post(
    "/invitations/links/{link_id}/renew",
    response_model=ResponseModel[OrganizationInviteLinkRenewResult],
    summary="Renew organization invite link",
)
async def renew_organization_invite_link(
    link_id: PublicUUID,
    payload: OrganizationInvitationRenewRequest,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationInviteLinkRenewResult]:
    """Renew organization invite link."""
    service = OrganizationMemberService(settings)
    out = await service.renew_invite_link(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        actor_membership=orgm,
        link_id=UUID(str(link_id)),
        expires_in_seconds=payload.expires_in_seconds,
    )
    return ApiResponse.success(data=out)


@router.post(
    "/invitations/links/{link_id}/disable",
    response_model=ResponseModel[OrganizationInvitationRevokeResult],
    summary="Disable organization invite link",
)
async def disable_organization_invite_link(
    link_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationInvitationRevokeResult]:
    """Disable organization invite link."""
    service = OrganizationMemberService(settings)
    revoked = await service.disable_invite_link(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        actor_membership=orgm,
        link_id=UUID(str(link_id)),
    )
    return ApiResponse.success(
        data=OrganizationInvitationRevokeResult(invitation_id=UUID(str(link_id)), revoked=revoked)
    )


@router.get(
    "/invitations/links/{link_id}/participants",
    response_model=ResponseModel[PageData[OrganizationInviteLinkParticipantOut]],
    summary="List organization invite-link participants",
)
async def list_organization_invite_link_participants(
    link_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    params: PageParams = DependsPagination,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[OrganizationInviteLinkParticipantOut]]:
    """List organization invite-link participants."""
    service = OrganizationMemberService(settings)
    out = await service.list_invite_link_participants(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        actor_membership=orgm,
        link_id=UUID(str(link_id)),
        params=params,
    )
    return ApiResponse.success(data=out)


@router.patch(
    "/members/{membership_id}/role",
    response_model=ResponseModel[OrganizationMemberOut],
    summary="Update organization member role",
)
async def patch_organization_member_role(
    membership_id: PublicUUID,
    payload: OrganizationMemberRoleUpdateRequest,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationMemberOut]:
    """Update organization member role."""
    service = OrganizationMemberService(settings)
    out = await service.update_member_role(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        actor_membership=orgm,
        target_membership_id=UUID(str(membership_id)),
        role_code=str(payload.role_code),
    )
    return ApiResponse.success(data=out)


@router.delete(
    "/members/{membership_id}",
    response_model=ResponseModel[OrganizationMemberDeleteResult],
    summary="Remove organization member",
)
async def delete_organization_member(
    membership_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationMemberDeleteResult]:
    """Remove organization member."""
    service = OrganizationMemberService(settings)
    out = await service.remove_member(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        actor_membership=orgm,
        target_membership_id=UUID(str(membership_id)),
    )
    return ApiResponse.success(data=out)
