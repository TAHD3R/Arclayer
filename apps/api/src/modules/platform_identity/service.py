from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID

from src.config import Settings
from src.core.exceptions import Conflict, Forbidden, NotFound, ServiceUnavailable
from src.core.services import BaseService
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.schema import (
    PlatformAuditEvent,
    PlatformEntryEligibility,
    PlatformIdentitySnapshot,
    PlatformMutationReceipt,
    PlatformOffboardingCommand,
    PlatformOperatorInvitationCommand,
    PlatformOwnerBootstrapCommand,
    PlatformOwnershipAcceptanceCommand,
    PlatformOwnershipNominationCommand,
    PlatformRoleBinding,
)


class PlatformIdentityAuthorityPersistence(Protocol):
    """Atomic persistence boundary for Platform authority mutations.

    Each mutation locks the affected authority records, revalidates its command
    revisions and idempotency fingerprint, applies the complete state change,
    and persists ``audit`` in that same transaction.  A replay returns its
    original receipt; a reused key with a different command is a conflict.
    """

    async def get_identity_snapshot(self, *, user_id: UUID, at: datetime) -> PlatformIdentitySnapshot: ...

    async def resolve_current_role_bindings(
        self, *, role_ids: frozenset[UUID], at: datetime
    ) -> tuple[PlatformRoleBinding, ...]: ...

    async def bootstrap_instance_owner(
        self, *, command: PlatformOwnerBootstrapCommand, audit: PlatformAuditEvent
    ) -> PlatformMutationReceipt: ...

    async def create_operator_invitation(
        self, *, command: PlatformOperatorInvitationCommand, audit: PlatformAuditEvent
    ) -> PlatformMutationReceipt: ...

    async def accept_operator_invitation(
        self,
        *,
        command: PlatformOperatorInvitationCommand,
        accepter_user_id: UUID,
        audit: PlatformAuditEvent,
    ) -> PlatformMutationReceipt: ...

    async def offboard_operator(
        self, *, command: PlatformOffboardingCommand, audit: PlatformAuditEvent
    ) -> PlatformMutationReceipt: ...

    async def nominate_ownership_transfer(
        self, *, command: PlatformOwnershipNominationCommand, audit: PlatformAuditEvent
    ) -> PlatformMutationReceipt: ...

    async def accept_ownership_transfer(
        self, *, command: PlatformOwnershipAcceptanceCommand, audit: PlatformAuditEvent
    ) -> PlatformMutationReceipt: ...


class PlatformMfaReadinessAuthority(Protocol):
    async def require_platform_mfa_ready(self, *, user_id: UUID) -> None: ...


class PlatformStepUpAuthority(Protocol):
    async def require_fresh_phishing_resistant_verification(
        self, *, user_id: UUID, action: str, idempotency_key: str
    ) -> None: ...


class PlatformRecoveryAvailability(Protocol):
    @property
    def is_available(self) -> bool: ...


