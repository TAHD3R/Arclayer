from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from src.config import Settings, get_settings
from src.core.extensions.dependencies import get_connector_registry
from src.core.http.response import ApiResponse, ResponseModel
from src.core.registries import ConnectorRegistry
from src.modules.platform_identity.http import require_instance_owner, require_platform_permission
from src.modules.platform_identity.management_schema import (
    PlatformInvitationCreateRequest,
    PlatformInvitationDetailOut,
    PlatformInvitationOptionsOut,
    PlatformMfaReadinessOut,
    PlatformOperatorOffboardingRequest,
    PlatformOwnershipTransferNominationRequest,
    PlatformPermissionCatalogItemOut,
    PlatformRoleCatalogItemOut,
    PlatformSessionInventoryItemOut,
    PlatformSignInReadinessOut,
    PlatformTeamIdentityOut,
    PlatformTeamQueueOut,
)
from src.modules.platform_identity.management_service import PlatformIdentityManagementService
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.schema import PlatformMutationReceipt
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal

router = APIRouter(prefix="/access", tags=["platform.access"])


def get_platform_identity_management_service(
    settings: Annotated[Settings, Depends(get_settings)],
    connector_registry: Annotated[ConnectorRegistry, Depends(get_connector_registry)],
) -> PlatformIdentityManagementService:
    return PlatformIdentityManagementService(settings=settings, connector_registry=connector_registry)


@router.get(
    "/team/me",
    response_model=ResponseModel[PlatformTeamIdentityOut],
    summary="Read the current Platform identity and delegated authority",
)
async def get_current_team_identity(
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_TEAM_READ)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformTeamIdentityOut]:
    return ApiResponse.success(data=await service.team_identity(user_id=actor.actor_id))


@router.get(
    "/team",
    response_model=ResponseModel[PlatformTeamQueueOut],
    summary="List the real Instance Owner, Platform Operator, and invitation queues",
)
async def list_platform_team(
    _actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_TEAM_READ)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformTeamQueueOut]:
    return ApiResponse.success(data=await service.team_queue())


@router.get(
    "/team/invitations",
    response_model=ResponseModel[tuple[PlatformInvitationDetailOut, ...]],
    summary="List pending and ineffective Platform Operator invitations",
)
async def list_platform_invitations(
    _actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_TEAM_READ)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[tuple[PlatformInvitationDetailOut, ...]]:
    return ApiResponse.success(data=await service.list_invitations())


@router.get(
    "/team/invitations/{invitation_id}",
    response_model=ResponseModel[PlatformInvitationDetailOut],
    summary="Read one Platform Operator invitation without acceptance secrets",
)
async def get_platform_invitation(
    invitation_id: UUID,
    _actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_TEAM_READ)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformInvitationDetailOut]:
    return ApiResponse.success(data=await service.invitation_detail(invitation_id=invitation_id))


@router.post(
    "/team/invitations",
    response_model=ResponseModel[PlatformMutationReceipt],
    summary="Send a revision-bound Platform Operator invitation",
)
async def invite_platform_operator(
    payload: PlatformInvitationCreateRequest,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_TEAM_INVITE)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMutationReceipt]:
    return ApiResponse.success(data=await service.invite_operator(inviter_user_id=actor.actor_id, request=payload))


@router.get(
    "/team/invitation-options",
    response_model=ResponseModel[PlatformInvitationOptionsOut],
    summary="List eligible invite recipients and assignable role revisions",
)
async def get_platform_invitation_options(
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_TEAM_INVITE)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
    q: str | None = Query(default=None),
) -> ResponseModel[PlatformInvitationOptionsOut]:
    return ApiResponse.success(data=await service.invitation_options(inviter_user_id=actor.actor_id, q=q))


@router.post(
    "/team/operators/{target_user_id}/offboard",
    response_model=ResponseModel[PlatformMutationReceipt],
    summary="Remove one active Platform Operator",
)
async def offboard_platform_operator(
    target_user_id: UUID,
    payload: PlatformOperatorOffboardingRequest,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_TEAM_REMOVE)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMutationReceipt]:
    return ApiResponse.success(
        data=await service.offboard_operator(
            actor_user_id=actor.actor_id, target_user_id=target_user_id, request=payload
        )
    )


@router.post(
    "/team/ownership-transfers",
    response_model=ResponseModel[PlatformMutationReceipt],
    summary="Nominate an active Platform Operator for Instance Ownership transfer",
)
async def nominate_platform_ownership_transfer(
    payload: PlatformOwnershipTransferNominationRequest,
    actor: Annotated[PlatformSessionPrincipal, Depends(require_instance_owner)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMutationReceipt]:
    return ApiResponse.success(
        data=await service.nominate_ownership_transfer(owner_user_id=actor.actor_id, request=payload)
    )


@router.get(
    "/roles",
    response_model=ResponseModel[tuple[PlatformRoleCatalogItemOut, ...]],
    summary="List current reusable Platform Role revisions",
)
async def list_platform_roles(
    _actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_ROLES_READ)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[tuple[PlatformRoleCatalogItemOut, ...]]:
    return ApiResponse.success(data=await service.list_roles())


@router.get(
    "/permissions",
    response_model=ResponseModel[tuple[PlatformPermissionCatalogItemOut, ...]],
    summary="List active Platform Permission catalog entries",
)
async def list_platform_permissions(
    _actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_ROLES_READ)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[tuple[PlatformPermissionCatalogItemOut, ...]]:
    return ApiResponse.success(data=await service.list_permissions())


@router.get(
    "/sessions/me",
    response_model=ResponseModel[tuple[PlatformSessionInventoryItemOut, ...]],
    summary="List the current actor's active Platform device sessions",
)
async def list_current_platform_sessions(
    actor: Annotated[
        PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_SESSIONS_READ)
    ],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[tuple[PlatformSessionInventoryItemOut, ...]]:
    return ApiResponse.success(
        data=await service.list_sessions(actor_user_id=actor.actor_id, current_session_id=actor.session_id)
    )


@router.get(
    "/mfa/readiness",
    response_model=ResponseModel[PlatformMfaReadinessOut],
    summary="Read the current actor's safe Platform MFA readiness facts",
)
async def get_current_platform_mfa_readiness(
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_TEAM_READ)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMfaReadinessOut]:
    return ApiResponse.success(data=await service.mfa_readiness(user_id=actor.actor_id))


@router.get(
    "/sign-in/readiness",
    response_model=ResponseModel[PlatformSignInReadinessOut],
    summary="Read configured registration and identity-provider readiness",
)
async def get_platform_sign_in_readiness(
    _actor: Annotated[
        PlatformSessionPrincipal,
        require_platform_permission(PlatformPermissionCode.ACCESS_SIGN_IN_SETTINGS_READ),
    ],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformSignInReadinessOut]:
    return ApiResponse.success(data=await service.sign_in_readiness())
