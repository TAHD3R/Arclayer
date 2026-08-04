from __future__ import annotations

import json
from collections import defaultdict
from datetime import UTC, datetime
from hashlib import sha256
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.common.utils.public_ids import encode_uuid
from src.config import Settings
from src.core.exceptions import NotFound
from src.core.registries import ConnectorRegistry
from src.models.organization.user import User
from src.models.platform_identity.identity import (
    PlatformInstanceOwnership,
    PlatformInvitationStatus,
    PlatformOperator,
    PlatformOperatorInvitation,
)
from src.models.platform_identity.mfa import (
    PlatformMfaMethod,
    PlatformMfaMethodKind,
    PlatformMfaMethodStatus,
    PlatformMfaRecoveryCode,
)
from src.models.platform_identity.operations import PlatformSession, PlatformVerificationAssurance
from src.models.platform_identity.roles import (
    PlatformOperatorInvitationRole,
    PlatformOperatorRoleAssignment,
    PlatformPermission,
    PlatformRole,
    PlatformRoleRevision,
    PlatformRoleRevisionPermission,
)
from src.modules.platform_identity.management_schema import (
    PlatformCurrentActorProfileOut,
    PlatformCustomRoleApplyRequest,
    PlatformCustomRoleCopyRequest,
    PlatformCustomRoleCreateRequest,
    PlatformCustomRolePreviewOut,
    PlatformCustomRolePreviewRequest,
    PlatformCustomRoleRetireRequest,
    PlatformInvitationCandidateOut,
    PlatformInvitationCreateRequest,
    PlatformInvitationDetailOut,
    PlatformInvitationOptionsOut,
    PlatformInvitationRevokeRequest,
    PlatformInvitationRoleOut,
    PlatformMfaMethodReadinessOut,
    PlatformMfaMethodRemoveRequest,
    PlatformMfaReadinessOut,
    PlatformMfaSummaryOut,
    PlatformMfaTotpBeginRequest,
    PlatformMfaTotpConfirmRequest,
    PlatformMfaWebAuthnBeginRequest,
    PlatformMfaWebAuthnCompleteRequest,
    PlatformMfaWebAuthnRegistrationOut,
    PlatformOperatorMfaResetRequest,
    PlatformOperatorOffboardingRequest,
    PlatformOwnershipTransferNominationRequest,
    PlatformPermissionCatalogItemOut,
    PlatformRoleAssignmentReplaceRequest,
    PlatformRoleAssignmentSummaryOut,
    PlatformRoleCatalogItemOut,
    PlatformSessionInventoryItemOut,
    PlatformSessionRevokeRequest,
    PlatformSessionSummaryOut,
    PlatformStepUpProofOut,
    PlatformStepUpTotpCompleteRequest,
    PlatformStepUpWebAuthnCompleteRequest,
    PlatformStepUpWebAuthnOptionsOut,
    PlatformTeamIdentityOut,
    PlatformTeamOperatorOut,
    PlatformTeamOwnerOut,
    PlatformTeamQueueOut,
    PlatformTeamUserOut,
)
from src.modules.platform_identity.mfa import PlatformMfaService
from src.modules.platform_identity.mfa_schema import PlatformMfaAssurance, PlatformTotpSetup
from src.modules.platform_identity.permissions import PlatformActionCode
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_identity.schema import (
    PlatformMutationReceipt,
    PlatformOffboardingCommand,
    PlatformOperatorInvitationCommand,
    PlatformOwnershipNominationCommand,
)
from src.modules.platform_identity.service import PlatformIdentityAuthorityService
from src.modules.platform_identity.step_up import PlatformStepUpService
from src.modules.platform_identity.step_up_schema import (
    PlatformStepUpProofConsumeRequest,
    PlatformStepUpProofIssueRequest,
)
from src.modules.platform_identity.webauthn import PlatformWebAuthnService


class _VerifiedPlatformMfaReadiness:
    """Adapter for the existing authority-service readiness port."""

    def __init__(self, repository: PlatformIdentityRepository) -> None:
        self._repository = repository

    async def require_platform_mfa_ready(self, *, user_id: UUID) -> None:
        methods = await self._repository.list_verified_mfa_methods(user_id=user_id)
        if not methods:
            from src.core.exceptions import Conflict

            raise Conflict(error="PLATFORM_MFA_ENROLLMENT_REQUIRED")


