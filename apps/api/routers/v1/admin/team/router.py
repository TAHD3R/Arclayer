from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends

from apps.api.config import Settings, get_settings
from apps.api.core.authz import require_permission_strict
from apps.api.core.i18n import get_current_locale
from apps.api.core.organization.deps import get_current_org_id
from apps.api.http_utils.pagination import PageData, PageParams, get_page_params
from apps.api.http_utils.response import Response, ResponseModel
from apps.api.routers.v1.admin.team.schema import (
    TeamInvitationCreateRequest,
    TeamInvitationCreateResult,
    TeamInvitationListQuery,
    TeamInvitationOut,
    TeamInvitationRenewRequest,
    TeamMemberListQuery,
    TeamMemberOut,
    TeamMemberRoleSetRequest,
)
from apps.api.routers.v1.admin.team.service import TeamService
from apps.api.routers.v1.auth.deps import get_current_user_id

router = APIRouter(tags=["Services: Team Collaboration"])


def get_team_service(settings: Settings = Depends(get_settings)) -> TeamService:
    return TeamService(settings)


@router.get(
    "/members",
    response_model=ResponseModel[PageData[TeamMemberOut]],
    dependencies=[require_permission_strict("team:members:read")],
)
async def list_members(
    organization_id: UUID = Depends(get_current_org_id),
    params: PageParams = Depends(get_page_params),
    filters: TeamMemberListQuery = Depends(),
    service: TeamService = Depends(get_team_service),
) -> ResponseModel[PageData[TeamMemberOut]]:
    page = await service.list_members(organization_id=organization_id, params=params, filters=filters)
    return Response.success(data=page)


@router.put(
    "/members/{membership_id}/roles",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("team:members:roles:manage")],
)
async def set_member_roles(
    membership_id: UUID,
    body: TeamMemberRoleSetRequest,
    organization_id: UUID = Depends(get_current_org_id),
    service: TeamService = Depends(get_team_service),
) -> ResponseModel[None]:
    await service.set_member_roles(organization_id=organization_id, membership_id=membership_id, payload=body)
    return Response.success()


@router.post(
    "/invitations",
    response_model=ResponseModel[TeamInvitationCreateResult],
    dependencies=[require_permission_strict("team:invitations:manage")],
)
async def create_invitation(
    body: TeamInvitationCreateRequest,
    background_tasks: BackgroundTasks,
    organization_id: UUID = Depends(get_current_org_id),
    user_id: UUID = Depends(get_current_user_id),
    service: TeamService = Depends(get_team_service),
) -> ResponseModel[TeamInvitationCreateResult]:
    created = await service.create_invitation(
        organization_id=organization_id,
        invited_by_user_id=user_id,
        payload=body,
    )
    if service.settings.email.enabled:
        locale = get_current_locale()
        background_tasks.add_task(
            service.send_invitation_email,
            organization_id=organization_id,
            recipient=created.invitation.email,
            token=created.token,
            invite_url=created.invite_url,
            expires_at=created.invitation.expires_at,
            invited_by_user_id=user_id,
            locale=locale,
        )
    return Response.success(data=created)


@router.get(
    "/invitations",
    response_model=ResponseModel[PageData[TeamInvitationOut]],
    dependencies=[require_permission_strict("team:invitations:manage")],
)
async def list_invitations(
    organization_id: UUID = Depends(get_current_org_id),
    params: PageParams = Depends(get_page_params),
    filters: TeamInvitationListQuery = Depends(),
    service: TeamService = Depends(get_team_service),
) -> ResponseModel[PageData[TeamInvitationOut]]:
    page = await service.list_invitations(organization_id=organization_id, params=params, filters=filters)
    return Response.success(data=page)


@router.post(
    "/invitations/{invitation_id}/revoke",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("team:invitations:manage")],
)
async def revoke_invitation(
    invitation_id: UUID,
    organization_id: UUID = Depends(get_current_org_id),
    service: TeamService = Depends(get_team_service),
) -> ResponseModel[None]:
    await service.revoke_invitation(organization_id=organization_id, invitation_id=invitation_id)
    return Response.success()


@router.post(
    "/invitations/{invitation_id}/renew",
    response_model=ResponseModel[TeamInvitationOut],
    dependencies=[require_permission_strict("team:invitations:manage")],
)
async def renew_invitation(
    invitation_id: UUID,
    body: TeamInvitationRenewRequest,
    organization_id: UUID = Depends(get_current_org_id),
    service: TeamService = Depends(get_team_service),
) -> ResponseModel[TeamInvitationOut]:
    inv = await service.renew_invitation(
        organization_id=organization_id,
        invitation_id=invitation_id,
        payload=body,
    )
    return Response.success(data=inv)


@router.delete(
    "/invitations/{invitation_id}",
    response_model=ResponseModel[None],
    dependencies=[require_permission_strict("team:invitations:manage")],
)
async def delete_invitation(
    invitation_id: UUID,
    organization_id: UUID = Depends(get_current_org_id),
    service: TeamService = Depends(get_team_service),
) -> ResponseModel[None]:
    await service.delete_invitation(organization_id=organization_id, invitation_id=invitation_id)
    return Response.success()
