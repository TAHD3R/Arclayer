from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class PlatformVerificationAssurance(StrEnum):
    LOCAL_MFA = "local_mfa"
    PHISHING_RESISTANT = "phishing_resistant"


class PlatformStepUpProofStatus(StrEnum):
    ACTIVE = "active"
    CONSUMED = "consumed"
    INVALIDATED = "invalidated"
    EXPIRED = "expired"


class PlatformOwnershipTransferStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class PlatformActionPolicy(BaseModel):
    """Trusted, versioned action assurance policy consumed by Platform APIs."""

    code = fields.CharField(max_length=128, unique=True, db_index=True)
    permission = fields.ForeignKeyField(
        "models.PlatformPermission",
        related_name="action_policies",
        on_delete=fields.RESTRICT,
    )
    requires_step_up = fields.BooleanField(default=False, db_index=True)
    required_assurance = fields.CharEnumField(
        PlatformVerificationAssurance, default=PlatformVerificationAssurance.LOCAL_MFA
    )
    freshness_seconds = fields.IntField(null=True)
    policy_revision = fields.BigIntField(default=1)
    is_active = fields.BooleanField(default=True, db_index=True)

    if TYPE_CHECKING:
        permission_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_action_policies"
        table_description = "Trusted action-scoped Platform verification requirements."
        abstract = False


class PlatformSession(BaseModel):
    """Independently revocable, device-scoped Platform Session inventory record."""

    actor_user = fields.ForeignKeyField("models.User", related_name="platform_sessions", on_delete=fields.RESTRICT)
    operator = fields.ForeignKeyField(
        "models.PlatformOperator",
        related_name="sessions",
        on_delete=fields.RESTRICT,
        null=True,
    )
    session_identifier_hash = fields.CharField(max_length=128, unique=True, db_index=True)
    device_label = fields.CharField(max_length=128, null=True)
    recent_activity_at = fields.DatetimeField(db_index=True)
    inactivity_expires_at = fields.DatetimeField(db_index=True)
    absolute_expires_at = fields.DatetimeField(db_index=True)
    policy_revision = fields.BigIntField()
    token_version = fields.BigIntField(default=1)
    assurance = fields.CharEnumField(PlatformVerificationAssurance)
    revoked_at = fields.DatetimeField(null=True, db_index=True)
    revoked_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        actor_user_id: UUID
        operator_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "platform_sessions"
        table_description = "Device-scoped Platform Sessions without bearer material."
        abstract = False
        indexes = (("actor_user_id", "revoked_at"), ("operator_id", "revoked_at"))


class PlatformStepUpProof(BaseModel):
    """Action-bound verification proof; its opaque bearer is stored only as a hash."""

    session = fields.ForeignKeyField("models.PlatformSession", related_name="step_up_proofs", on_delete=fields.CASCADE)
    actor_user = fields.ForeignKeyField(
        "models.User", related_name="platform_step_up_proofs", on_delete=fields.RESTRICT
    )
    action_policy = fields.ForeignKeyField(
        "models.PlatformActionPolicy",
        related_name="step_up_proofs",
        on_delete=fields.RESTRICT,
    )
    proof_hash = fields.CharField(max_length=128, unique=True, db_index=True)
    assurance = fields.CharEnumField(PlatformVerificationAssurance)
    target_type = fields.CharField(max_length=64)
    target_id = fields.UUIDField(null=True, db_index=True)
    scope = fields.JSONField(default=dict)
    expected_revision = fields.BigIntField(null=True)
    preview_revision = fields.BigIntField(null=True)
    policy_revision = fields.BigIntField()
    idempotency_key = fields.CharField(max_length=128)
    expires_at = fields.DatetimeField(db_index=True)
    status = fields.CharEnumField(PlatformStepUpProofStatus, default=PlatformStepUpProofStatus.ACTIVE, db_index=True)
    consumed_at = fields.DatetimeField(null=True)

    if TYPE_CHECKING:
        session_id: UUID
        actor_user_id: UUID
        action_policy_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_step_up_proofs"
        table_description = "Bound Platform action verification proofs without raw authenticator data."
        abstract = False
        indexes = (("session_id", "status", "expires_at"), ("actor_user_id", "status"))


class PlatformOwnershipTransfer(BaseModel):
    """Two-party, revision-bound Instance Ownership Transfer record."""

    previous_owner_user = fields.ForeignKeyField(
        "models.User",
        related_name="platform_ownership_transfers_from",
        on_delete=fields.RESTRICT,
    )
    next_owner_user = fields.ForeignKeyField(
        "models.User",
        related_name="platform_ownership_transfers_to",
        on_delete=fields.RESTRICT,
    )
    initiated_by_user = fields.ForeignKeyField(
        "models.User",
        related_name="platform_ownership_transfers_initiated",
        on_delete=fields.RESTRICT,
    )
    status = fields.CharEnumField(
        PlatformOwnershipTransferStatus, default=PlatformOwnershipTransferStatus.PENDING, db_index=True
    )
    revision = fields.BigIntField(default=1)
    ownership_revision = fields.BigIntField()
    target_operator_revision = fields.BigIntField()
    expires_at = fields.DatetimeField(db_index=True)
    accepted_at = fields.DatetimeField(null=True)
    idempotency_key = fields.CharField(max_length=128)
    acceptance_idempotency_key = fields.CharField(max_length=128, null=True)
    correlation_id = fields.UUIDField(unique=True, db_index=True)

    if TYPE_CHECKING:
        previous_owner_user_id: UUID
        next_owner_user_id: UUID
        initiated_by_user_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_ownership_transfers"
        table_description = "Pending and completed two-party Instance Ownership Transfers."
        abstract = False
        unique_together = (("previous_owner_user_id", "idempotency_key"),)
        indexes = (("next_owner_user_id", "status", "expires_at"),)


class PlatformOwnershipTransferFormerOwnerRole(BaseModel):
    """Reviewed role outcome for the former Owner after an accepted transfer."""

    transfer = fields.ForeignKeyField(
        "models.PlatformOwnershipTransfer",
        related_name="former_owner_role_bindings",
        on_delete=fields.CASCADE,
    )
    role = fields.ForeignKeyField(
        "models.PlatformRole", related_name="ownership_transfer_bindings", on_delete=fields.RESTRICT
    )
    role_revision = fields.ForeignKeyField(
        "models.PlatformRoleRevision",
        related_name="ownership_transfer_bindings",
        on_delete=fields.RESTRICT,
    )

    if TYPE_CHECKING:
        transfer_id: UUID
        role_id: UUID
        role_revision_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_ownership_transfer_former_owner_roles"
        table_description = "Revision-bound former Owner role outcome for an Ownership Transfer."
        abstract = False
        unique_together = (("transfer_id", "role_id"),)
