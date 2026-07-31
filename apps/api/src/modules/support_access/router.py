from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.core.exceptions import Forbidden
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.support_access.schema import SupportAccessGrantCreate, SupportAccessGrantOut
from src.modules.support_access.service import SupportAccessService
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import get_workspace_context

router = APIRouter(prefix="/workspaces/{workspace_id}/support-access", tags=["domain.workspaces.support-access"])


async def require_owner(ctx: WorkspaceContext = Depends(get_workspace_context)) -> WorkspaceContext:
    if not ctx.is_workspace_owner:
        raise Forbidden(error="WORKSPACE_OWNER_REQUIRED")
    return ctx


@router.post("/grants", response_model=ResponseModel[SupportAccessGrantOut])
async def create_grant(
    workspace_id: PublicUUID,
    payload: SupportAccessGrantCreate,
    user_id: UUID = Depends(get_current_user_id),
    ctx: WorkspaceContext = Depends(require_owner),
) -> ResponseModel[SupportAccessGrantOut]:
    if workspace_id != ctx.workspace_id:
        raise Forbidden(error="WORKSPACE_ACCESS_DENIED")
    return ApiResponse.success(
        data=await SupportAccessService().create(workspace_id=ctx.workspace_id, owner_user_id=user_id, command=payload)
    )


@router.get("/grants", response_model=ResponseModel[list[SupportAccessGrantOut]])
async def list_grants(
    workspace_id: PublicUUID, ctx: WorkspaceContext = Depends(require_owner)
) -> ResponseModel[list[SupportAccessGrantOut]]:
    if workspace_id != ctx.workspace_id:
        raise Forbidden(error="WORKSPACE_ACCESS_DENIED")
    return ApiResponse.success(data=await SupportAccessService().list_grants(workspace_id=ctx.workspace_id))


@router.post("/grants/{grant_id}/revoke", response_model=ResponseModel[SupportAccessGrantOut])
async def revoke_grant(
    workspace_id: PublicUUID,
    grant_id: PublicUUID,
    user_id: UUID = Depends(get_current_user_id),
    ctx: WorkspaceContext = Depends(require_owner),
) -> ResponseModel[SupportAccessGrantOut]:
    if workspace_id != ctx.workspace_id:
        raise Forbidden(error="WORKSPACE_ACCESS_DENIED")
    return ApiResponse.success(
        data=await SupportAccessService().revoke(
            workspace_id=ctx.workspace_id, grant_id=grant_id, owner_user_id=user_id
        )
    )
