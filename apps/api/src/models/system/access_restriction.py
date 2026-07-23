from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class AccessRestrictionEntityType(StrEnum):
    USER = "user"
    WORKSPACE = "workspace"
    PROJECT = "project"


class AccessRestrictionType(StrEnum):
    USER_DISABLED = "user_disabled"
    WORKSPACE_SUSPENDED = "workspace_suspended"
    WORKSPACE_ARCHIVED = "workspace_archived"
    PROJECT_SUSPENDED = "project_suspended"


class AccessRestrictionState(StrEnum):
    ACTIVE = "active"
    LIFTED = "lifted"


class AccessRestrictionReasonCategory(StrEnum):
    POLICY_VIOLATION = "policy_violation"
    SECURITY_RISK = "security_risk"
    BILLING_ISSUE = "billing_issue"
    ABUSE_PREVENTION = "abuse_prevention"
    COMPLIANCE_REVIEW = "compliance_review"
    OWNER_REQUEST = "owner_request"
    OTHER = "other"


class AccessRestrictionRecord(BaseModel):
    """Current revisioned restriction authority for one entity and restriction type."""

    entity_type = fields.CharEnumField(AccessRestrictionEntityType, max_length=16, db_index=True)
    entity_id = fields.UUIDField(db_index=True)
    restriction_type = fields.CharEnumField(AccessRestrictionType, max_length=32, db_index=True)
    state = fields.CharEnumField(
        AccessRestrictionState,
        max_length=16,
        default=AccessRestrictionState.ACTIVE,
        db_index=True,
    )
    reason_category = fields.CharEnumField(AccessRestrictionReasonCategory, max_length=32)
    reason_code = fields.CharField(max_length=64)
    operator_note = fields.TextField()
    effective_at = fields.DatetimeField(db_index=True)
    review_at = fields.DatetimeField(null=True, db_index=True)
    expires_at = fields.DatetimeField(null=True, db_index=True)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    lifted_at = fields.DatetimeField(null=True, db_index=True)
    lifted_by_user_id = fields.UUIDField(null=True, db_index=True)
    lift_note = fields.TextField(null=True)
    revision = fields.IntField(default=1)
    audit_event_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "access_restrictions"
        table_description = "Revisioned authority for user, workspace, and project access restrictions."
        abstract = False
        unique_together = (("entity_type", "entity_id", "restriction_type"),)
        indexes = (
            ("entity_type", "entity_id", "state"),
            ("restriction_type", "state", "effective_at"),
        )


class AccessRestrictionCommandRecord(BaseModel):
    """Immutable idempotency evidence for one restriction transition command."""

    restriction = fields.ForeignKeyField(
        "models.AccessRestrictionRecord",
        related_name="commands",
        on_delete=fields.CASCADE,
    )
    entity_type = fields.CharEnumField(AccessRestrictionEntityType, max_length=16, db_index=True)
    entity_id = fields.UUIDField(db_index=True)
    restriction_type = fields.CharEnumField(AccessRestrictionType, max_length=32, db_index=True)
    idempotency_key = fields.CharField(max_length=128, unique=True)
    request_fingerprint = fields.CharField(max_length=64)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    resulting_revision = fields.IntField()
    result_snapshot = fields.JSONField()

    if TYPE_CHECKING:
        restriction_id: UUID

    class Meta(BaseModel.Meta):
        table = "access_restriction_commands"
        table_description = "Immutable idempotent command results for access restriction transitions."
        abstract = False
        indexes = (("entity_type", "entity_id", "created_at"),)
