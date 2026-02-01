from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from apps.api.config import Settings, get_settings
from apps.api.core.http.pagination import PageData, get_page_params
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.workspace.authz import require_workspace_permission
from apps.api.core.workspace.deps import WorkspaceContext, require_workspace_manage_access
from apps.api.routers.v1.auth.deps import get_current_user_id
from apps.api.routers.v1.workspaces.team.schema import (
    WorkspaceEmailInviteCreateRequest,
    WorkspaceEmailInviteCreateResult,
    WorkspaceEmailInviteOut,
    WorkspaceEmailInviteRenewRequest,
    WorkspaceInviteLinkCreateRequest,
    WorkspaceInviteLinkCreateResult,
    WorkspaceInviteLinkOut,
    WorkspaceInviteLinkRenewRequest,
    WorkspaceTeamMemberListQuery,
    WorkspaceTeamMemberOut,
    WorkspaceTeamMemberRoleSetRequest,
    WorkspaceTeamMemberStatusResult,
    WorkspaceTeamResetPasswordRequest,
    WorkspaceTeamUserUpdateRequest,
)
from apps.api.routers.v1.workspaces.team.service import WorkspaceTeamService

router = APIRouter(prefix="/workspaces/{workspace_id}/team", tags=["Workspace Team"])


@router.get(
    "/members",
    response_model=ResponseModel[PageData[WorkspaceTeamMemberOut]],
    summary="List workspace team members",
    dependencies=[require_workspace_permission("team:members:read")],
)
async def list_members(
    query: WorkspaceTeamMemberListQuery = Depends(),
    params=Depends(get_page_params),
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[WorkspaceTeamMemberOut]]:
    service = WorkspaceTeamService(settings)
    page = await service.list_members(workspace_id=ctx.workspace_id, params=params, filters=query)
    return Response.success(data=page)


