from __future__ import annotations

from fastapi import APIRouter, Depends

from src.core.http.response import ApiResponse, ResponseModel
from src.modules.commerce.access_state.composition import (
    CommercialAccessStateReader,
    build_commercial_access_state_reader,
)
from src.modules.commerce.access_state.schema import (
    CommercialAccessMemberView,
    CommercialAccessRecoveryView,
)
from src.modules.commerce.authorization import require_workspace_commerce_manage_access
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_member_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/commerce",
    tags=["domain.commerce.access-state"],
)


@router.get(
    "/access",
    response_model=ResponseModel[CommercialAccessMemberView],
    summary="Read the sanitized workspace commercial access state",
)
async def get_workspace_commercial_access(
    ctx: WorkspaceContext = Depends(require_workspace_member_access),
    reader: CommercialAccessStateReader = Depends(build_commercial_access_state_reader),
) -> ResponseModel[CommercialAccessMemberView]:
    return ApiResponse.success(data=await reader.member_view(workspace_id=ctx.workspace_id))


@router.get(
    "/payment-recovery",
    response_model=ResponseModel[CommercialAccessRecoveryView],
    summary="Read the billing-contact payment recovery action",
)
async def get_workspace_payment_recovery(
    ctx: WorkspaceContext = Depends(require_workspace_commerce_manage_access),
    reader: CommercialAccessStateReader = Depends(build_commercial_access_state_reader),
) -> ResponseModel[CommercialAccessRecoveryView]:
    return ApiResponse.success(data=await reader.recovery_view(workspace_id=ctx.workspace_id))
