from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.extensions.dependencies import get_connector_registry
from src.core.http.response import ApiResponse, ResponseModel
from src.core.registries import ConnectorRegistry
from src.modules.platform_identity.http import (
    get_current_platform_session,
    require_instance_owner,
    require_platform_permission,
)
from src.modules.platform_identity.management_schema import (
    PlatformCurrentActorProfileOut,
    PlatformCustomRoleApplyRequest,
    PlatformCustomRoleCopyRequest,
    PlatformCustomRoleCreateRequest,
    PlatformCustomRolePreviewOut,
    PlatformCustomRolePreviewRequest,
    PlatformCustomRoleRetireRequest,
    PlatformInvitationCreateRequest,
    PlatformInvitationDetailOut,
    PlatformInvitationOptionsOut,
    PlatformInvitationRevokeRequest,
    PlatformMfaMethodRemoveRequest,
    PlatformMfaReadinessOut,
    PlatformMfaTotpBeginRequest,
    PlatformMfaTotpConfirmRequest,
    PlatformMfaWebAuthnBeginRequest,
    PlatformMfaWebAuthnCompleteRequest,
    PlatformMfaWebAuthnRegistrationOut,
    PlatformOperatorOffboardingRequest,
    PlatformOwnershipTransferNominationRequest,
    PlatformPermissionCatalogItemOut,
    PlatformRoleAssignmentRequest,
    PlatformRoleCatalogItemOut,
    PlatformSessionInventoryItemOut,
    PlatformSessionRevokeRequest,
    PlatformSignInReadinessOut,
    PlatformStepUpProofOut,
    PlatformStepUpWebAuthnCompleteRequest,
    PlatformStepUpWebAuthnOptionsOut,
    PlatformTeamIdentityOut,
    PlatformTeamQueueOut,
)
from src.modules.platform_identity.management_service import PlatformIdentityManagementService
from src.modules.platform_identity.mfa_schema import PlatformTotpSetup
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.schema import PlatformMutationReceipt
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.platform_identity.step_up_schema import PlatformStepUpProofIssueRequest

router = APIRouter(prefix="/access", tags=["platform.access"])


def get_platform_identity_management_service(
    settings: Annotated[Settings, Depends(get_settings)],
    connector_registry: Annotated[ConnectorRegistry, Depends(get_connector_registry)],
) -> PlatformIdentityManagementService:
    return PlatformIdentityManagementService(settings=settings, connector_registry=connector_registry)


@router.get(
    "/me",
    response_model=ResponseModel[PlatformCurrentActorProfileOut],
    summary="Read the current Platform administrator profile",
)
async def get_current_platform_actor_profile(
    actor: Annotated[PlatformSessionPrincipal, Depends(get_current_platform_session)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformCurrentActorProfileOut]:
    return ApiResponse.success(data=await service.current_actor_profile(user_id=actor.actor_id))


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
    "/team/invitations/{invitation_id}/revoke",
    response_model=ResponseModel[PlatformMutationReceipt],
    summary="Cancel an ineffective Platform Operator invitation",
)
async def revoke_platform_operator_invitation(
    invitation_id: UUID,
    payload: PlatformInvitationRevokeRequest,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_TEAM_INVITE)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMutationReceipt]:
    return ApiResponse.success(
        data=await service.revoke_invitation(
            actor_user_id=actor.actor_id,
            invitation_id=invitation_id,
            request=payload,
        )
    )


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


@router.post(
    "/roles/custom",
    response_model=ResponseModel[PlatformMutationReceipt],
    summary="Create an independent Custom Platform Role",
)
async def create_platform_custom_role(
    payload: PlatformCustomRoleCreateRequest,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_ROLES_MANAGE)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMutationReceipt]:
    return ApiResponse.success(
        data=await service.create_custom_role(
            actor_user_id=actor.actor_id, actor_session_id=actor.session_id, request=payload
        )
    )


