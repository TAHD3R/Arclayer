from __future__ import annotations

from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.src.common.protocols.tortoise import HasOrganizationId
from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.config import Settings, get_settings
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.analytics.schema import AuditEventListQuery, AuditEventOut
from apps.api.src.modules.analytics.service import ActivityService
from apps.api.src.modules.auth.deps import get_current_user
from apps.api.src.modules.organization.deps import require_org_admin

router = APIRouter(
    tags=["System: Activity"],
    dependencies=[Depends(require_org_admin)],
)


@router.get(
    "",
    response_model=ResponseModel[PageData[AuditEventOut]],
    summary="List activity events (org-scoped)",
)
async def list_activity(
    query: AuditEventListQuery = Depends(),
    params: PageParams = Depends(get_page_params),
    settings: Settings = Depends(get_settings),
    orgm=Depends(require_org_admin),
    _user=Depends(get_current_user),
) -> ResponseModel[PageData[AuditEventOut]]:
    orgm_like = cast(HasOrganizationId, orgm)
    org_id = UUID(str(orgm_like.organization_id))

    service = ActivityService(settings)
    page = await service.list_events(organization_id=org_id, params=params, filters=query)
    return Response.success(data=page)


@router.get(
    "/{event_id}",
    response_model=ResponseModel[AuditEventOut],
    summary="Get activity event detail (org-scoped)",
)
async def get_activity_detail(
    event_id: PublicUUID,
    settings: Settings = Depends(get_settings),
    orgm=Depends(require_org_admin),
    _user=Depends(get_current_user),
) -> ResponseModel[AuditEventOut]:
    orgm_like = cast(HasOrganizationId, orgm)
    org_id = UUID(str(orgm_like.organization_id))

    service = ActivityService(settings)
    event = await service.get_event(organization_id=org_id, event_id=event_id)
    return Response.success(data=event)
