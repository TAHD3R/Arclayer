from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class PlatformOperatorStatus(StrEnum):
    ACTIVE = "active"
    MFA_SETUP_REQUIRED = "mfa_setup_required"
    DEACTIVATED = "deactivated"


class PlatformOperatorSetupReason(StrEnum):
    INVITATION = "invitation"
    RECOVERY = "recovery"


class PlatformInvitationStatus(StrEnum):
    PENDING = "pending"
    MFA_SETUP_REQUIRED = "mfa_setup_required"
    ACCEPTED = "accepted"
    REVOKED = "revoked"
    EXPIRED = "expired"
    INVALIDATED = "invalidated"


class PlatformInstanceOwnership(BaseModel):
    """The one deployment-wide Instance Owner authority record.

    The migration enforces `singleton_key = 'instance'` with a database check;
    this model deliberately has no role or permission relationship.
    """

    singleton_key = fields.CharField(max_length=16, unique=True, default="instance")
    owner_user = fields.ForeignKeyField(
        "models.User",
        related_name="platform_instance_ownerships",
        on_delete=fields.RESTRICT,
        unique=True,
    )
    revision = fields.BigIntField(default=1)

    if TYPE_CHECKING:
        owner_user_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_instance_ownership"
        table_description = "Singleton, non-delegable Instance Owner authority."
        abstract = False


class PlatformOperator(BaseModel):
    """A shared User with independently managed Platform Operator lifecycle."""

    user = fields.ForeignKeyField(
        "models.User",
        related_name="platform_operator_records",
        on_delete=fields.RESTRICT,
        unique=True,
    )
    status = fields.CharEnumField(PlatformOperatorStatus, default=PlatformOperatorStatus.ACTIVE, db_index=True)
    activated_at = fields.DatetimeField(null=True)
    deactivated_at = fields.DatetimeField(null=True)
    deactivated_by_user_id = fields.UUIDField(null=True, db_index=True)
    setup_reason = fields.CharEnumField(PlatformOperatorSetupReason, null=True)
    revision = fields.BigIntField(default=1)

    if TYPE_CHECKING:
        user_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_operators"
        table_description = "Deployment-wide Platform Operator lifecycle records."
        abstract = False
        indexes = (("status", "updated_at"),)


class PlatformOperatorInvitation(BaseModel):
    """A revision-bound invitation that grants no authority until activation."""

    recipient_user = fields.ForeignKeyField(
        "models.User",
        related_name="platform_operator_invitations_received",
        on_delete=fields.RESTRICT,
    )
    invited_by_user = fields.ForeignKeyField(
        "models.User",
        related_name="platform_operator_invitations_sent",
        on_delete=fields.RESTRICT,
    )
    status = fields.CharEnumField(PlatformInvitationStatus, default=PlatformInvitationStatus.PENDING, db_index=True)
    expires_at = fields.DatetimeField(db_index=True)
    recipient_accepted_at = fields.DatetimeField(null=True)
    accepted_at = fields.DatetimeField(null=True)
    acceptance_idempotency_key = fields.CharField(max_length=128, null=True)
    acceptance_correlation_id = fields.UUIDField(null=True, unique=True, db_index=True)
    revoked_at = fields.DatetimeField(null=True)
    invalidated_at = fields.DatetimeField(null=True)
    revision = fields.BigIntField(default=1)
    idempotency_key = fields.CharField(max_length=128)
    correlation_id = fields.UUIDField(unique=True, db_index=True)

    if TYPE_CHECKING:
        recipient_user_id: UUID
        invited_by_user_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_operator_invitations"
        table_description = "Identity-bound Platform Operator invitations without standing authority."
        abstract = False
        unique_together = (("invited_by_user_id", "idempotency_key"),)
        indexes = (("recipient_user_id", "status", "expires_at"), ("invited_by_user_id", "status"))