@router.post(
    "/roles/custom/copy",
    response_model=ResponseModel[PlatformMutationReceipt],
    summary="Copy a current role revision into an independent Custom Platform Role",
)
async def copy_platform_custom_role(
    payload: PlatformCustomRoleCopyRequest,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_ROLES_MANAGE)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMutationReceipt]:
    return ApiResponse.success(
        data=await service.copy_custom_role(
            actor_user_id=actor.actor_id, actor_session_id=actor.session_id, request=payload
        )
    )


@router.post(
    "/roles/{role_id}/preview",
    response_model=ResponseModel[PlatformCustomRolePreviewOut],
    summary="Generate a server-authoritative Custom Platform Role revision preview",
)
async def preview_platform_custom_role_revision(
    role_id: UUID,
    payload: PlatformCustomRolePreviewRequest,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_ROLES_MANAGE)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformCustomRolePreviewOut]:
    return ApiResponse.success(
        data=await service.preview_custom_role_revision(actor_user_id=actor.actor_id, role_id=role_id, request=payload)
    )


@router.post(
    "/roles/custom/apply",
    response_model=ResponseModel[PlatformMutationReceipt],
    summary="Apply a revision-bound Custom Platform Role change",
)
async def apply_platform_custom_role_revision(
    payload: PlatformCustomRoleApplyRequest,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_ROLES_MANAGE)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMutationReceipt]:
    return ApiResponse.success(
        data=await service.apply_custom_role_revision(
            actor_user_id=actor.actor_id, actor_session_id=actor.session_id, request=payload
        )
    )


@router.post(
    "/team/operators/{target_user_id}/roles",
    response_model=ResponseModel[PlatformMutationReceipt],
    summary="Add reusable Platform Role assignments without replacing existing roles",
)
async def assign_platform_operator_roles(
    target_user_id: UUID,
    payload: PlatformRoleAssignmentRequest,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_ROLES_MANAGE)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMutationReceipt]:
    return ApiResponse.success(
        data=await service.assign_roles_additively(
            actor_user_id=actor.actor_id,
            actor_session_id=actor.session_id,
            target_user_id=target_user_id,
            request=payload,
        )
    )


@router.post(
    "/roles/{role_id}/retire",
    response_model=ResponseModel[PlatformMutationReceipt],
    summary="Retire a Custom Platform Role and end its active assignments",
)
async def retire_platform_custom_role(
    role_id: UUID,
    payload: PlatformCustomRoleRetireRequest,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_ROLES_MANAGE)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMutationReceipt]:
    return ApiResponse.success(
        data=await service.retire_custom_role(
            actor_user_id=actor.actor_id, actor_session_id=actor.session_id, role_id=role_id, request=payload
        )
    )


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


@router.post(
    "/sessions/me/{session_id}/revoke",
    response_model=ResponseModel[PlatformMutationReceipt],
    summary="Revoke one current actor Platform device session",
)
async def revoke_current_platform_session(
    session_id: PublicUUID,
    payload: PlatformSessionRevokeRequest,
    actor: Annotated[
        PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_SESSIONS_REVOKE)
    ],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMutationReceipt]:
    return ApiResponse.success(
        data=await service.revoke_session(
            actor_user_id=actor.actor_id,
            current_session_id=actor.session_id,
            session_id=session_id,
            request=payload,
        )
    )


@router.post(
    "/sessions/me/revoke-others",
    response_model=ResponseModel[PlatformMutationReceipt],
    summary="Revoke every other current actor Platform device session",
)
async def revoke_other_current_platform_sessions(
    payload: PlatformSessionRevokeRequest,
    actor: Annotated[
        PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_SESSIONS_REVOKE)
    ],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMutationReceipt]:
    return ApiResponse.success(
        data=await service.revoke_other_sessions(
            actor_user_id=actor.actor_id, current_session_id=actor.session_id, request=payload
        )
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


@router.post(
    "/mfa/methods/{method_id}/remove",
    response_model=ResponseModel[PlatformMutationReceipt],
    summary="Remove one current actor Platform MFA method while preserving required readiness",
)
async def remove_current_platform_mfa_method(
    method_id: UUID,
    payload: PlatformMfaMethodRemoveRequest,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_MFA_RESET)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMutationReceipt]:
    return ApiResponse.success(
        data=await service.remove_current_mfa_method(
            actor_user_id=actor.actor_id, actor_session_id=actor.session_id, method_id=method_id, request=payload
        )
    )


