from __future__ import annotations

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import Response, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.workspaces.authz.schema import AuthzSnapshot
from src.modules.workspaces.authz.snapshot.service import get_workspace_authz_snapshot
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

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