class PlatformIdentityManagementService:
    """HTTP-facing adapter over existing Platform Identity authority and facts."""

    def __init__(
        self,
        *,
        settings: Settings,
        connector_registry: ConnectorRegistry,
        repository: PlatformIdentityRepository | None = None,
    ) -> None:
        self._settings = settings
        self._connector_registry = connector_registry
        self._repository = repository or PlatformIdentityRepository()
        self._authority = PlatformIdentityAuthorityService(
            repository=self._repository,
            settings=settings,
            mfa_readiness=_VerifiedPlatformMfaReadiness(self._repository),
        )
        self._step_up = PlatformStepUpService(repository=self._repository, settings=settings)
        self._webauthn = PlatformWebAuthnService(settings=settings)
        self._mfa = PlatformMfaService(settings=settings)

    async def current_actor_profile(self, *, user_id: UUID) -> PlatformCurrentActorProfileOut:
        user = await self._repository.get_user_by_id(user_id=user_id)
        if user is None:
            raise NotFound(error="PLATFORM_ACTOR_NOT_FOUND")

        avatar_asset_id = user.avatar_asset_id
        avatar_url = user.avatar_url
        if avatar_asset_id is not None:
            avatar_url = f"/assets/{encode_uuid(UUID(str(avatar_asset_id)))}"
        return PlatformCurrentActorProfileOut(
            username=user.username,
            email=user.email,
            avatar_url=avatar_url,
        )

    async def team_identity(self, *, user_id: UUID) -> PlatformTeamIdentityOut:
        snapshot = await self._repository.get_identity_snapshot(user_id=user_id, at=self._now())
        return PlatformTeamIdentityOut(
            user_id=snapshot.user_id,
            is_instance_owner=snapshot.is_instance_owner,
            operator_id=snapshot.operator_id,
            operator_status=None if snapshot.operator_status is None else str(snapshot.operator_status),
            operator_revision=snapshot.operator_revision,
            effective_permissions=tuple(sorted(snapshot.effective_permissions)),
            delegable_permissions=tuple(sorted(snapshot.delegable_permissions)),
        )

    async def team_queue(self) -> PlatformTeamQueueOut:
        ownership = await PlatformInstanceOwnership.filter(singleton_key="instance").first()
        owner_user_id = None if ownership is None else UUID(str(ownership.owner_user_id))
        operators_query = PlatformOperator.all().order_by("status", "activated_at", "id")
        if owner_user_id is not None:
            operators_query = operators_query.exclude(user_id=owner_user_id)
        operators = await operators_query
        user_ids = {UUID(str(operator.user_id)) for operator in operators}
        if owner_user_id is not None:
            user_ids.add(owner_user_id)
        users = await self._users_by_id(user_ids)
        operator_roles = await self._operator_roles(operators=operators, at=self._now())
        mfa_methods, sessions = await self._team_security_facts(user_ids=user_ids)
        return PlatformTeamQueueOut(
            owner=self._owner_out(ownership=ownership, users=users, mfa_methods=mfa_methods, sessions=sessions),
            operators=tuple(
                self._operator_out(
                    operator=operator,
                    users=users,
                    roles=operator_roles,
                    mfa_methods=mfa_methods,
                    sessions=sessions,
                )
                for operator in operators
            ),
            invitations=await self.list_invitations(),
        )

    async def list_invitations(self) -> tuple[PlatformInvitationDetailOut, ...]:
        invitations = await PlatformOperatorInvitation.exclude(status=PlatformInvitationStatus.ACCEPTED).order_by(
            "status", "created_at", "id"
        )
        return await self._invitation_details(invitations=invitations)

    async def invitation_detail(self, *, invitation_id: UUID) -> PlatformInvitationDetailOut:
        invitation = await PlatformOperatorInvitation.filter(id=invitation_id).first()
        if invitation is None:
            raise NotFound(error="PLATFORM_INVITATION_NOT_FOUND")
        details = await self._invitation_details(invitations=[invitation])
        return details[0]

    async def invite_operator(
        self, *, inviter_user_id: UUID, request: PlatformInvitationCreateRequest
    ) -> PlatformMutationReceipt:
        return await self._authority.send_operator_invitation(
            command=PlatformOperatorInvitationCommand(
                invitation_id=request.invitation_id,
                inviter_user_id=inviter_user_id,
                recipient_user_id=request.recipient_user_id,
                intended_roles=tuple(role.to_domain() for role in request.intended_roles),
                expires_at=request.expires_at,
                idempotency_key=request.idempotency_key,
                correlation_id=request.correlation_id,
            )
        )

    async def invitation_options(self, *, inviter_user_id: UUID, q: str | None) -> PlatformInvitationOptionsOut:
        snapshot = await self._repository.get_identity_snapshot(user_id=inviter_user_id, at=self._now())
        roles = await self.list_roles()
        assignable_roles = (
            roles
            if snapshot.is_instance_owner
            else tuple(role for role in roles if set(role.permission_codes).issubset(snapshot.delegable_permissions))
        )
        candidates = await self._repository.list_invitation_candidates(q=q, at=self._now())
        return PlatformInvitationOptionsOut(
            candidates=tuple(
                PlatformInvitationCandidateOut(
                    user_id=user.id,
                    username=user.username,
                    display_name=user.display_name,
                )
                for user in candidates
            ),
            roles=assignable_roles,
        )

    async def revoke_invitation(
        self,
        *,
        actor_user_id: UUID,
        invitation_id: UUID,
        request: PlatformInvitationRevokeRequest,
    ) -> PlatformMutationReceipt:
        return await self._repository.revoke_operator_invitation(
            actor_user_id=actor_user_id,
            invitation_id=invitation_id,
            expected_invitation_revision=request.expected_invitation_revision,
            idempotency_key=request.idempotency_key,
            correlation_id=request.correlation_id,
        )

    async def offboard_operator(
        self,
        *,
        actor_user_id: UUID,
        actor_session_id: UUID,
        target_user_id: UUID,
        request: PlatformOperatorOffboardingRequest,
    ) -> PlatformMutationReceipt:
        await self._consume_step_up(
            actor_user_id=actor_user_id,
            session_id=actor_session_id,
            proof=request.step_up_proof,
            action_code=PlatformActionCode.REMOVE_OPERATOR,
            target_type="platform_operator",
            target_id=target_user_id,
            scope={
                "expected_operator_revision": request.expected_operator_revision,
                "reason": request.reason,
            },
            idempotency_key=request.idempotency_key,
        )
        return await self._authority.offboard_operator(
            command=PlatformOffboardingCommand(
                actor_user_id=actor_user_id,
                target_user_id=target_user_id,
                expected_operator_revision=request.expected_operator_revision,
                reason=request.reason,
                idempotency_key=request.idempotency_key,
                correlation_id=request.correlation_id,
            )
        )

    async def nominate_ownership_transfer(
        self, *, owner_user_id: UUID, request: PlatformOwnershipTransferNominationRequest
    ) -> PlatformMutationReceipt:
        return await self._authority.nominate_ownership_transfer(
            command=PlatformOwnershipNominationCommand(
                transfer_id=request.transfer_id,
                owner_user_id=owner_user_id,
                target_user_id=request.target_user_id,
                expected_ownership_revision=request.expected_ownership_revision,
                expected_target_operator_revision=request.expected_target_operator_revision,
                former_owner_roles=tuple(role.to_domain() for role in request.former_owner_roles),
                expires_at=request.expires_at,
                idempotency_key=request.idempotency_key,
                correlation_id=request.correlation_id,
            )
        )

    async def create_custom_role(
        self, *, actor_user_id: UUID, actor_session_id: UUID, request: PlatformCustomRoleCreateRequest
    ) -> PlatformMutationReceipt:
        await self._consume_step_up(
            actor_user_id=actor_user_id,
            session_id=actor_session_id,
            proof=request.step_up_proof,
            action_code=PlatformActionCode.CHANGE_ROLE,
            target_type="platform_role",
            target_id=request.role_id,
            scope={"code": request.code, "permission_codes": sorted(request.permission_codes)},
            idempotency_key=request.idempotency_key,
        )
        return await self._repository.create_custom_role(
            actor_user_id=actor_user_id,
            role_id=request.role_id,
            code=request.code,
            name=request.name,
            description=request.description,
            permission_codes=request.permission_codes,
            idempotency_key=request.idempotency_key,
            correlation_id=request.correlation_id,
        )

    async def copy_custom_role(
        self, *, actor_user_id: UUID, actor_session_id: UUID, request: PlatformCustomRoleCopyRequest
    ) -> PlatformMutationReceipt:
        await self._consume_step_up(
            actor_user_id=actor_user_id,
            session_id=actor_session_id,
            proof=request.step_up_proof,
            action_code=PlatformActionCode.CHANGE_ROLE,
            target_type="platform_role",
            target_id=request.role_id,
            scope={
                "code": request.code,
                "permission_codes": sorted(request.permission_codes),
                "source_role_id": str(request.source_role_id),
                "source_revision_id": str(request.expected_source_revision_id),
            },
            idempotency_key=request.idempotency_key,
        )
        return await self._repository.create_custom_role(
            actor_user_id=actor_user_id,
            role_id=request.role_id,
            code=request.code,
            name=request.name,
            description=request.description,
            permission_codes=request.permission_codes,
            idempotency_key=request.idempotency_key,
            correlation_id=request.correlation_id,
            source_role_id=request.source_role_id,
            expected_source_revision_id=request.expected_source_revision_id,
        )

    async def preview_custom_role_revision(
        self, *, actor_user_id: UUID, role_id: UUID, request: PlatformCustomRolePreviewRequest
    ) -> PlatformCustomRolePreviewOut:
        preview = await self._repository.preview_custom_role_revision(
            actor_user_id=actor_user_id,
            role_id=role_id,
            expected_role_revision_id=request.expected_role_revision_id,
            name=request.name,
            description=request.description,
            permission_codes=request.permission_codes,
        )
        return PlatformCustomRolePreviewOut.model_validate(preview)

    async def apply_custom_role_revision(
        self, *, actor_user_id: UUID, actor_session_id: UUID, request: PlatformCustomRoleApplyRequest
    ) -> PlatformMutationReceipt:
        await self._consume_step_up(
            actor_user_id=actor_user_id,
            session_id=actor_session_id,
            proof=request.step_up_proof,
            action_code=PlatformActionCode.CHANGE_ROLE,
            target_type="platform_role_preview",
            target_id=request.preview_id,
            scope={"expected_role_revision_id": str(request.expected_role_revision_id)},
            idempotency_key=request.idempotency_key,
        )
        return await self._repository.apply_custom_role_revision(
            actor_user_id=actor_user_id,
            preview_id=request.preview_id,
            expected_role_revision_id=request.expected_role_revision_id,
            idempotency_key=request.idempotency_key,
            correlation_id=request.correlation_id,
        )

    async def replace_operator_roles(
        self,
        *,
        actor_user_id: UUID,
        actor_session_id: UUID,
        target_user_id: UUID,
        request: PlatformRoleAssignmentReplaceRequest,
    ) -> PlatformMutationReceipt:
        await self._consume_step_up(
            actor_user_id=actor_user_id,
            session_id=actor_session_id,
            proof=request.step_up_proof,
            action_code=PlatformActionCode.CHANGE_ROLE,
            target_type="platform_operator",
            target_id=target_user_id,
            scope={
                "expected_operator_revision": request.expected_operator_revision,
                "role_ids": sorted(map(str, request.role_ids)),
            },
            idempotency_key=request.idempotency_key,
        )
        return await self._repository.replace_operator_roles(
            actor_user_id=actor_user_id,
            target_user_id=target_user_id,
            expected_operator_revision=request.expected_operator_revision,
            role_ids=request.role_ids,
            idempotency_key=request.idempotency_key,
            correlation_id=request.correlation_id,
        )

    async def retire_custom_role(
        self, *, actor_user_id: UUID, actor_session_id: UUID, role_id: UUID, request: PlatformCustomRoleRetireRequest
    ) -> PlatformMutationReceipt:
        await self._consume_step_up(
            actor_user_id=actor_user_id,
            session_id=actor_session_id,
            proof=request.step_up_proof,
            action_code=PlatformActionCode.CHANGE_ROLE,
            target_type="platform_role",
            target_id=role_id,
            scope={"expected_role_revision_id": str(request.expected_role_revision_id)},
            idempotency_key=request.idempotency_key,
        )
        return await self._repository.retire_custom_role(
            actor_user_id=actor_user_id,
            role_id=role_id,
            expected_role_revision_id=request.expected_role_revision_id,
            idempotency_key=request.idempotency_key,
            correlation_id=request.correlation_id,
        )

    async def list_roles(self) -> tuple[PlatformRoleCatalogItemOut, ...]:
        roles = await PlatformRole.filter(is_active=True).order_by("code")
        role_ids = [role.id for role in roles]
        revisions = await PlatformRoleRevision.filter(role_id__in=role_ids, is_current=True).order_by(
            "role_id", "sequence"
        )

        permissions = await PlatformRoleRevisionPermission.filter(
            role_revision_id__in=[revision.id for revision in revisions]
        ).values_list("role_revision_id", "permission__code")
        permissions_by_revision: dict[UUID, list[str]] = defaultdict(list)
        for revision_id, permission_code in permissions:
            permissions_by_revision[UUID(str(revision_id))].append(str(permission_code))
        revisions_by_role = {UUID(str(revision.role_id)): revision for revision in revisions}
        return tuple(
            PlatformRoleCatalogItemOut(
                role_id=role.id,
                code=role.code,
                kind=str(role.kind),
                name=role.name,
                description=role.description,
                revision_id=revision.id,
                revision_sequence=revision.sequence,
                permission_codes=tuple(sorted(permissions_by_revision[UUID(str(revision.id))])),
            )
            for role in roles
            if (revision := revisions_by_role.get(UUID(str(role.id)))) is not None
        )

    async def list_permissions(self) -> tuple[PlatformPermissionCatalogItemOut, ...]:
        permissions = await PlatformPermission.filter(is_active=True).order_by("owner_domain", "code")
        return tuple(
            PlatformPermissionCatalogItemOut(
                code=permission.code,
                owner_domain=permission.owner_domain,
                name_i18n=permission.name_i18n,
                description_i18n=permission.description_i18n,
                is_delegable=permission.is_delegable,
                catalog_revision=permission.catalog_revision,
            )
            for permission in permissions
        )

    async def list_sessions(
        self, *, actor_user_id: UUID, current_session_id: UUID
    ) -> tuple[PlatformSessionInventoryItemOut, ...]:
        sessions = await self._repository.list_active_sessions_for_user(user_id=actor_user_id)
        return tuple(
            PlatformSessionInventoryItemOut(
                session_id=session.id,
                actor_user_id=session.actor_user_id,
                device_label=session.device_label,
                recent_activity_at=session.recent_activity_at,
                inactivity_expires_at=session.inactivity_expires_at,
                absolute_expires_at=session.absolute_expires_at,
                policy_revision=session.policy_revision,
                assurance=str(session.assurance),
                is_current=session.id == current_session_id,
            )
            for session in sessions
        )

    async def revoke_session(
        self,
        *,
        actor_user_id: UUID,
        current_session_id: UUID,
        session_id: UUID,
        request: PlatformSessionRevokeRequest,
    ) -> PlatformMutationReceipt:
        return await self._repository.revoke_current_actor_sessions(
            actor_user_id=actor_user_id,
            current_session_id=current_session_id,
            session_id=session_id,
            all_other=False,
            idempotency_key=request.idempotency_key,
            correlation_id=request.correlation_id,
        )

    async def list_operator_sessions(self, *, operator_id: UUID) -> tuple[PlatformSessionInventoryItemOut, ...]:
        sessions = await self._repository.list_active_sessions_for_operator(operator_id=operator_id)
        return tuple(
            PlatformSessionInventoryItemOut(
                session_id=session.id,
                actor_user_id=session.actor_user_id,
                device_label=session.device_label,
                recent_activity_at=session.recent_activity_at,
                inactivity_expires_at=session.inactivity_expires_at,
                absolute_expires_at=session.absolute_expires_at,
                policy_revision=session.policy_revision,
                assurance=str(session.assurance),
                is_current=False,
            )
            for session in sessions
        )

    async def revoke_operator_session(
        self,
        *,
        actor_user_id: UUID,
        operator_id: UUID,
        session_id: UUID,
        request: PlatformSessionRevokeRequest,
    ) -> PlatformMutationReceipt:
        return await self._repository.revoke_operator_session(
            actor_user_id=actor_user_id,
            operator_id=operator_id,
            session_id=session_id,
            idempotency_key=request.idempotency_key,
            correlation_id=request.correlation_id,
        )

    async def reset_operator_mfa(
        self,
        *,
        actor_user_id: UUID,
        actor_session_id: UUID,
        operator_id: UUID,
        request: PlatformOperatorMfaResetRequest,
    ) -> PlatformMutationReceipt:
        scope: JsonObject = {
            "expected_operator_revision": request.expected_operator_revision,
            "reason": request.reason,
        }
        await self._consume_step_up(
            actor_user_id=actor_user_id,
            session_id=actor_session_id,
            proof=request.step_up_proof,
            action_code=PlatformActionCode.RESET_OPERATOR_MFA,
            target_type="platform_operator",
            target_id=operator_id,
            scope=scope,
            idempotency_key=request.idempotency_key,
        )
        return await self._repository.reset_operator_mfa(
            actor_user_id=actor_user_id,
            operator_id=operator_id,
            expected_operator_revision=request.expected_operator_revision,
            reason=request.reason,
            idempotency_key=request.idempotency_key,
            correlation_id=request.correlation_id,
        )

    async def revoke_other_sessions(
        self, *, actor_user_id: UUID, current_session_id: UUID, request: PlatformSessionRevokeRequest
    ) -> PlatformMutationReceipt:
        return await self._repository.revoke_current_actor_sessions(
            actor_user_id=actor_user_id,
            current_session_id=current_session_id,
            session_id=None,
            all_other=True,
            idempotency_key=request.idempotency_key,
            correlation_id=request.correlation_id,
        )

    async def mfa_readiness(self, *, user_id: UUID) -> PlatformMfaReadinessOut:
        methods = await self._repository.list_verified_mfa_methods(user_id=user_id)
        snapshot = await self._repository.get_identity_snapshot(user_id=user_id, at=self._now())
        recovery_count = None
        if snapshot.operator_id is not None:
            recovery_count = await PlatformMfaRecoveryCode.filter(
                operator_id=snapshot.operator_id,
                used_at__isnull=True,
                invalidated_at__isnull=True,
            ).count()
        return PlatformMfaReadinessOut(
            user_id=user_id,
            ready=bool(methods),
            methods=tuple(
                PlatformMfaMethodReadinessOut(
                    method_id=method.id,
                    kind=str(method.kind),
                    label=method.label,
                    verified_at=method.verified_at,
                    last_used_at=method.last_used_at,
                )
                for method in methods
            ),
            available_recovery_code_count=recovery_count,
        )

    async def remove_current_mfa_method(
        self, *, actor_user_id: UUID, actor_session_id: UUID, method_id: UUID, request: PlatformMfaMethodRemoveRequest
    ) -> PlatformMutationReceipt:
        action_code = await self._current_mfa_action(
            actor_user_id=actor_user_id,
            method_id=method_id,
        )
        await self._consume_step_up(
            actor_user_id=actor_user_id,
            session_id=actor_session_id,
            proof=request.step_up_proof,
            action_code=action_code,
            target_type="platform_mfa_actor",
            target_id=actor_user_id,
            scope={"method_id": str(method_id), "operation": "remove_method"},
            idempotency_key=request.idempotency_key,
        )
        return await self._repository.remove_current_actor_mfa_method(
            actor_user_id=actor_user_id,
            method_id=method_id,
            idempotency_key=request.idempotency_key,
            correlation_id=request.correlation_id,
        )

    async def begin_current_totp_method(
        self,
        *,
        actor_user_id: UUID,
        actor_session_id: UUID,
        request: PlatformMfaTotpBeginRequest,
    ) -> PlatformTotpSetup:
        scope = self._totp_enrollment_scope(replace_method_id=request.replace_method_id)
        action_code = await self._current_mfa_action(
            actor_user_id=actor_user_id,
            method_id=request.replace_method_id,
        )
        await self._consume_step_up(
            actor_user_id=actor_user_id,
            session_id=actor_session_id,
            proof=request.step_up_proof,
            action_code=action_code,
            target_type="platform_mfa_actor",
            target_id=actor_user_id,
            scope=scope,
            idempotency_key=request.idempotency_key,
        )
        return await self._mfa.begin_totp_setup(
            user_id=actor_user_id,
            issuer=request.issuer,
            account_label=request.account_label,
            audit_correlation_id=request.correlation_id,
            audit_idempotency_key=request.idempotency_key,
        )

    async def confirm_current_totp_method(
        self,
        *,
        actor_user_id: UUID,
        actor_session_id: UUID,
        request: PlatformMfaTotpConfirmRequest,
    ) -> PlatformMfaReadinessOut:
        scope = self._totp_enrollment_scope(replace_method_id=request.replace_method_id)
        action_code = await self._current_mfa_action(
            actor_user_id=actor_user_id,
            method_id=request.replace_method_id,
        )
        await self._consume_step_up(
            actor_user_id=actor_user_id,
            session_id=actor_session_id,
            proof=request.step_up_proof,
            action_code=action_code,
            target_type="platform_mfa_actor",
            target_id=actor_user_id,
            scope=scope,
            idempotency_key=request.idempotency_key,
        )
        await self._mfa.confirm_totp_setup(
            user_id=actor_user_id,
            method_id=request.method_id,
            code=request.code,
            replace_method_id=request.replace_method_id,
            audit_correlation_id=request.correlation_id,
            audit_idempotency_key=request.idempotency_key,
        )
        return await self.mfa_readiness(user_id=actor_user_id)

    async def begin_current_webauthn_method(
        self,
        *,
        actor_user_id: UUID,
        actor_session_id: UUID,
        request: PlatformMfaWebAuthnBeginRequest,
    ) -> PlatformMfaWebAuthnRegistrationOut:
        scope = self._mfa_enrollment_scope(replace_method_id=request.replace_method_id)
        action_code = await self._current_mfa_action(
            actor_user_id=actor_user_id,
            method_id=request.replace_method_id,
        )
        await self._consume_step_up(
            actor_user_id=actor_user_id,
            session_id=actor_session_id,
            proof=request.step_up_proof,
            action_code=action_code,
            target_type="platform_mfa_actor",
            target_id=actor_user_id,
            scope=scope,
            idempotency_key=request.idempotency_key,
        )
        user = (await self._users_by_id({actor_user_id})).get(actor_user_id)
        if user is None:
            raise NotFound(error="PLATFORM_IDENTITY_NOT_FOUND")
        return PlatformMfaWebAuthnRegistrationOut(
            options=await self._webauthn.begin_registration(
                user_id=actor_user_id,
                user_name=str(user.username),
                display_name=str(user.display_name or user.username),
                binding=self._mfa_enrollment_binding(
                    actor_user_id=actor_user_id,
                    actor_session_id=actor_session_id,
                    idempotency_key=request.idempotency_key,
                    correlation_id=request.correlation_id,
                    replace_method_id=request.replace_method_id,
                ),
            )
        )

    async def complete_current_webauthn_method(
        self,
        *,
        actor_user_id: UUID,
        actor_session_id: UUID,
        request: PlatformMfaWebAuthnCompleteRequest,
    ) -> PlatformMfaReadinessOut:
        scope = self._mfa_enrollment_scope(replace_method_id=request.replace_method_id)
        action_code = await self._current_mfa_action(
            actor_user_id=actor_user_id,
            method_id=request.replace_method_id,
        )
        await self._consume_step_up(
            actor_user_id=actor_user_id,
            session_id=actor_session_id,
            proof=request.step_up_proof,
            action_code=action_code,
            target_type="platform_mfa_actor",
            target_id=actor_user_id,
            scope=scope,
            idempotency_key=request.idempotency_key,
        )
        await self._webauthn.complete_management_registration(
            user_id=actor_user_id,
            challenge_id=request.challenge_id,
            binding=self._mfa_enrollment_binding(
                actor_user_id=actor_user_id,
                actor_session_id=actor_session_id,
                idempotency_key=request.idempotency_key,
                correlation_id=request.correlation_id,
                replace_method_id=request.replace_method_id,
            ),
            credential=request.credential,
            replace_method_id=request.replace_method_id,
            idempotency_key=request.idempotency_key,
            correlation_id=request.correlation_id,
        )
        return await self.mfa_readiness(user_id=actor_user_id)

    async def begin_step_up_webauthn(
        self, *, actor_user_id: UUID, session_id: UUID, request: PlatformStepUpProofIssueRequest
    ) -> PlatformStepUpWebAuthnOptionsOut:
        bound = self._bound_step_up_request(actor_user_id=actor_user_id, session_id=session_id, request=request)
        return PlatformStepUpWebAuthnOptionsOut(
            options=await self._webauthn.begin_authentication(
                user_id=actor_user_id, binding=self._step_up_binding(request=bound)
            )
        )

    async def complete_step_up_webauthn(
        self, *, actor_user_id: UUID, session_id: UUID, request: PlatformStepUpWebAuthnCompleteRequest
    ) -> PlatformStepUpProofOut:
        bound = self._bound_step_up_request(actor_user_id=actor_user_id, session_id=session_id, request=request)
        verification = await self._webauthn.complete_authentication(
            user_id=actor_user_id,
            challenge_id=request.challenge_id,
            binding=self._step_up_binding(request=bound),
            credential=request.credential,
        )
        if verification.assurance != PlatformMfaAssurance.PHISHING_RESISTANT:
            from src.core.exceptions import Forbidden

            raise Forbidden(error="PLATFORM_PHISHING_RESISTANT_VERIFICATION_REQUIRED")
        return await self._step_up.issue(
            request=bound,
            verified_assurance=PlatformVerificationAssurance.PHISHING_RESISTANT,
        )

    async def complete_step_up_totp(
        self,
        *,
        actor_user_id: UUID,
        session_id: UUID,
        request: PlatformStepUpTotpCompleteRequest,
    ) -> PlatformStepUpProofOut:
        bound = self._bound_step_up_request(
            actor_user_id=actor_user_id,
            session_id=session_id,
            request=request,
        )
        await self._mfa.verify_totp_for_baseline(
            user_id=actor_user_id,
            method_id=request.method_id,
            code=request.code,
        )
        return await self._step_up.issue(
            request=bound,
            verified_assurance=PlatformVerificationAssurance.LOCAL_MFA,
        )

    async def _current_mfa_action(
        self,
        *,
        actor_user_id: UUID,
        method_id: UUID | None,
    ) -> PlatformActionCode:
        if method_id is None:
            return PlatformActionCode.MANAGE_CURRENT_MFA
        methods = await self._repository.list_verified_mfa_methods(user_id=actor_user_id)
        method = next((item for item in methods if UUID(str(item.id)) == method_id), None)
        if method is None:
            raise NotFound(error="PLATFORM_MFA_METHOD_NOT_FOUND")
        if method.kind == PlatformMfaMethodKind.WEBAUTHN:
            return PlatformActionCode.RESET_OPERATOR_MFA
        return PlatformActionCode.MANAGE_CURRENT_MFA

    async def _consume_step_up(
        self,
        *,
        actor_user_id: UUID,
        session_id: UUID,
        proof: str,
        action_code: str,
        target_type: str,
        target_id: UUID | None,
        scope: JsonObject,
        idempotency_key: str,
    ) -> None:
        await self._step_up.consume(
            request=PlatformStepUpProofConsumeRequest(
                actor_user_id=actor_user_id,
                session_id=session_id,
                action_code=action_code,
                target_type=target_type,
                target_id=target_id,
                scope=scope,
                idempotency_key=idempotency_key,
                proof=proof,
            )
        )

    @staticmethod
    def _bound_step_up_request(
        *, actor_user_id: UUID, session_id: UUID, request: PlatformStepUpProofIssueRequest
    ) -> PlatformStepUpProofIssueRequest:
        from src.core.exceptions import Forbidden

        if request.actor_user_id != actor_user_id or request.session_id != session_id:
            raise Forbidden(error="PLATFORM_STEP_UP_ACTOR_MISMATCH")
        return request

    @staticmethod
    def _step_up_binding(*, request: PlatformStepUpProofIssueRequest) -> str:
        context = request.model_dump(
            mode="json",
            include=set(PlatformStepUpProofIssueRequest.model_fields),
        )
        return sha256(json.dumps(context, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    @staticmethod
    def _mfa_enrollment_scope(*, replace_method_id: UUID | None) -> JsonObject:
        return {
            "operation": "webauthn_enrollment",
            "replace_method_id": None if replace_method_id is None else str(replace_method_id),
        }

    @staticmethod
    def _totp_enrollment_scope(*, replace_method_id: UUID | None) -> JsonObject:
        return {
            "operation": "totp_enrollment",
            "replace_method_id": None if replace_method_id is None else str(replace_method_id),
        }

    @staticmethod
    def _mfa_enrollment_binding(
        *,
        actor_user_id: UUID,
        actor_session_id: UUID,
        idempotency_key: str,
        correlation_id: UUID,
        replace_method_id: UUID | None,
    ) -> str:
        return sha256(
            json.dumps(
                {
                    "actor_user_id": str(actor_user_id),
                    "actor_session_id": str(actor_session_id),
                    "idempotency_key": idempotency_key,
                    "correlation_id": str(correlation_id),
                    "replace_method_id": None if replace_method_id is None else str(replace_method_id),
                },
                sort_keys=True,
                separators=(",", ":"),
            ).encode()
        ).hexdigest()

    async def _users_by_id(self, user_ids: set[UUID]) -> dict[UUID, User]:
        if not user_ids:
            return {}
        users = await User.filter(id__in=list(user_ids)).all()
        return {UUID(str(user.id)): user for user in users}

    async def _operator_roles(
        self, *, operators: list[PlatformOperator], at: datetime
    ) -> dict[UUID, tuple[PlatformRoleAssignmentSummaryOut, ...]]:
        operator_ids = [UUID(str(operator.id)) for operator in operators]
        if not operator_ids:
            return {}
        assignments = await PlatformOperatorRoleAssignment.filter(
            operator_id__in=operator_ids, started_at__lte=at, ended_at__isnull=True
        ).order_by("operator_id", "role_id", "started_at")
        roles = await PlatformRole.filter(
            id__in=[assignment.role_id for assignment in assignments], is_active=True
        ).all()
        roles_by_id = {UUID(str(role.id)): role for role in roles}
        result: dict[UUID, list[PlatformRoleAssignmentSummaryOut]] = defaultdict(list)
        for assignment in assignments:
            role = roles_by_id.get(UUID(str(assignment.role_id)))
            if role is not None:
                result[UUID(str(assignment.operator_id))].append(
                    PlatformRoleAssignmentSummaryOut(role_id=role.id, code=role.code, name=role.name)
                )
        return {operator_id: tuple(items) for operator_id, items in result.items()}

    async def _team_security_facts(
        self, *, user_ids: set[UUID]
    ) -> tuple[dict[UUID, tuple[PlatformMfaMethod, ...]], dict[UUID, tuple[PlatformSession, ...]]]:
        if not user_ids:
            return {}, {}
        methods = await PlatformMfaMethod.filter(
            user_id__in=list(user_ids), status=PlatformMfaMethodStatus.VERIFIED, revoked_at__isnull=True
        ).order_by("user_id", "verified_at", "id")
        sessions = await PlatformSession.filter(actor_user_id__in=list(user_ids), revoked_at__isnull=True).order_by(
            "actor_user_id", "recent_activity_at", "id"
        )
        methods_by_user: dict[UUID, list[PlatformMfaMethod]] = defaultdict(list)
        sessions_by_user: dict[UUID, list[PlatformSession]] = defaultdict(list)
        for method in methods:
            methods_by_user[UUID(str(method.user_id))].append(method)
        for session in sessions:
            sessions_by_user[UUID(str(session.actor_user_id))].append(session)
        return (
            {user_id: tuple(items) for user_id, items in methods_by_user.items()},
            {user_id: tuple(items) for user_id, items in sessions_by_user.items()},
        )

    async def _invitation_details(
        self, *, invitations: list[PlatformOperatorInvitation]
    ) -> tuple[PlatformInvitationDetailOut, ...]:
        invitation_ids = [UUID(str(invitation.id)) for invitation in invitations]
        if not invitation_ids:
            return ()
        user_ids = {
            UUID(str(user_id))
            for invitation in invitations
            for user_id in (invitation.recipient_user_id, invitation.invited_by_user_id)
        }
        users = await self._users_by_id(user_ids)
        bindings = await PlatformOperatorInvitationRole.filter(invitation_id__in=invitation_ids).order_by(
            "invitation_id", "role_id"
        )
        roles = await PlatformRole.filter(id__in=[binding.role_id for binding in bindings]).all()
        roles_by_id = {UUID(str(role.id)): role for role in roles}
        roles_by_invitation: dict[UUID, list[PlatformInvitationRoleOut]] = defaultdict(list)
        for binding in bindings:
            role = roles_by_id.get(UUID(str(binding.role_id)))
            if role is not None:
                roles_by_invitation[UUID(str(binding.invitation_id))].append(
                    PlatformInvitationRoleOut(
                        role_id=role.id,
                        role_revision_id=binding.role_revision_id,
                        code=role.code,
                        name=role.name,
                    )
                )
        now = self._now()
        return tuple(
            PlatformInvitationDetailOut(
                invitation_id=invitation.id,
                recipient=self._user_out(user=users[UUID(str(invitation.recipient_user_id))]),
                inviter=self._user_out(user=users[UUID(str(invitation.invited_by_user_id))]),
                status=invitation.status,
                is_effective=(
                    invitation.status in {PlatformInvitationStatus.PENDING, PlatformInvitationStatus.MFA_SETUP_REQUIRED}
                    and invitation.expires_at > now
                ),
                expires_at=invitation.expires_at,
                recipient_accepted_at=invitation.recipient_accepted_at,
                accepted_at=invitation.accepted_at,
                revoked_at=invitation.revoked_at,
                invalidated_at=invitation.invalidated_at,
                revision=invitation.revision,
                created_at=invitation.created_at,
                roles=tuple(roles_by_invitation[UUID(str(invitation.id))]),
            )
            for invitation in invitations
        )

    @staticmethod
    def _user_out(*, user: User) -> PlatformTeamUserOut:
        return PlatformTeamUserOut(user_id=user.id, username=user.username, display_name=user.display_name)

    def _owner_out(
        self,
        *,
        ownership: PlatformInstanceOwnership | None,
        users: dict[UUID, User],
        mfa_methods: dict[UUID, tuple[PlatformMfaMethod, ...]],
        sessions: dict[UUID, tuple[PlatformSession, ...]],
    ) -> PlatformTeamOwnerOut | None:
        if ownership is None:
            return None
        owner_user_id = UUID(str(ownership.owner_user_id))
        return PlatformTeamOwnerOut(
            user=self._user_out(user=users[owner_user_id]),
            ownership_revision=ownership.revision,
            mfa=self._mfa_summary(methods=mfa_methods.get(owner_user_id, ())),
            sessions=self._session_summary(sessions=sessions.get(owner_user_id, ())),
        )

    def _operator_out(
        self,
        *,
        operator: PlatformOperator,
        users: dict[UUID, User],
        roles: dict[UUID, tuple[PlatformRoleAssignmentSummaryOut, ...]],
        mfa_methods: dict[UUID, tuple[PlatformMfaMethod, ...]],
        sessions: dict[UUID, tuple[PlatformSession, ...]],
    ) -> PlatformTeamOperatorOut:
        user_id = UUID(str(operator.user_id))
        return PlatformTeamOperatorOut(
            operator_id=operator.id,
            user=self._user_out(user=users[user_id]),
            status=operator.status,
            revision=operator.revision,
            activated_at=operator.activated_at,
            deactivated_at=operator.deactivated_at,
            roles=roles.get(UUID(str(operator.id)), ()),
            mfa=self._mfa_summary(methods=mfa_methods.get(user_id, ())),
            sessions=self._session_summary(sessions=sessions.get(user_id, ())),
        )

    @staticmethod
    def _mfa_summary(*, methods: tuple[PlatformMfaMethod, ...]) -> PlatformMfaSummaryOut:
        return PlatformMfaSummaryOut(
            verified_method_count=len(methods),
            phishing_resistant_ready=any(method.kind == PlatformMfaMethodKind.WEBAUTHN for method in methods),
        )

    @staticmethod
    def _session_summary(*, sessions: tuple[PlatformSession, ...]) -> PlatformSessionSummaryOut:
        return PlatformSessionSummaryOut(
            active_session_count=len(sessions),
            most_recent_activity_at=max((session.recent_activity_at for session in sessions), default=None),
        )

    @staticmethod
    def _now() -> datetime:
        return datetime.now(UTC)
