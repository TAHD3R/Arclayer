from __future__ import annotations

from fastapi import APIRouter, Depends

from apps.api.src.config import Settings, get_settings
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.auth.deps import get_current_user_id
from apps.api.src.modules.workspaces.authz.schema import AuthzSnapshot
from apps.api.src.modules.workspaces.authz_snapshot import get_workspace_authz_snapshot
from apps.api.src.modules.workspaces.deps import WorkspaceContext, require_workspace_manage_access

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["Workspace Authz"])


@router.get(
    "/me/authz",
    response_model=ResponseModel[AuthzSnapshot],
    summary="Get workspace-scoped authz snapshot for current user",
)
async def me_workspace_authz(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id=Depends(get_current_user_id),
    _settings: Settings = Depends(get_settings),
) -> ResponseModel[AuthzSnapshot]:
    snap = await get_workspace_authz_snapshot(user_id=user_id, workspace_id=ctx.workspace_id)
    return Response.success(data=snap)
