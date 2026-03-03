from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from apps.api.src.common.protocols.tortoise import HasOrganizationId, HasUserId
from apps.api.src.config import Settings, get_settings
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.organization.deps import get_current_org_membership, require_org_admin, require_org_owner
from apps.api.src.modules.organization.models.org_membership import OrgMembership
from apps.api.src.modules.organization.settings.schema import (
    DeleteOrganizationResult,
    LeaveOrganizationRequest,
    LeaveOrganizationResult,
    OrganizationAssignDefaultRoleRequest,
    OrganizationAssignDefaultRoleResult,
    OrganizationSettingsCoreOut,
    OrganizationSettingsCorePatch,
)
from apps.api.src.modules.organization.settings.service import OrganizationSettingsService

router = APIRouter(prefix="/organizations/me", tags=["Organization Settings"])


@router.get(
    "/settings/core",
    response_model=ResponseModel[OrganizationSettingsCoreOut],
    summary="Get organization core settings",
)
async def get_organization_core_settings(
    orgm: Annotated[OrgMembership, Depends(require_org_admin)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationSettingsCoreOut]:
    service = OrganizationSettingsService(settings)
    out = await service.get_core_detail(organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)))
    return Response.success(data=out)


@router.patch(
    "/settings/core",
    response_model=ResponseModel[OrganizationSettingsCoreOut],
    summary="Patch organization core settings",
)
async def patch_organization_core_settings(
    payload: OrganizationSettingsCorePatch,
    orgm: Annotated[OrgMembership, Depends(require_org_admin)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationSettingsCoreOut]:
    service = OrganizationSettingsService(settings)
    out = await service.patch_core(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        patch=payload,
        updated_by=UUID(str(cast(HasUserId, orgm).user_id)),
    )
    return Response.success(data=out)


@router.post(
    "/settings/default-role/assign-all",
    response_model=ResponseModel[OrganizationAssignDefaultRoleResult],
    summary="Assign role to all active member users",
)
async def assign_organization_default_role_to_all_users(
    payload: OrganizationAssignDefaultRoleRequest,
    orgm: Annotated[OrgMembership, Depends(require_org_owner)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationAssignDefaultRoleResult]:
    service = OrganizationSettingsService(settings)
    out = await service.assign_default_role_to_members(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        role_code=payload.role_code,
        confirm_name=payload.confirm_name,
    )
    return Response.success(data=out)


@router.post(
    "/leave",
    response_model=ResponseModel[LeaveOrganizationResult],
    summary="Leave current organization",
)
async def leave_organization(
    payload: LeaveOrganizationRequest,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[LeaveOrganizationResult]:
    service = OrganizationSettingsService(settings)
    out = await service.leave_organization(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        user_id=UUID(str(cast(HasUserId, orgm).user_id)),
        confirm_text=payload.confirm_text,
    )
    return Response.success(data=out)


@router.delete(
    "",
    response_model=ResponseModel[DeleteOrganizationResult],
    summary="Delete current organization",
)
async def delete_organization(
    orgm: Annotated[OrgMembership, Depends(require_org_owner)],
    confirm_name: str | None = Query(
        default=None,
        alias="confirmName",
        description="Organization name confirmation for destructive delete.",
        min_length=1,
        max_length=128,
    ),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[DeleteOrganizationResult]:
    service = OrganizationSettingsService(settings)
    out = await service.delete_organization(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        confirm_name=confirm_name or "",
    )
    return Response.success(data=out)
