from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.models.platform_identity.identity import PlatformInvitationStatus, PlatformOperatorStatus
from src.modules.platform_identity.schema import PlatformRoleBinding


class PlatformRoleBindingInput(BaseSchema):
    model_config = ConfigDict(frozen=True)

    role_id: UUID
    role_revision_id: UUID
    permission_codes: frozenset[str] = Field(default_factory=frozenset)

    def to_domain(self) -> PlatformRoleBinding:
        return PlatformRoleBinding(
            role_id=self.role_id,
            role_revision_id=self.role_revision_id,
            permission_codes=self.permission_codes,
        )


class PlatformInvitationCreateRequest(BaseSchema):
    model_config = ConfigDict(frozen=True)

    invitation_id: UUID
    recipient_user_id: UUID
    intended_roles: tuple[PlatformRoleBindingInput, ...] = Field(min_length=1)
    expires_at: datetime
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID


class PlatformOperatorOffboardingRequest(BaseSchema):
    model_config = ConfigDict(frozen=True)

    expected_operator_revision: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=512)
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID


class PlatformOwnershipTransferNominationRequest(BaseSchema):
    model_config = ConfigDict(frozen=True)

    transfer_id: UUID
    target_user_id: UUID
    expected_ownership_revision: int = Field(ge=1)
    expected_target_operator_revision: int = Field(ge=1)
    former_owner_roles: tuple[PlatformRoleBindingInput, ...] = ()
    expires_at: datetime
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID


class PlatformTeamIdentityOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    user_id: UUID
    is_instance_owner: bool
    operator_id: UUID | None
    operator_status: str | None
    operator_revision: int | None
    effective_permissions: tuple[str, ...]
    delegable_permissions: tuple[str, ...]


class PlatformTeamUserOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    user_id: UUID
    username: str
    display_name: str | None


class PlatformRoleAssignmentSummaryOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    role_id: UUID
    code: str
    name: str


class PlatformMfaSummaryOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    verified_method_count: int = Field(ge=0)
    phishing_resistant_ready: bool


class PlatformSessionSummaryOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    active_session_count: int = Field(ge=0)
    most_recent_activity_at: datetime | None


class PlatformTeamOwnerOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    user: PlatformTeamUserOut
    ownership_revision: int
    mfa: PlatformMfaSummaryOut
    sessions: PlatformSessionSummaryOut


class PlatformTeamOperatorOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    operator_id: UUID
    user: PlatformTeamUserOut
    status: PlatformOperatorStatus
    revision: int
    activated_at: datetime | None
    deactivated_at: datetime | None
    roles: tuple[PlatformRoleAssignmentSummaryOut, ...]
    mfa: PlatformMfaSummaryOut
    sessions: PlatformSessionSummaryOut


class PlatformInvitationRoleOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    role_id: UUID
    role_revision_id: UUID
    code: str
    name: str


class PlatformInvitationDetailOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    invitation_id: UUID
    recipient: PlatformTeamUserOut
    inviter: PlatformTeamUserOut
    status: PlatformInvitationStatus
    is_effective: bool
    expires_at: datetime
    accepted_at: datetime | None
    revoked_at: datetime | None
    invalidated_at: datetime | None
    revision: int
    created_at: datetime
    roles: tuple[PlatformInvitationRoleOut, ...]


class PlatformTeamQueueOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    owner: PlatformTeamOwnerOut | None
    operators: tuple[PlatformTeamOperatorOut, ...]
    invitations: tuple[PlatformInvitationDetailOut, ...]


class PlatformRoleCatalogItemOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    role_id: UUID
    code: str
    kind: str
    name: str
    description: str | None
    revision_id: UUID
    revision_sequence: int
    permission_codes: tuple[str, ...]


class PlatformInvitationCandidateOut(BaseSchema):
    """The minimum identity facts an authorized inviter needs to choose a recipient."""

    model_config = ConfigDict(frozen=True)

    user_id: UUID
    username: str
    display_name: str | None


class PlatformInvitationOptionsOut(BaseSchema):
    """Invite-only recipient and role projection, scoped to the current inviter."""

    model_config = ConfigDict(frozen=True)

    candidates: tuple[PlatformInvitationCandidateOut, ...]
    roles: tuple[PlatformRoleCatalogItemOut, ...]


class PlatformPermissionCatalogItemOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    code: str
    owner_domain: str
    name_i18n: str
    description_i18n: str
    is_delegable: bool
    catalog_revision: int


class PlatformSessionInventoryItemOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    session_id: UUID
    actor_user_id: UUID
    device_label: str | None
    recent_activity_at: datetime
    inactivity_expires_at: datetime
    absolute_expires_at: datetime
    policy_revision: int
    assurance: str
    is_current: bool


class PlatformMfaMethodReadinessOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    method_id: UUID
    kind: str
    label: str | None
    verified_at: datetime | None
    last_used_at: datetime | None


class PlatformMfaReadinessOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    user_id: UUID
    ready: bool
    methods: tuple[PlatformMfaMethodReadinessOut, ...]
    available_recovery_code_count: int | None


class PlatformRegistrationReadinessOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    public_registration_enabled: bool
    require_email: bool
    require_email_verification: bool
    email_domains_allowlist: tuple[str, ...]


class PlatformSignInProviderReadinessOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    key: str
    label: str
    installed: bool
    enabled: bool
    configured: bool


class PlatformSignInReadinessOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    registration: PlatformRegistrationReadinessOut
    providers: tuple[PlatformSignInProviderReadinessOut, ...]