class PlatformIdentityAuthorityService(BaseService):
    """Authority decisions for the Platform Identity domain.

    Mutating workflows are added only through atomic repository primitives so a
    Platform identity can never observe partial authority.
    """

    def __init__(
        self,
        *,
        repository: PlatformIdentityAuthorityPersistence,
        settings: Settings | None = None,
        clock: Callable[[], datetime] | None = None,
        mfa_readiness: PlatformMfaReadinessAuthority | None = None,
        step_up: PlatformStepUpAuthority | None = None,
        recovery_availability: PlatformRecoveryAvailability | None = None,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._clock = clock or (lambda: datetime.now(UTC))
        self._mfa_readiness = mfa_readiness
        self._step_up = step_up
        self._recovery_availability = recovery_availability

    async def entry_eligibility(self, *, user_id: UUID) -> PlatformEntryEligibility:
        snapshot = await self._repository.get_identity_snapshot(user_id=user_id, at=self._clock())
        return PlatformEntryEligibility(
            user_id=user_id, eligible=snapshot.is_instance_owner or snapshot.is_active_operator
        )

    async def bootstrap_instance_owner(self, *, command: PlatformOwnerBootstrapCommand) -> PlatformMutationReceipt:
        return await self._repository.bootstrap_instance_owner(
            command=command,
            audit=self._audit(command=command, event_name="platform.instance_owner.bootstrapped"),
        )

    async def send_operator_invitation(self, *, command: PlatformOperatorInvitationCommand) -> PlatformMutationReceipt:
        inviter = await self._repository.get_identity_snapshot(user_id=command.inviter_user_id, at=self._clock())
        self._require_invitation_authority(inviter=inviter, intended_roles=command.intended_roles)
        await self._require_current_roles(command.intended_roles)
        return await self._repository.create_operator_invitation(
            command=command,
            audit=self._audit(
                command=command,
                event_name="platform.operator_invitation.sent",
                subject_user_id=command.recipient_user_id,
            ),
        )

    async def accept_operator_invitation(
        self, *, command: PlatformOperatorInvitationCommand, accepter_user_id: UUID
    ) -> PlatformMutationReceipt:
        if accepter_user_id != command.recipient_user_id:
            raise Forbidden(error="PLATFORM_INVITATION_RECIPIENT_REQUIRED")
        await self._require_mfa(user_id=accepter_user_id)
        return await self._repository.accept_operator_invitation(
            command=command,
            accepter_user_id=accepter_user_id,
            audit=self._audit(
                command=command,
                event_name="platform.operator_invitation.accepted",
                actor_user_id=accepter_user_id,
                subject_user_id=accepter_user_id,
            ),
        )

    async def effective_permissions(self, *, user_id: UUID) -> frozenset[str]:
        snapshot = await self._repository.get_identity_snapshot(user_id=user_id, at=self._clock())
        return snapshot.effective_permissions if snapshot.is_active_operator else frozenset()

    async def offboard_operator(self, *, command: PlatformOffboardingCommand) -> PlatformMutationReceipt:
        actor = await self._repository.get_identity_snapshot(user_id=command.actor_user_id, at=self._clock())
        target = await self._repository.get_identity_snapshot(user_id=command.target_user_id, at=self._clock())
        if target.is_instance_owner:
            raise Conflict(error="PLATFORM_INSTANCE_OWNER_OFFBOARDING_FORBIDDEN")
        if not target.is_active_operator:
            raise NotFound(error="PLATFORM_ACTIVE_OPERATOR_NOT_FOUND")
        if not actor.is_instance_owner and PlatformPermissionCode.ACCESS_TEAM_REMOVE not in actor.effective_permissions:
            raise Forbidden(error="PLATFORM_OPERATOR_REMOVE_PERMISSION_REQUIRED")
        return await self._repository.offboard_operator(
            command=command,
            audit=self._audit(
                command=command,
                event_name="platform.operator.offboarded",
                subject_user_id=command.target_user_id,
            ),
        )

    async def nominate_ownership_transfer(
        self, *, command: PlatformOwnershipNominationCommand
    ) -> PlatformMutationReceipt:
        owner = await self._repository.get_identity_snapshot(user_id=command.owner_user_id, at=self._clock())
        target = await self._repository.get_identity_snapshot(user_id=command.target_user_id, at=self._clock())
        if not owner.is_instance_owner:
            raise Forbidden(error="PLATFORM_INSTANCE_OWNER_REQUIRED")
        if command.owner_user_id == command.target_user_id or not target.is_active_operator:
            raise Conflict(error="PLATFORM_OWNERSHIP_TRANSFER_TARGET_INELIGIBLE")
        await self._require_mfa(user_id=command.target_user_id)
        await self._require_current_roles(command.former_owner_roles)
        return await self._repository.nominate_ownership_transfer(
            command=command,
            audit=self._audit(
                command=command,
                event_name="platform.instance_ownership.nominated",
                subject_user_id=command.target_user_id,
            ),
        )

    async def accept_ownership_transfer(
        self, *, command: PlatformOwnershipAcceptanceCommand
    ) -> PlatformMutationReceipt:
        if self._step_up is None:
            raise ServiceUnavailable(error="PLATFORM_STEP_UP_AUTHORITY_UNAVAILABLE")
        await self._step_up.require_fresh_phishing_resistant_verification(
            user_id=command.target_user_id,
            action="platform.access.transfer_instance_ownership",
            idempotency_key=command.idempotency_key,
        )
        return await self._repository.accept_ownership_transfer(
            command=command,
            audit=self._audit(
                command=command,
                event_name="platform.instance_ownership.accepted",
                actor_user_id=command.target_user_id,
                subject_user_id=command.target_user_id,
            ),
        )

    def require_recovery_available(self) -> None:
        if self._recovery_availability is None or not self._recovery_availability.is_available:
            raise ServiceUnavailable(error="PLATFORM_OWNERSHIP_RECOVERY_UNAVAILABLE")

    def _require_invitation_authority(
        self, *, inviter: PlatformIdentitySnapshot, intended_roles: tuple[PlatformRoleBinding, ...]
    ) -> None:
        if not inviter.is_instance_owner and (
            not inviter.is_active_operator
            or PlatformPermissionCode.ACCESS_TEAM_INVITE not in inviter.effective_permissions
        ):
            raise Forbidden(error="PLATFORM_OPERATOR_INVITATION_PERMISSION_REQUIRED")
        requested_permissions = frozenset().union(*(role.permission_codes for role in intended_roles))
        if not requested_permissions.issubset(inviter.delegable_permissions):
            raise Forbidden(error="PLATFORM_DELEGABLE_AUTHORITY_EXCEEDED")

    async def _require_current_roles(self, intended_roles: tuple[PlatformRoleBinding, ...]) -> None:
        role_ids = frozenset(role.role_id for role in intended_roles)
        current = await self._repository.resolve_current_role_bindings(role_ids=role_ids, at=self._clock())
        if len(current) != len(role_ids) or set(current) != set(intended_roles):
            raise Conflict(error="PLATFORM_ROLE_REVISION_STALE")

    async def _require_mfa(self, *, user_id: UUID) -> None:
        if self._mfa_readiness is None:
            raise ServiceUnavailable(error="PLATFORM_MFA_READINESS_AUTHORITY_UNAVAILABLE")
        await self._mfa_readiness.require_platform_mfa_ready(user_id=user_id)

    @staticmethod
    def _audit(
        *,
        command: PlatformOwnerBootstrapCommand
        | PlatformOperatorInvitationCommand
        | PlatformOffboardingCommand
        | PlatformOwnershipNominationCommand
        | PlatformOwnershipAcceptanceCommand,
        event_name: str,
        actor_user_id: UUID | None = None,
        subject_user_id: UUID | None = None,
    ) -> PlatformAuditEvent:
        actor_id = actor_user_id or _command_actor_id(command)
        return PlatformAuditEvent(
            event_name=event_name,
            actor_user_id=actor_id,
            subject_user_id=subject_user_id,
            correlation_id=command.correlation_id,
            idempotency_key=command.idempotency_key,
        )


def _command_actor_id(
    command: PlatformOwnerBootstrapCommand
    | PlatformOperatorInvitationCommand
    | PlatformOffboardingCommand
    | PlatformOwnershipNominationCommand
    | PlatformOwnershipAcceptanceCommand,
) -> UUID:
    if isinstance(command, PlatformOwnerBootstrapCommand):
        return command.owner_user_id
    if isinstance(command, PlatformOperatorInvitationCommand):
        return command.inviter_user_id
    if isinstance(command, PlatformOffboardingCommand):
        return command.actor_user_id
    if isinstance(command, PlatformOwnershipNominationCommand):
        return command.owner_user_id
    return command.target_user_id
