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
    OrganizationWorkspaceCreateRequest,
    OrganizationWorkspaceDeleteResult,
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
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[OrganizationWorkspaceOut]]:
    service = OrganizationWorkspaceService(settings)
    data = await service.list_workspaces(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
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


@router.delete(
    "/{workspace_id}",
    response_model=ResponseModel[OrganizationWorkspaceDeleteResult],
    summary="Delete organization workspace",
)
async def delete_organization_workspace(
    workspace_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationWorkspaceDeleteResult]:
    service = OrganizationWorkspaceService(settings)
    out = await service.delete_workspace(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        workspace_id=UUID(str(workspace_id)),
        user_id=UUID(str(cast(HasUserId, orgm).user_id)),
        org_role=orgm.role,
    )
    return Response.success(data=out)