@router.post(
    "/mfa/authenticator-app/setup",
    response_model=ResponseModel[PlatformTotpSetup],
    summary="Start a current actor authenticator-app method enrollment",
)
async def begin_current_platform_totp_method(
    payload: PlatformMfaTotpBeginRequest,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_MFA_RESET)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformTotpSetup]:
    return ApiResponse.success(
        data=await service.begin_current_totp_method(
            actor_user_id=actor.actor_id, actor_session_id=actor.session_id, request=payload
        )
    )


@router.post(
    "/mfa/authenticator-app/setup/confirm",
    response_model=ResponseModel[PlatformMfaReadinessOut],
    summary="Verify a current actor authenticator-app method and optionally replace an existing method",
)
async def confirm_current_platform_totp_method(
    payload: PlatformMfaTotpConfirmRequest,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_MFA_RESET)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMfaReadinessOut]:
    return ApiResponse.success(
        data=await service.confirm_current_totp_method(
            actor_user_id=actor.actor_id, actor_session_id=actor.session_id, request=payload
        )
    )


@router.post(
    "/mfa/security-key/setup/options",
    response_model=ResponseModel[PlatformMfaWebAuthnRegistrationOut],
    summary="Start a current actor security-key or passkey enrollment",
)
async def begin_current_platform_webauthn_method(
    payload: PlatformMfaWebAuthnBeginRequest,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_MFA_RESET)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMfaWebAuthnRegistrationOut]:
    return ApiResponse.success(
        data=await service.begin_current_webauthn_method(
            actor_user_id=actor.actor_id, actor_session_id=actor.session_id, request=payload
        )
    )


@router.post(
    "/mfa/security-key/setup/complete",
    response_model=ResponseModel[PlatformMfaReadinessOut],
    summary="Verify a current actor security-key or passkey method and atomically replace an old method when requested",
)
async def complete_current_platform_webauthn_method(
    payload: PlatformMfaWebAuthnCompleteRequest,
    actor: Annotated[PlatformSessionPrincipal, require_platform_permission(PlatformPermissionCode.ACCESS_MFA_RESET)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformMfaReadinessOut]:
    return ApiResponse.success(
        data=await service.complete_current_webauthn_method(
            actor_user_id=actor.actor_id, actor_session_id=actor.session_id, request=payload
        )
    )


@router.post(
    "/step-up/security-key/options",
    response_model=ResponseModel[PlatformStepUpWebAuthnOptionsOut],
    summary="Start a WebAuthn Platform action verification bound to one reviewed command",
)
async def begin_platform_step_up_webauthn(
    payload: PlatformStepUpProofIssueRequest,
    actor: Annotated[PlatformSessionPrincipal, Depends(get_current_platform_session)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformStepUpWebAuthnOptionsOut]:
    return ApiResponse.success(
        data=await service.begin_step_up_webauthn(
            actor_user_id=actor.actor_id, session_id=actor.session_id, request=payload
        )
    )


@router.post(
    "/step-up/security-key/complete",
    response_model=ResponseModel[PlatformStepUpProofOut],
    summary="Complete a WebAuthn Platform action verification and issue an action-bound proof",
)
async def complete_platform_step_up_webauthn(
    payload: PlatformStepUpWebAuthnCompleteRequest,
    actor: Annotated[PlatformSessionPrincipal, Depends(get_current_platform_session)],
    service: Annotated[PlatformIdentityManagementService, Depends(get_platform_identity_management_service)],
) -> ResponseModel[PlatformStepUpProofOut]:
    return ApiResponse.success(
        data=await service.complete_step_up_webauthn(
            actor_user_id=actor.actor_id, session_id=actor.session_id, request=payload
        )
    )


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
