from __future__ import annotations

from fastapi import APIRouter, Depends

from apps.api.core.exceptions import NotFound
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.i18n import t
from apps.api.modules.organization.deps import get_current_org_membership
from apps.api.modules.organization.members.router import router as organization_members_router
from apps.api.modules.organization.models.org_membership import OrgMembership
from apps.api.modules.organization.plugins.router import router as organization_plugins_router
from apps.api.modules.organization.rbac.router import router as organization_rbac_router
from apps.api.modules.organization.schema import MyOrganizationOut, OrganizationBriefOut, OrganizationMembershipOut
from apps.api.modules.organization.settings.router import router as organization_settings_router
from apps.api.modules.organization.workspaces.router import router as organization_workspaces_router

router = APIRouter(tags=["Me"])

router.include_router(organization_plugins_router)
router.include_router(organization_workspaces_router)
router.include_router(organization_members_router)
router.include_router(organization_rbac_router)
router.include_router(organization_settings_router)


@router.get(
    "/me/organization",
    response_model=ResponseModel[MyOrganizationOut],
    summary="Get current user organization and membership",
)
async def get_my_organization(
    orgm: OrgMembership = Depends(get_current_org_membership),
) -> ResponseModel[MyOrganizationOut]:
    await orgm.fetch_related("organization")
    org = orgm.organization

    # `get_current_org_membership` guarantees membership exists; organization should always exist.
    # Still keep a defensive error for corrupted DB records.
    if org is None:
        raise NotFound(
            message=t("errors", "NOT_FOUND", default="资源不存在"),
            error="ORGANIZATION_NOT_FOUND",
        )

    organization = OrganizationBriefOut(
        id=org.id,
        name=org.name,
        slug=org.slug,
        logo_url=org.logo_url,
    )
    membership = OrganizationMembershipOut(
        id=orgm.id,
        organization_id=org.id,
        role=orgm.role,
        status=orgm.status,
    )
    return Response.success(data=MyOrganizationOut(organization=organization, membership=membership))
