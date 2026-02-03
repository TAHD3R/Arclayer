from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.config import Settings, get_settings
from apps.api.core.http.response import Response, ResponseModel
from apps.api.modules.auth.deps import get_current_user_id
from apps.api.modules.workspaces.authz.deps import require_workspace_permission
from apps.api.modules.workspaces.deps import WorkspaceContext, require_workspace_manage_access
from apps.api.modules.workspaces.settings.schema import WorkspaceSettingsDetail, WorkspaceSettingsPatch
from apps.api.modules.workspaces.settings.service import WorkspaceSettingsService

router = APIRouter(prefix="/workspaces/{workspace_id}/settings", tags=["Workspace Settings"])


@router.get(
    "/core",
    response_model=ResponseModel[WorkspaceSettingsDetail],
    summary="Get workspace core settings",
    dependencies=[require_workspace_permission("system:settings:read")],
)
async def get_workspace_core_settings(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceSettingsDetail]:
    service = WorkspaceSettingsService(settings)
    detail = await service.get_core_detail(workspace_id=ctx.workspace_id)
    return Response.success(data=detail)


@router.patch(
    "/core",
    response_model=ResponseModel[WorkspaceSettingsDetail],
    summary="Patch workspace core settings",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def patch_workspace_core_settings(
    payload: WorkspaceSettingsPatch,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceSettingsDetail]:
    service = WorkspaceSettingsService(settings)
    detail = await service.patch_core(workspace_id=ctx.workspace_id, patch=payload.patch or {}, updated_by=user_id)
    return Response.success(data=detail)
