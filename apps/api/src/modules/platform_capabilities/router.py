from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.platform_capabilities.rollout_repository import TortoiseWorkspaceCapabilityRolloutRepository
from src.modules.platform_capabilities.rollout_schema import (
    WorkspaceCapabilityRolloutApplyReceipt,
    WorkspaceCapabilityRolloutApplyRequest,
    WorkspaceCapabilityRolloutPreview,
    WorkspaceCapabilityRolloutPreviewRequest,
)
from src.modules.platform_capabilities.rollout_service import (
    WORKSPACE_CAPABILITY_ROLLOUT_APPLY_PERMISSION,
    PlatformIdentityWorkspaceCapabilityRolloutPermission,
    UnregisteredWorkspaceCapabilityEligibilityPort,
    WorkspaceCapabilityRolloutService,
)
from src.modules.platform_capabilities.schema import PlatformCapabilityCatalogOut
from src.modules.platform_capabilities.service import PlatformCapabilityCatalogService
from src.modules.platform_identity.http import (
    get_current_platform_session,
    get_platform_identity_repository,
    require_platform_permission,
)
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal

router = APIRouter(prefix="/capabilities", tags=["platform.capabilities"])


def get_workspace_capability_rollout_service(
    settings: Settings = Depends(get_settings),
    identity_repository: PlatformIdentityRepository = Depends(get_platform_identity_repository),
) -> WorkspaceCapabilityRolloutService:
    """Domains must replace the explicit unregistered eligibility port at composition time."""

    return WorkspaceCapabilityRolloutService(
        repository=TortoiseWorkspaceCapabilityRolloutRepository(),
        eligibility=UnregisteredWorkspaceCapabilityEligibilityPort(),
        permission=PlatformIdentityWorkspaceCapabilityRolloutPermission(identity_repository),
        settings=settings,
    )


@router.get(
    "",
    response_model=ResponseModel[PlatformCapabilityCatalogOut],
    summary="List visible Platform capabilities",
)
async def list_platform_capabilities(
    principal: PlatformSessionPrincipal = Depends(get_current_platform_session),
    repository: PlatformIdentityRepository = Depends(get_platform_identity_repository),
) -> ResponseModel[PlatformCapabilityCatalogOut]:
    catalog = await PlatformCapabilityCatalogService(repository).list_catalog(principal)
    return ApiResponse.success(data=catalog)


@router.post(
    "/{capability_id}/rollout/previews",
    response_model=ResponseModel[WorkspaceCapabilityRolloutPreview],
    summary="Preview a Workspace capability rollout change",
)
async def preview_workspace_capability_rollout(
    capability_id: str,
    payload: WorkspaceCapabilityRolloutPreviewRequest,
    _principal: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(WORKSPACE_CAPABILITY_ROLLOUT_APPLY_PERMISSION),
    ],
    service: WorkspaceCapabilityRolloutService = Depends(get_workspace_capability_rollout_service),
) -> ResponseModel[WorkspaceCapabilityRolloutPreview]:
    return ApiResponse.success(data=await service.create_preview(capability_id=capability_id, request=payload))


@router.post(
    "/rollout/applies",
    response_model=ResponseModel[WorkspaceCapabilityRolloutApplyReceipt],
    summary="Apply a reviewed Workspace capability rollout change",
)
async def apply_workspace_capability_rollout(
    payload: WorkspaceCapabilityRolloutApplyRequest,
    principal: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(WORKSPACE_CAPABILITY_ROLLOUT_APPLY_PERMISSION),
    ],
    service: WorkspaceCapabilityRolloutService = Depends(get_workspace_capability_rollout_service),
) -> ResponseModel[WorkspaceCapabilityRolloutApplyReceipt]:
    return ApiResponse.success(data=await service.apply(principal=principal, request=payload))
