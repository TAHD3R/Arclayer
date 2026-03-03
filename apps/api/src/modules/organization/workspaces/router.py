from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from apps.api.src.common.protocols.tortoise import HasOrganizationId, HasUserId
from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.config import Settings, get_settings
from apps.api.src.core.http.pagination import DependsPagination, PageData, PageParams
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.organization.deps import (
    get_current_org_membership,
    get_org_membership_for_organization,
)
from apps.api.src.modules.organization.models.org_membership import OrgMembership
from apps.api.src.modules.organization.workspaces.schema import (
    OrganizationWorkspaceArchiveResult,
    OrganizationWorkspaceCreateRequest,
    OrganizationWorkspaceDeleteResult,
    OrganizationWorkspaceMemberOut,
    OrganizationWorkspaceOut,
)
from apps.api.src.modules.organization.workspaces.service import OrganizationWorkspaceService

router = APIRouter(tags=["Organization"])


def _org_id(orgm: OrgMembership) -> UUID:
    return UUID(str(cast(HasOrganizationId, orgm).organization_id))


def _user_id(orgm: OrgMembership) -> UUID:
    return UUID(str(cast(HasUserId, orgm).user_id))


async def _list_workspaces(
    *,
    orgm: OrgMembership,
    params: PageParams,
    q: str | None,
    ordering: str | None,
    archived: bool | None,
    enterable_only: bool,
    settings: Settings,
) -> ResponseModel[PageData[OrganizationWorkspaceOut]]:
    service = OrganizationWorkspaceService(settings)
    data = await service.list_workspaces(
        organization_id=_org_id(orgm),
        user_id=_user_id(orgm),
        org_role=orgm.role,
        params=params,
        q=q,
        ordering=ordering,
        archived=archived,
        enterable_only=enterable_only,
    )
    return Response.success(data=data)


async def _list_workspace_members(
    *,
    workspace_id: PublicUUID,
    orgm: OrgMembership,
    params: PageParams,
    q: str | None,
    settings: Settings,
) -> ResponseModel[PageData[OrganizationWorkspaceMemberOut]]:
    service = OrganizationWorkspaceService(settings)
    data = await service.list_workspace_members(
        organization_id=_org_id(orgm),
        workspace_id=UUID(str(workspace_id)),
        user_id=_user_id(orgm),
        org_role=orgm.role,
        params=params,
        q=q,
    )
    return Response.success(data=data)


async def _create_workspace(
    *,
    payload: OrganizationWorkspaceCreateRequest,
    orgm: OrgMembership,
    settings: Settings,
) -> ResponseModel[OrganizationWorkspaceOut]:
    service = OrganizationWorkspaceService(settings)
    out = await service.create_workspace(
        organization_id=_org_id(orgm),
        user_id=_user_id(orgm),
        org_role=orgm.role,
        payload=payload,
    )
    return Response.success(data=out)


async def _archive_workspace(
    *,
    workspace_id: PublicUUID,
    orgm: OrgMembership,
    settings: Settings,
) -> ResponseModel[OrganizationWorkspaceArchiveResult]:
    service = OrganizationWorkspaceService(settings)
    out = await service.archive_workspace(
        organization_id=_org_id(orgm),
        workspace_id=UUID(str(workspace_id)),
        user_id=_user_id(orgm),
        org_role=orgm.role,
    )
    return Response.success(data=out)


async def _unarchive_workspace(
    *,
    workspace_id: PublicUUID,
    orgm: OrgMembership,
    settings: Settings,
) -> ResponseModel[OrganizationWorkspaceArchiveResult]:
    service = OrganizationWorkspaceService(settings)
    out = await service.unarchive_workspace(
        organization_id=_org_id(orgm),
        workspace_id=UUID(str(workspace_id)),
        user_id=_user_id(orgm),
        org_role=orgm.role,
    )
    return Response.success(data=out)


async def _delete_workspace(
    *,
    workspace_id: PublicUUID,
    orgm: OrgMembership,
    confirm_name: str,
    settings: Settings,
) -> ResponseModel[OrganizationWorkspaceDeleteResult]:
    service = OrganizationWorkspaceService(settings)
    out = await service.delete_workspace(
        organization_id=_org_id(orgm),
        workspace_id=UUID(str(workspace_id)),
        user_id=_user_id(orgm),
        org_role=orgm.role,
        confirm_name=confirm_name,
    )
    return Response.success(data=out)


@router.get(
    "/organizations/me/workspaces",
    response_model=ResponseModel[PageData[OrganizationWorkspaceOut]],
    summary="List organization workspaces",
)
async def list_organization_workspaces_me(
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    params: PageParams = DependsPagination,
    q: str | None = Query(default=None, description="Search query by workspace name or slug."),
    ordering: str | None = Query(default=None, description="Ordering fields, e.g. -created_at, name."),
    archived: bool | None = Query(default=None, description="Filter archived status when provided."),
    enterable_only: bool = Query(default=False, description="Only include enterable workspaces."),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[OrganizationWorkspaceOut]]:
    return await _list_workspaces(
        orgm=orgm,
        params=params,
        q=q,
        ordering=ordering,
        archived=archived,
        enterable_only=enterable_only,
        settings=settings,
    )


