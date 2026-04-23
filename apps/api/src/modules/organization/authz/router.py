from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.models.organization.org_membership import OrgMembership
from src.modules.organization.authz.schema import OrganizationAuthzSnapshot, OrganizationPermissionActionOut
from src.modules.organization.authz.service import (
    get_organization_authz_snapshot as build_organization_authz_snapshot,
)
from src.modules.organization.authz.service import list_organization_permission_actions
from src.modules.organization.http.service import get_current_org_membership
from src.modules.organization.rbac.service import OrganizationRBACService

router = APIRouter(prefix="/organizations/me", tags=["domain.organization.authz"])


def get_org_rbac_service(settings: Settings = Depends(get_settings)) -> OrganizationRBACService:
    return OrganizationRBACService(settings)


@router.get(
    "/authz",
    response_model=ResponseModel[OrganizationAuthzSnapshot],
    summary="Get organization-scoped authz snapshot for current user",
)
async def get_my_organization_authz(
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    service: Annotated[OrganizationRBACService, Depends(get_org_rbac_service)],
) -> ResponseModel[OrganizationAuthzSnapshot]:
    snapshot = await build_organization_authz_snapshot(membership=orgm, service=service)
    return ApiResponse.success(data=snapshot)


@router.get(
    "/actions",
    response_model=ResponseModel[list[OrganizationPermissionActionOut]],
    summary="List canonical permission actions for current organization context",
)
async def list_my_organization_actions(
    _orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
) -> ResponseModel[list[OrganizationPermissionActionOut]]:
    return ApiResponse.success(data=list_organization_permission_actions())
