from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import ConfigDict, Field, field_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.operations_signals import OperationalSignalTriageAction, OperationalSignalTriageState
from src.modules.platform_identity.permissions import PlatformPermissionCode


class OperationalSignalSourceLifecycle(StrEnum):
    UNRESOLVED = "unresolved"
    RESOLVED = "resolved"
    ALL = "all"


class OperationalSignalSeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class OperationalSignalOrder(StrEnum):
    PRIORITY = "priority"
    DETECTED_AT = "detected_at"


class OperationalSignalSourceReferenceOut(BaseSchema):
    type: str
    id: PublicUUID


class OperationalSignalFreshnessOut(BaseSchema):
    observed_at: datetime
    source_updated_at: datetime
    age_seconds: int = Field(..., ge=0)


class OperationalSignalPriorityOut(BaseSchema):
    rank: int = Field(..., ge=0)
    reason_keys: tuple[str, ...]


class OperationalSignalCopyOut(BaseSchema):
    title_key: str
    explanation_key: str
    impact_key: str


class OperationalSignalEvidenceOut(BaseSchema):
    summary: JsonObject


class OperationalSignalDestinationOut(BaseSchema):
    route_target: str
    required_permission: PlatformPermissionCode
    authorized: bool


class OperationalSignalTriageOut(BaseSchema):
    revision: int = Field(..., ge=0)
    state: OperationalSignalTriageState
    assignee_user_id: PublicUUID | None = None
    reminder_at: datetime | None = None
    reminder_reason: str | None = None
    last_actor_user_id: PublicUUID | None = None
    updated_at: datetime | None = None


class OperationalSignalAssigneeOut(BaseSchema):
    user_id: PublicUUID
    username: str
    display_name: str | None = None


class OperationalSignalTriageHistoryOut(BaseSchema):
    revision: int = Field(..., ge=1)
    action: OperationalSignalTriageAction
    actor_user_id: PublicUUID | None = None
    from_state: OperationalSignalTriageState | None = None
    to_state: OperationalSignalTriageState
    from_assignee_user_id: PublicUUID | None = None
    to_assignee_user_id: PublicUUID | None = None
    reminder_at: datetime | None = None
    reminder_reason: str | None = None
    created_at: datetime


class OperationalSignalTriageNoteOut(BaseSchema):
    revision: int = Field(..., ge=1)
    actor_user_id: PublicUUID
    body: str
    created_at: datetime


class OperationalSignalOut(BaseSchema):
    id: PublicUUID
    source_domain: str
    signal_type: str
    source_reference: OperationalSignalSourceReferenceOut
    severity: OperationalSignalSeverity
    detected_at: datetime
    freshness: OperationalSignalFreshnessOut
    priority: OperationalSignalPriorityOut
    copy_keys: OperationalSignalCopyOut = Field(..., serialization_alias="copy")
    evidence: OperationalSignalEvidenceOut
    affected_scope: JsonObject
    required_permission: PlatformPermissionCode
    destination: OperationalSignalDestinationOut
    source_lifecycle: OperationalSignalSourceLifecycle
    resolution_condition_key: str
    resolved_at: datetime | None = None
    policy_id: str
    policy_revision: int = Field(..., ge=1)
    triage: OperationalSignalTriageOut
    allowed_triage_actions: tuple[OperationalSignalTriageAction, ...]


class OperationalSignalDetailOut(OperationalSignalOut):
    triage_history: tuple[OperationalSignalTriageHistoryOut, ...]
    notes: tuple[OperationalSignalTriageNoteOut, ...]


class OperationalSignalListQuery(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", use_enum_values=False)

    source_lifecycle: OperationalSignalSourceLifecycle = OperationalSignalSourceLifecycle.UNRESOLVED
    coordination_state: OperationalSignalTriageState | None = None
    source_domain: str | None = Field(default=None, min_length=1, max_length=64)
    severity: OperationalSignalSeverity | None = None
    assignee_user_id: PublicUUID | None = None
    workspace_id: PublicUUID | None = None
    project_id: PublicUUID | None = None
    site_id: PublicUUID | None = None
    include_reminded: bool = False
    order: OperationalSignalOrder = OperationalSignalOrder.PRIORITY
    order_direction: str = Field(default="asc", pattern="^(asc|desc)$")


class OperationalSignalRevisionCommand(BaseSchema):
    model_config = ConfigDict(frozen=True, extra="forbid")

    expected_revision: int = Field(..., ge=0)


class OperationalSignalAssignCommand(OperationalSignalRevisionCommand):
    assignee_user_id: PublicUUID


class OperationalSignalReminderCommand(OperationalSignalRevisionCommand):
    reminder_at: datetime
    reason: str = Field(..., min_length=1, max_length=1000)

    @field_validator("reminder_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("reminderAt must include a timezone")
        return value.astimezone(UTC)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("reason must contain non-whitespace text")
        return normalized


class OperationalSignalNoteCommand(OperationalSignalRevisionCommand):
    body: str = Field(..., min_length=1, max_length=4_000)

    @field_validator("body")
    @classmethod
    def normalize_body(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("body must contain non-whitespace text")
        return normalized


def utc_now() -> datetime:
    return datetime.now(UTC)
