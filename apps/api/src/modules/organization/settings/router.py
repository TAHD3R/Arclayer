from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from apps.api.src.common.protocols.tortoise import HasOrganizationId, HasUserId
from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.config import Settings, get_settings
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.models.organization.org_membership import OrgMembership
from apps.api.src.modules.organization.http.service import (
    get_current_org_membership,
    get_org_membership_for_organization,
    require_org_permission,
)
from apps.api.src.modules.organization.settings.danger_service import OrganizationDangerService
from apps.api.src.modules.organization.settings.schema import (
    DeleteOrganizationResult,
    LeaveOrganizationRequest,
    LeaveOrganizationResult,
    OrganizationAssignDefaultRoleRequest,
    OrganizationAssignDefaultRoleResult,
    OrganizationDangerCapabilitiesOut,
    OrganizationSettingsCoreOut,
    OrganizationSettingsCorePatch,
)
from apps.api.src.modules.organization.settings.service import OrganizationSettingsService

router = APIRouter(prefix="/organizations/me", tags=["Organization Settings"])
scoped_router = APIRouter(tags=["Organization Settings"])


def _org_id(orgm: OrgMembership) -> UUID:
    return UUID(str(cast(HasOrganizationId, orgm).organization_id))


def _user_id(orgm: OrgMembership) -> UUID:
    return UUID(str(cast(HasUserId, orgm).user_id))


@router.get(
    "/settings/core",
    response_model=ResponseModel[OrganizationSettingsCoreOut],
    summary="Get organization core settings",
)
async def get_organization_core_settings(
    orgm: Annotated[
        OrgMembership, require_org_permission("org.settings.read", error_code="ORG_SETTINGS_READ_REQUIRED")
    ],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationSettingsCoreOut]:
    service = OrganizationSettingsService(settings)
    out = await service.get_core_detail(organization_id=_org_id(orgm))
    return Response.success(data=out)


@router.patch(
    "/settings/core",
    response_model=ResponseModel[OrganizationSettingsCoreOut],
    summary="Patch organization core settings",
)
async def patch_organization_core_settings(
    payload: OrganizationSettingsCorePatch,
    orgm: Annotated[
        OrgMembership,
        require_org_permission("org.settings.manage", error_code="ORG_SETTINGS_MANAGE_REQUIRED"),
    ],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationSettingsCoreOut]:
    service = OrganizationSettingsService(settings)
    out = await service.patch_core(
        organization_id=_org_id(orgm),
        patch=payload,
        updated_by=_user_id(orgm),
    )
    return Response.success(data=out)


@router.post(
    "/settings/default-role/assign-all",
    response_model=ResponseModel[OrganizationAssignDefaultRoleResult],
    summary="Assign role to all active member users",
)
async def assign_organization_default_role_to_all_users(
    payload: OrganizationAssignDefaultRoleRequest,
    orgm: Annotated[
        OrgMembership,
        require_org_permission(
            "org.settings.assign-default-role",
            error_code="ORG_SETTINGS_ASSIGN_DEFAULT_ROLE_REQUIRED",
        ),
    ],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationAssignDefaultRoleResult]:
    service = OrganizationSettingsService(settings)
    out = await service.assign_default_role_to_members(
        organization_id=_org_id(orgm),
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
        organization_id=_org_id(orgm),
        user_id=_user_id(orgm),
        confirm_text=payload.confirm_text,
    )
    return Response.success(data=out)


@router.delete(
    "",
    response_model=ResponseModel[DeleteOrganizationResult],
    summary="Delete current organization",
)
async def delete_organization(
    orgm: Annotated[
        OrgMembership,
        require_org_permission("org.settings.delete", error_code="ORG_SETTINGS_DELETE_REQUIRED"),
    ],
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
        organization_id=_org_id(orgm),
        confirm_name=confirm_name or "",
    )
    return Response.success(data=out)


@scoped_router.get(
    "/organizations/{organization_id}/settings/danger-capabilities",
    response_model=ResponseModel[OrganizationDangerCapabilitiesOut],
    summary="Get organization danger capabilities for current user",
)
async def get_organization_danger_capabilities(
    organization_id: PublicUUID,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OrganizationDangerCapabilitiesOut]:
    service = OrganizationDangerService(settings)
    out = await service.get_capabilities(
        organization_id=UUID(str(organization_id)),
        user_id=_user_id(orgm),
    )
    return Response.success(data=out)


@scoped_router.post(
    "/organizations/{organization_id}/leave",
    response_model=ResponseModel[LeaveOrganizationResult],
    summary="Leave explicit organization",
)
async def leave_scoped_organization(
    organization_id: PublicUUID,
    payload: LeaveOrganizationRequest,
    orgm: Annotated[OrgMembership, Depends(get_org_membership_for_organization)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[LeaveOrganizationResult]:
    service = OrganizationSettingsService(settings)
    out = await service.leave_organization(
        organization_id=UUID(str(organization_id)),
        user_id=_user_id(orgm),
        confirm_text=payload.confirm_text,
    )
    return Response.success(data=out)


@scoped_router.delete(
    "/organizations/{organization_id}",
    response_model=ResponseModel[DeleteOrganizationResult],
    summary="Delete explicit organization",
)
async def delete_scoped_organization(
    organization_id: PublicUUID,
    orgm: Annotated[
        OrgMembership,
        require_org_permission(
            "org.settings.delete",
            error_code="ORG_SETTINGS_DELETE_REQUIRED",
            membership_dependency=get_org_membership_for_organization,
        ),
    ],
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
        organization_id=UUID(str(organization_id)),
        confirm_name=confirm_name or "",
    )
    return Response.success(data=out)
