from __future__ import annotations

from fastapi import APIRouter, Depends

from apps.api.src.config import Settings, get_settings
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.analytics.schema import AuditEventListQuery, AuditEventOut
from apps.api.src.modules.analytics.service import ActivityService
from apps.api.src.modules.workspaces.http.schema import WorkspaceContext
from apps.api.src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/activity",
    tags=["Workspace: Activity"],
)


@router.get(
    "",
    response_model=ResponseModel[PageData[AuditEventOut]],
    summary="List activity events (workspace-scoped)",
)
async def list_workspace_activity(
    query: AuditEventListQuery = Depends(),
    params: PageParams = Depends(get_page_params),
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[AuditEventOut]]:
    # Enforce workspace scope regardless of query params.
    query = query.model_copy(update={"workspace_id": ctx.workspace_id})

    service = ActivityService(settings)
    page = await service.list_events(organization_id=ctx.organization_id, params=params, filters=query)
    return Response.success(data=page)
