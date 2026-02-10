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
from apps.api.modules.organization.models.org_membership import OrgMembership
from apps.api.modules.organization.workspaces.schema import (
    OrganizationWorkspaceArchiveResult,
    OrganizationWorkspaceCreateRequest,
    OrganizationWorkspaceDeleteResult,
    OrganizationWorkspaceMemberOut,
    OrganizationWorkspaceOut,
)
from apps.api.modules.organization.workspaces.service import OrganizationWorkspaceService

router = APIRouter(prefix="/organizations/me/workspaces", tags=["Organization"])


@router.get(
    "",
    response_model=ResponseModel[PageData[OrganizationWorkspaceOut]],
    summary="List organization workspaces",
)
async def list_organization_workspaces(
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    params: PageParams = DependsPagination,
    q: str | None = Query(default=None, description="Search query by workspace name/slug."),
    archived: bool | None = Query(
        default=None,
        description="Filter archived status when provided.",
    ),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[OrganizationWorkspaceOut]]:
    service = OrganizationWorkspaceService(settings)
    data = await service.list_workspaces(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        user_id=UUID(str(cast(HasUserId, orgm).user_id)),
        org_role=orgm.role,
        params=params,
        q=q,
        archived=archived,
    )
    return Response.success(data=data)


@router.get(
    "/{workspace_id}/members",
    response_model=ResponseModel[PageData[OrganizationWorkspaceMemberOut]],
    summary="List workspace members from organization scope",
)
async def list_organization_workspace_members(
    workspace_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    params: PageParams = DependsPagination,
    q: str | None = Query(default=None, description="Search query by name/email."),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[OrganizationWorkspaceMemberOut]]:
    service = OrganizationWorkspaceService(settings)
    data = await service.list_workspace_members(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        workspace_id=UUID(str(workspace_id)),
        user_id=UUID(str(cast(HasUserId, orgm).user_id)),
        org_role=orgm.role,
        params=params,
        q=q,
    )
    return Response.success(data=data)


@router.post(
    "",
    response_model=ResponseModel[OrganizationWorkspaceOut],
    summary="Create organization workspace",
)
async def create_organization_workspace(
    payload: OrganizationWorkspaceCreateRequest,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationWorkspaceOut]:
    service = OrganizationWorkspaceService(settings)
    out = await service.create_workspace(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        user_id=UUID(str(cast(HasUserId, orgm).user_id)),
        org_role=orgm.role,
        payload=payload,
    )
    return Response.success(data=out)


@router.post(
    "/{workspace_id}/archive",
    response_model=ResponseModel[OrganizationWorkspaceArchiveResult],
    summary="Archive organization workspace",
)
async def archive_organization_workspace(
    workspace_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationWorkspaceArchiveResult]:
    service = OrganizationWorkspaceService(settings)
    out = await service.archive_workspace(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        workspace_id=UUID(str(workspace_id)),
        user_id=UUID(str(cast(HasUserId, orgm).user_id)),
        org_role=orgm.role,
    )
    return Response.success(data=out)


@router.post(
    "/{workspace_id}/unarchive",
    response_model=ResponseModel[OrganizationWorkspaceArchiveResult],
    summary="Unarchive organization workspace",
)
async def unarchive_organization_workspace(
    workspace_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationWorkspaceArchiveResult]:
    service = OrganizationWorkspaceService(settings)
    out = await service.unarchive_workspace(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        workspace_id=UUID(str(workspace_id)),
        user_id=UUID(str(cast(HasUserId, orgm).user_id)),
        org_role=orgm.role,
    )
    return Response.success(data=out)


@router.delete(
    "/{workspace_id}",
    response_model=ResponseModel[OrganizationWorkspaceDeleteResult],
    summary="Delete organization workspace",
)
async def delete_organization_workspace(
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
    service = OrganizationWorkspaceService(settings)
    out = await service.delete_workspace(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        workspace_id=UUID(str(workspace_id)),
        user_id=UUID(str(cast(HasUserId, orgm).user_id)),
        org_role=orgm.role,
        confirm_name=confirm_name or "",
    )
    return Response.success(data=out)