@router.get(
    "/organizations/{organization_id}/workspaces",
    response_model=ResponseModel[PageData[OrganizationWorkspaceOut]],
    summary="List organization workspaces by organization id",
)
async def list_organization_workspaces_by_org(
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    params: PageParams = DependsPagination,
    q: str | None = Query(default=None, description="Search query by workspace name or slug."),
    ordering: str | None = Query(default=None, description="Ordering fields, e.g. -created_at, name."),
    archived: bool | None = Query(default=None, description="Filter archived status when provided."),
    enterable_only: bool = Query(default=False, description="Only include enterable workspaces."),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[OrganizationWorkspaceOut]]:
    return await _list_workspaces(
        orgm=orgm,
        params=params,
        q=q,
        ordering=ordering,
        archived=archived,
        enterable_only=enterable_only,
        settings=settings,
    )


@router.get(
    "/organizations/me/workspaces/{workspace_id}/members",
    response_model=ResponseModel[PageData[OrganizationWorkspaceMemberOut]],
    summary="List workspace members from organization scope",
)
async def list_organization_workspace_members_me(
    workspace_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    params: PageParams = DependsPagination,
    q: str | None = Query(default=None, description="Search query by name or email."),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[OrganizationWorkspaceMemberOut]]:
    return await _list_workspace_members(
        workspace_id=workspace_id,
        orgm=orgm,
        params=params,
        q=q,
        settings=settings,
    )


@router.get(
    "/organizations/{organization_id}/workspaces/{workspace_id}/members",
    response_model=ResponseModel[PageData[OrganizationWorkspaceMemberOut]],
    summary="List workspace members from organization scope by organization id",
)
async def list_organization_workspace_members_by_org(
    workspace_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    params: PageParams = DependsPagination,
    q: str | None = Query(default=None, description="Search query by name or email."),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[OrganizationWorkspaceMemberOut]]:
    return await _list_workspace_members(
        workspace_id=workspace_id,
        orgm=orgm,
        params=params,
        q=q,
        settings=settings,
    )


@router.post(
    "/organizations/me/workspaces",
    response_model=ResponseModel[OrganizationWorkspaceOut],
    summary="Create organization workspace",
)
async def create_organization_workspace_me(
    payload: OrganizationWorkspaceCreateRequest,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationWorkspaceOut]:
    return await _create_workspace(payload=payload, orgm=orgm, settings=settings)


@router.post(
    "/organizations/{organization_id}/workspaces",
    response_model=ResponseModel[OrganizationWorkspaceOut],
    summary="Create organization workspace by organization id",
)
async def create_organization_workspace_by_org(
    payload: OrganizationWorkspaceCreateRequest,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationWorkspaceOut]:
    return await _create_workspace(payload=payload, orgm=orgm, settings=settings)


@router.post(
    "/organizations/me/workspaces/{workspace_id}/archive",
    response_model=ResponseModel[OrganizationWorkspaceArchiveResult],
    summary="Archive organization workspace",
)
async def archive_organization_workspace_me(
    workspace_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationWorkspaceArchiveResult]:
    return await _archive_workspace(workspace_id=workspace_id, orgm=orgm, settings=settings)


@router.post(
    "/organizations/{organization_id}/workspaces/{workspace_id}/archive",
    response_model=ResponseModel[OrganizationWorkspaceArchiveResult],
    summary="Archive organization workspace by organization id",
)
async def archive_organization_workspace_by_org(
    workspace_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationWorkspaceArchiveResult]:
    return await _archive_workspace(workspace_id=workspace_id, orgm=orgm, settings=settings)


@router.post(
    "/organizations/me/workspaces/{workspace_id}/unarchive",
    response_model=ResponseModel[OrganizationWorkspaceArchiveResult],
    summary="Unarchive organization workspace",
)
async def unarchive_organization_workspace_me(
    workspace_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationWorkspaceArchiveResult]:
    return await _unarchive_workspace(workspace_id=workspace_id, orgm=orgm, settings=settings)


@router.post(
    "/organizations/{organization_id}/workspaces/{workspace_id}/unarchive",
    response_model=ResponseModel[OrganizationWorkspaceArchiveResult],
    summary="Unarchive organization workspace by organization id",
)
async def unarchive_organization_workspace_by_org(
    workspace_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationWorkspaceArchiveResult]:
    return await _unarchive_workspace(workspace_id=workspace_id, orgm=orgm, settings=settings)


@router.delete(
    "/organizations/me/workspaces/{workspace_id}",
    response_model=ResponseModel[OrganizationWorkspaceDeleteResult],
    summary="Delete organization workspace",
)
async def delete_organization_workspace_me(
    workspace_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    confirm_name: str | None = Query(
        default=None,
        alias="confirmName",
        description="Workspace name confirmation for destructive delete.",
        min_length=1,
        max_length=128,
    ),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationWorkspaceDeleteResult]:
    return await _delete_workspace(
        workspace_id=workspace_id,
        orgm=orgm,
        confirm_name=confirm_name or "",
        settings=settings,
    )


@router.delete(
    "/organizations/{organization_id}/workspaces/{workspace_id}",
    response_model=ResponseModel[OrganizationWorkspaceDeleteResult],
    summary="Delete organization workspace by organization id",
)
async def delete_organization_workspace_by_org(
    workspace_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    confirm_name: str | None = Query(
        default=None,
        alias="confirmName",
        description="Workspace name confirmation for destructive delete.",
        min_length=1,
        max_length=128,
    ),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationWorkspaceDeleteResult]:
    return await _delete_workspace(
        workspace_id=workspace_id,
        orgm=orgm,
        confirm_name=confirm_name or "",
        settings=settings,
    )