@router.put(
    "/members/{membership_id}/roles",
    response_model=ResponseModel[None],
    summary="Set workspace member roles",
    dependencies=[require_workspace_permission("team:members:roles:manage")],
)
async def set_member_roles(
    membership_id: UUID,
    payload: WorkspaceTeamMemberRoleSetRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[None]:
    service = WorkspaceTeamService(settings)
    await service.set_member_roles(workspace_id=ctx.workspace_id, membership_id=membership_id, payload=payload)
    return Response.success()


@router.patch(
    "/members/{membership_id}",
    response_model=ResponseModel[WorkspaceTeamMemberOut],
    summary="Update member user profile (workspace-scoped)",
    dependencies=[require_workspace_permission("team:members:manage")],
)
async def update_member_user(
    membership_id: UUID,
    payload: WorkspaceTeamUserUpdateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceTeamMemberOut]:
    service = WorkspaceTeamService(settings)
    out = await service.update_member_user(workspace_id=ctx.workspace_id, membership_id=membership_id, payload=payload)
    return Response.success(data=out)


@router.post(
    "/members/{membership_id}/enable",
    response_model=ResponseModel[WorkspaceTeamMemberStatusResult],
    summary="Enable a member in current workspace",
    dependencies=[require_workspace_permission("team:members:manage")],
)
async def enable_member(
    membership_id: UUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceTeamMemberStatusResult]:
    service = WorkspaceTeamService(settings)
    out = await service.set_member_status(
        workspace_id=ctx.workspace_id,
        membership_id=membership_id,
        enabled=True,
        acting_user_id=user_id,
    )
    return Response.success(data=out)


@router.post(
    "/members/{membership_id}/disable",
    response_model=ResponseModel[WorkspaceTeamMemberStatusResult],
    summary="Disable a member in current workspace",
    dependencies=[require_workspace_permission("team:members:manage")],
)
async def disable_member(
    membership_id: UUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceTeamMemberStatusResult]:
    service = WorkspaceTeamService(settings)
    out = await service.set_member_status(
        workspace_id=ctx.workspace_id,
        membership_id=membership_id,
        enabled=False,
        acting_user_id=user_id,
    )
    return Response.success(data=out)


@router.post(
    "/members/{membership_id}/reset-password",
    response_model=ResponseModel[None],
    summary="Reset member password (workspace-scoped authorization)",
    dependencies=[require_workspace_permission("team:members:reset-password")],
)
async def reset_member_password(
    membership_id: UUID,
    payload: WorkspaceTeamResetPasswordRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[None]:
    service = WorkspaceTeamService(settings)
    await service.reset_member_password(workspace_id=ctx.workspace_id, membership_id=membership_id, payload=payload)
    return Response.success()


@router.post(
    "/email-invites",
    response_model=ResponseModel[WorkspaceEmailInviteCreateResult],
    summary="Create or update an email invite (pending unique per email)",
    dependencies=[require_workspace_permission("team:invitations:manage")],
)
async def create_email_invite(
    payload: WorkspaceEmailInviteCreateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceEmailInviteCreateResult]:
    service = WorkspaceTeamService(settings)
    out = await service.create_or_update_email_invite(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        invited_by_user_id=user_id,
        payload=payload,
    )
    return Response.success(data=out)


@router.get(
    "/email-invites",
    response_model=ResponseModel[PageData[WorkspaceEmailInviteOut]],
    summary="List email invites (pending/accepted/revoked/expired)",
    dependencies=[require_workspace_permission("team:invitations:manage")],
)
async def list_email_invites(
    q: str | None = Query(default=None, description="Search query (email/role_code)."),
    status: str | None = Query(default=None, description="pending|accepted|revoked|expired"),
    mine: bool | None = Query(default=None, description="Only mine"),
    params=Depends(get_page_params),
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[WorkspaceEmailInviteOut]]:
    service = WorkspaceTeamService(settings)
    page = await service.list_email_invites(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        params=params,
        q=q,
        status=status,
        mine=mine,
        current_user_id=user_id,
    )
    return Response.success(data=page)


@router.post(
    "/email-invites/{invite_id}/renew",
    response_model=ResponseModel[WorkspaceEmailInviteCreateResult],
    summary="Renew an email invite (extend expires_at only)",
    dependencies=[require_workspace_permission("team:invitations:manage")],
)
async def renew_email_invite(
    invite_id: UUID,
    payload: WorkspaceEmailInviteRenewRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceEmailInviteCreateResult]:
    service = WorkspaceTeamService(settings)
    out = await service.renew_email_invite(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        invite_id=invite_id,
        payload=payload,
        renewed_by_user_id=user_id,
    )
    return Response.success(data=out)


@router.delete(
    "/email-invites/{invite_id}",
    response_model=ResponseModel[None],
    summary="Revoke an email invite",
    dependencies=[require_workspace_permission("team:invitations:manage")],
)
async def revoke_email_invite(
    invite_id: UUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[None]:
    service = WorkspaceTeamService(settings)
    await service.revoke_email_invite(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        invite_id=invite_id,
        revoked_by_user_id=user_id,
    )
    return Response.success()


@router.post(
    "/invite-links",
    response_model=ResponseModel[WorkspaceInviteLinkCreateResult],
    summary="Create a reusable invite link",
    dependencies=[require_workspace_permission("team:invite-links:manage")],
)
async def create_invite_link(
    payload: WorkspaceInviteLinkCreateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceInviteLinkCreateResult]:
    service = WorkspaceTeamService(settings)
    out = await service.create_invite_link(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        created_by_user_id=user_id,
        payload=payload,
    )
    return Response.success(data=out)


@router.get(
    "/invite-links",
    response_model=ResponseModel[PageData[WorkspaceInviteLinkOut]],
    summary="List reusable invite links",
    dependencies=[require_workspace_permission("team:invite-links:manage")],
)
async def list_invite_links(
    q: str | None = Query(default=None, description="Search query (display_code/role_code)."),
    mine: bool | None = Query(default=None, description="Only mine"),
    params=Depends(get_page_params),
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[WorkspaceInviteLinkOut]]:
    service = WorkspaceTeamService(settings)
    page = await service.list_invite_links(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        params=params,
        q=q,
        mine=mine,
        current_user_id=user_id,
    )
    return Response.success(data=page)


@router.post(
    "/invite-links/{link_id}/renew",
    response_model=ResponseModel[WorkspaceInviteLinkCreateResult],
    summary="Renew invite link (extend expires_at only)",
    dependencies=[require_workspace_permission("team:invite-links:manage")],
)
async def renew_invite_link(
    link_id: UUID,
    payload: WorkspaceInviteLinkRenewRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceInviteLinkCreateResult]:
    service = WorkspaceTeamService(settings)
    out = await service.renew_invite_link(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        link_id=link_id,
        payload=payload,
    )
    return Response.success(data=out)


@router.post(
    "/invite-links/{link_id}/disable",
    response_model=ResponseModel[None],
    summary="Disable invite link",
    dependencies=[require_workspace_permission("team:invite-links:manage")],
)
async def disable_invite_link(
    link_id: UUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[None]:
    service = WorkspaceTeamService(settings)
    await service.disable_invite_link(
        organization_id=ctx.organization_id, workspace_id=ctx.workspace_id, link_id=link_id
    )
    return Response.success()
