from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.protocols.tortoise import HasOrganizationId
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params, paginate_items
from src.core.http.response import ApiResponse, ResponseModel
from src.models.organization.org_membership import OrgMembership
from src.modules.organization.http.service import get_current_org_membership
from src.modules.organization.rbac.schema import (
    OrganizationPermissionOut,
    OrganizationPermissionRoleSetRequest,
    OrganizationRBACMatrixOut,
    OrganizationRBACMatrixPermissionRowOut,
    OrganizationRoleCreateFromTemplateRequest,
    OrganizationRoleOut,
    OrganizationRolePermissionSetRequest,
)
from src.modules.organization.rbac.service import OrganizationRBACService

router = APIRouter(prefix="/organizations/me/rbac", tags=["Organization RBAC"])


def get_org_rbac_service(settings: Settings = Depends(get_settings)) -> OrganizationRBACService:
    return OrganizationRBACService(settings)


async def _assert_permission(
    *,
    orgm: OrgMembership,
    service: OrganizationRBACService,
    permission_code: str,
    error_code: str,
) -> None:
    await service.ensure_permission(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        membership=orgm,
        permission_code=permission_code,
        error_code=error_code,
    )


@router.get(
    "/roles",
    response_model=ResponseModel[PageData[OrganizationRoleOut]],
    summary="List organization roles",
)
async def list_roles(
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    params: PageParams = Depends(get_page_params),
    service: OrganizationRBACService = Depends(get_org_rbac_service),
) -> ResponseModel[PageData[OrganizationRoleOut]]:
    await _assert_permission(
        orgm=orgm,
        service=service,
        permission_code="org.roles.read",
        error_code="ORG_ROLES_READ_REQUIRED",
    )
    roles = await service.list_roles(organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)))
    page = paginate_items(
        [OrganizationRoleOut.model_validate(service.localize_role(role)) for role in roles],
        params=params,
    )
    return ApiResponse.success(data=page)


@router.get(
    "/permissions",
    response_model=ResponseModel[PageData[OrganizationPermissionOut]],
    summary="List organization permissions",
)
async def list_permissions(
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    params: PageParams = Depends(get_page_params),
    service: OrganizationRBACService = Depends(get_org_rbac_service),
) -> ResponseModel[PageData[OrganizationPermissionOut]]:
    await _assert_permission(
        orgm=orgm,
        service=service,
        permission_code="org.roles.read",
        error_code="ORG_ROLES_READ_REQUIRED",
    )
    permissions = await service.list_permissions(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id))
    )
    page = paginate_items(
        [
            OrganizationPermissionOut.model_validate(service.localize_permission(permission))
            for permission in permissions
        ],
        params=params,
    )
    return ApiResponse.success(data=page)


@router.get(
    "/matrix",
    response_model=ResponseModel[OrganizationRBACMatrixOut],
    summary="Get organization RBAC matrix",
)
async def get_matrix(
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    service: OrganizationRBACService = Depends(get_org_rbac_service),
) -> ResponseModel[OrganizationRBACMatrixOut]:
    await _assert_permission(
        orgm=orgm,
        service=service,
        permission_code="org.roles.read",
        error_code="ORG_ROLES_READ_REQUIRED",
    )
    roles, permissions, grants = await service.get_matrix(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id))
    )
    localized_permissions = [service.localize_permission(permission) for permission in permissions]
    return ApiResponse.success(
        data=OrganizationRBACMatrixOut(
            roles=[OrganizationRoleOut.model_validate(service.localize_role(role)) for role in roles],
            permissions=[
                OrganizationRBACMatrixPermissionRowOut(
                    code=str(lp["code"]),
                    module=str(lp["module"]),
                    name=str(lp["name"]),
                    description=(str(lp["description"]) if lp.get("description") is not None else None),
                    granted_role_codes=grants.get(str(lp["code"]), []),
                )
                for lp in localized_permissions
            ],
        )
    )


@router.post(
    "/roles",
    response_model=ResponseModel[OrganizationRoleOut],
    summary="Create organization custom role",
)
async def create_role(
    body: OrganizationRoleCreateFromTemplateRequest,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    service: OrganizationRBACService = Depends(get_org_rbac_service),
) -> ResponseModel[OrganizationRoleOut]:
    await _assert_permission(
        orgm=orgm,
        service=service,
        permission_code="org.roles.write",
        error_code="ORG_ROLES_WRITE_REQUIRED",
    )
    role = await service.create_custom_role(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        code=body.code,
        name=str(body.name or "").strip(),
        description=body.description,
        template_role_code=body.template_role_code,
    )
    return ApiResponse.success(data=OrganizationRoleOut.model_validate(service.localize_role(role)))


@router.delete(
    "/roles/{role_code}",
    response_model=ResponseModel[None],
    summary="Delete organization custom role",
)
async def delete_role(
    role_code: str,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    service: OrganizationRBACService = Depends(get_org_rbac_service),
) -> ResponseModel[None]:
    await _assert_permission(
        orgm=orgm,
        service=service,
        permission_code="org.roles.write",
        error_code="ORG_ROLES_WRITE_REQUIRED",
    )
    await service.delete_custom_role(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)), role_code=role_code
    )
    return ApiResponse.success()


@router.put(
    "/permissions/{permission_code}/roles",
    response_model=ResponseModel[None],
    summary="Set custom roles for an organization permission",
)
async def set_permission_roles(
    permission_code: str,
    body: OrganizationPermissionRoleSetRequest,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    service: OrganizationRBACService = Depends(get_org_rbac_service),
) -> ResponseModel[None]:
    await _assert_permission(
        orgm=orgm,
        service=service,
        permission_code="org.roles.write",
        error_code="ORG_ROLES_WRITE_REQUIRED",
    )
    await service.set_permission_custom_roles(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        permission_code=permission_code,
        role_codes=body.role_codes,
    )
    return ApiResponse.success()


@router.put(
    "/roles/{role_code}/permissions",
    response_model=ResponseModel[None],
    summary="Set permissions for an organization custom role",
)
async def set_role_permissions(
    role_code: str,
    body: OrganizationRolePermissionSetRequest,
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    service: OrganizationRBACService = Depends(get_org_rbac_service),
) -> ResponseModel[None]:
    await _assert_permission(
        orgm=orgm,
        service=service,
        permission_code="org.roles.write",
        error_code="ORG_ROLES_WRITE_REQUIRED",
    )
    await service.set_custom_role_permissions(
        organization_id=UUID(str(cast(HasOrganizationId, orgm).organization_id)),
        role_code=role_code,
        permission_codes=body.permission_codes,
    )
    return ApiResponse.success()
