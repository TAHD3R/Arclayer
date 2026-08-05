from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.services import ServiceContractError
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.authorization import (
    has_workspace_commerce_manage_access,
    require_workspace_commerce_manage_access,
)
from src.modules.commerce.member_credit_composition import (
    build_member_credit_configuration_service,
    build_member_credit_read_service,
)
from src.modules.commerce.member_credit_read_service import MemberCreditReadScope, MemberCreditReadService
from src.modules.commerce.member_credit_schema import (
    MemberCreditConfigurationMutationOut,
    MemberCreditDefaultLimitWrite,
    MemberCreditLimitsPageOut,
    MemberCreditOverrideWrite,
    MemberCreditUsagePageOut,
)
from src.modules.commerce.member_credit_service import MemberCreditConfigurationService
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_member_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/commerce",
    tags=["domain.commerce.member-credit"],
)

ActorUserId = Annotated[UUID, Depends(get_current_user_id)]
MemberContext = Annotated[WorkspaceContext, Depends(require_workspace_member_access)]
ManagerContext = Annotated[WorkspaceContext, Depends(require_workspace_commerce_manage_access)]
CommerceManagerAccess = Annotated[bool, Depends(has_workspace_commerce_manage_access)]
Pagination = Annotated[PageParams, Depends(get_page_params)]


def get_member_credit_read_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> MemberCreditReadService:
    return build_member_credit_read_service(settings)


def get_member_credit_configuration_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> MemberCreditConfigurationService:
    return build_member_credit_configuration_service(settings)


MemberCreditReadServiceDependency = Annotated[
    MemberCreditReadService,
    Depends(get_member_credit_read_service),
]
MemberCreditConfigurationServiceDependency = Annotated[
    MemberCreditConfigurationService,
    Depends(get_member_credit_configuration_service),
]


@router.get(
    "/member-usage",
    response_model=ResponseModel[MemberCreditUsagePageOut],
    summary="List current-period member Credit usage",
)
async def list_member_credit_usage(
    ctx: MemberContext,
    can_manage_commerce: CommerceManagerAccess,
    params: Pagination,
    service: MemberCreditReadServiceDependency,
) -> ResponseModel[MemberCreditUsagePageOut]:
    if ctx.workspace_membership_id is None:
        raise ServiceContractError("Workspace member context is missing its membership id")
    page = await service.list_usage(
        workspace_id=ctx.workspace_id,
        params=params,
        scope=MemberCreditReadScope.ALL if can_manage_commerce else MemberCreditReadScope.SELF,
        actor_membership_id=ctx.workspace_membership_id,
    )
    return ApiResponse.success(data=page)


@router.get(
    "/member-limits",
    response_model=ResponseModel[MemberCreditLimitsPageOut],
    summary="List Workspace member Credit limits",
)
async def list_member_credit_limits(
    ctx: ManagerContext,
    params: Pagination,
    service: MemberCreditReadServiceDependency,
) -> ResponseModel[MemberCreditLimitsPageOut]:
    page = await service.list_limits(workspace_id=ctx.workspace_id, params=params)
    return ApiResponse.success(data=page)


@router.put(
    "/member-limits/default",
    response_model=ResponseModel[MemberCreditConfigurationMutationOut],
    summary="Update the Workspace default member Credit limit",
)
async def set_default_member_credit_limit(
    payload: MemberCreditDefaultLimitWrite,
    actor_user_id: ActorUserId,
    ctx: ManagerContext,
    service: MemberCreditConfigurationServiceDependency,
) -> ResponseModel[MemberCreditConfigurationMutationOut]:
    result = await service.set_default_limit(
        workspace_id=ctx.workspace_id,
        actor_user_id=actor_user_id,
        command=payload,
    )
    return ApiResponse.success(data=result)


@router.put(
    "/member-limits/{membership_id}",
    response_model=ResponseModel[MemberCreditConfigurationMutationOut],
    summary="Update or clear a member Credit limit override",
)
async def set_member_credit_override(
    membership_id: PublicUUID,
    payload: MemberCreditOverrideWrite,
    actor_user_id: ActorUserId,
    ctx: ManagerContext,
    service: MemberCreditConfigurationServiceDependency,
) -> ResponseModel[MemberCreditConfigurationMutationOut]:
    result = await service.set_member_override(
        workspace_id=ctx.workspace_id,
        membership_id=UUID(str(membership_id)),
        actor_user_id=actor_user_id,
        command=payload,
    )
    return ApiResponse.success(data=result)
