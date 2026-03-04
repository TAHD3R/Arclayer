from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from apps.api.src.common.protocols.tortoise import HasOrganizationId
from apps.api.src.config import Settings, get_settings
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.models.organization.org_membership import OrgMembership
from apps.api.src.modules.extensions.schema import CapabilityListOut, CapabilitySummaryOut, UIEmbedListOut
from apps.api.src.modules.extensions.service import ExtensionsService
from apps.api.src.modules.organization.http.service import require_org_admin

router = APIRouter(
    prefix="/organizations/current/extensions",
    tags=["Organization: Extensions"],
    dependencies=[Depends(require_org_admin)],
)


def get_extensions_service(settings: Settings = Depends(get_settings)) -> ExtensionsService:
    return ExtensionsService(settings)


@router.get(
    "",
    response_model=ResponseModel[CapabilityListOut],
    summary="List organization-scoped capabilities (extensions/integrations)",
)
async def list_org_capabilities(
    orgm: Annotated[OrgMembership, Depends(require_org_admin)],
    service: Annotated[ExtensionsService, Depends(get_extensions_service)],
) -> ResponseModel[CapabilityListOut]:
    organization_id = UUID(str(cast(HasOrganizationId, orgm).organization_id))
    items = await service.list_org_capabilities(organization_id=organization_id)
    return Response.success(data=CapabilityListOut(items=items))


@router.post(
    "/{capability_id}/enable",
    response_model=ResponseModel[CapabilitySummaryOut],
    summary="Enable an organization-scoped capability",
)
async def enable_org_capability(
    capability_id: str,
    orgm: Annotated[OrgMembership, Depends(require_org_admin)],
    service: Annotated[ExtensionsService, Depends(get_extensions_service)],
) -> ResponseModel[CapabilitySummaryOut]:
    organization_id = UUID(str(cast(HasOrganizationId, orgm).organization_id))
    out = await service.set_org_capability_enabled(
        organization_id=organization_id,
        capability_id=capability_id,
        enabled=True,
    )
    return Response.success(data=out)


@router.post(
    "/{capability_id}/disable",
    response_model=ResponseModel[CapabilitySummaryOut],
    summary="Disable an organization-scoped capability",
)
async def disable_org_capability(
    capability_id: str,
    orgm: Annotated[OrgMembership, Depends(require_org_admin)],
    service: Annotated[ExtensionsService, Depends(get_extensions_service)],
) -> ResponseModel[CapabilitySummaryOut]:
    organization_id = UUID(str(cast(HasOrganizationId, orgm).organization_id))
    out = await service.set_org_capability_enabled(
        organization_id=organization_id,
        capability_id=capability_id,
        enabled=False,
    )
    return Response.success(data=out)


@router.get(
    "/ui-embeds",
    response_model=ResponseModel[UIEmbedListOut],
    summary="List UI embed descriptors (iframe) for enabled org-scoped capabilities",
)
async def list_org_ui_embeds(
    orgm: Annotated[OrgMembership, Depends(require_org_admin)],
    service: Annotated[ExtensionsService, Depends(get_extensions_service)],
    slot: str | None = Query(default=None, description="Host-defined slot id (optional)."),
    capability_id: str | None = Query(default=None, alias="capabilityId"),
    enabled_only: bool = Query(default=True, alias="enabledOnly"),
) -> ResponseModel[UIEmbedListOut]:
    organization_id = UUID(str(cast(HasOrganizationId, orgm).organization_id))
    items = await service.list_org_ui_embeds(
        organization_id=organization_id,
        slot=slot,
        capability_id=capability_id,
        enabled_only=enabled_only,
    )
    return Response.success(data=UIEmbedListOut(items=items))
