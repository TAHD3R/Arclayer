from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.models.platform_identity.identity import PlatformOperatorStatus


class PlatformIdentitySnapshot(BaseSchema):
    """Current server-authoritative authority for one shared identity."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    user_id: UUID
    is_instance_owner: bool
    operator_id: UUID | None
    operator_status: PlatformOperatorStatus | None
    operator_revision: int | None = Field(default=None, ge=1)
    effective_permissions: frozenset[str] = Field(default_factory=frozenset)
    delegable_permissions: frozenset[str] = Field(default_factory=frozenset)

    @property
    def is_active_operator(self) -> bool:
        return self.operator_id is not None and self.operator_status == PlatformOperatorStatus.ACTIVE


class PlatformEntryEligibility(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    user_id: UUID
    eligible: bool


class PlatformRoleBinding(BaseSchema):
    """An exact role revision selected for an invitation or transfer outcome."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    role_id: UUID
    role_revision_id: UUID
    permission_codes: frozenset[str] = Field(default_factory=frozenset)


class PlatformOperatorInvitationCommand(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    invitation_id: UUID
    inviter_user_id: UUID
    recipient_user_id: UUID
    intended_roles: tuple[PlatformRoleBinding, ...] = Field(min_length=1)
    expires_at: datetime
    expected_invitation_revision: int | None = Field(default=None, ge=1)
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID


class PlatformInvitationAcceptanceCommand(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    invitation_id: UUID
    accepter_user_id: UUID
    expected_invitation_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID


class PlatformInvitationSetupContext(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    invitation_id: UUID
    invitation_revision: int = Field(ge=1)
    operator_id: UUID
    requires_phishing_resistant: bool


class PlatformOwnerBootstrapCommand(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    owner_user_id: UUID
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID


class PlatformOffboardingCommand(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    actor_user_id: UUID
    target_user_id: UUID
    expected_operator_revision: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=512)
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID


class PlatformOwnershipNominationCommand(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    transfer_id: UUID
    owner_user_id: UUID
    target_user_id: UUID
    expected_ownership_revision: int = Field(ge=1)
    expected_target_operator_revision: int = Field(ge=1)
    former_owner_roles: tuple[PlatformRoleBinding, ...] = ()
    expires_at: datetime
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID


class PlatformOwnershipAcceptanceCommand(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    transfer_id: UUID
    target_user_id: UUID
    expected_transfer_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID


PlatformMutationName = Literal[
    "bootstrap_owner",
    "invite_operator",
    "revoke_operator_invitation",
    "accept_operator_invitation",
    "offboard_operator",
    "nominate_ownership_transfer",
    "accept_ownership_transfer",
    "create_custom_role",
    "copy_custom_role",
    "apply_custom_role_revision",
    "replace_platform_roles",
    "retire_custom_role",
    "revoke_platform_session",
    "revoke_other_platform_sessions",
    "revoke_operator_platform_session",
    "remove_platform_mfa_method",
    "reset_platform_operator_mfa",
]


class PlatformMutationReceipt(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    entity_id: UUID
    mutation: PlatformMutationName
    replayed: bool = False
    correlation_id: UUID


class PlatformAuditEvent(BaseSchema):
    """Safe, correlation-bound evidence written in the same mutation transaction."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    event_name: str = Field(min_length=1, max_length=128)
    actor_user_id: UUID
    subject_user_id: UUID | None = None
    correlation_id: UUID
    idempotency_key: str = Field(min_length=1, max_length=128)
