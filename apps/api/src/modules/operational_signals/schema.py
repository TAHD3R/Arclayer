from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import ConfigDict, Field, field_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.operations_signals import OperationalSignalTriageAction, OperationalSignalTriageState
from src.modules.platform_identity.permissions import PlatformPermissionCode


class OperationalSignalSourceLifecycle(StrEnum):
    UNRESOLVED = "unresolved"
    RESOLVED = "resolved"
    ALL = "all"


class OperationalSignalSeverity(StrEnum):
    HIGH = "high"


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
    job_type: str
    workload_class: str
    attempt_count: int = Field(..., ge=0)
    error_code: str | None = None
    status_key: str | None = None
    workspace_id: PublicUUID | None = None
    project_id: PublicUUID | None = None
    site_id: PublicUUID | None = None


class OperationalSignalDestinationOut(BaseSchema):
    path: str
    label_key: str


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
    required_permission: PlatformPermissionCode
    destination: OperationalSignalDestinationOut
    source_lifecycle: OperationalSignalSourceLifecycle
    resolution_condition_key: str
    resolved_at: datetime | None = None
    triage: OperationalSignalTriageOut
    allowed_triage_actions: tuple[OperationalSignalTriageAction, ...]


class OperationalSignalDetailOut(OperationalSignalOut):
    triage_history: tuple[OperationalSignalTriageHistoryOut, ...]


class OperationalSignalListQuery(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    source_lifecycle: OperationalSignalSourceLifecycle = OperationalSignalSourceLifecycle.UNRESOLVED
    coordination_state: OperationalSignalTriageState | None = None
    assignee_user_id: PublicUUID | None = None
    workspace_id: PublicUUID | None = None
    project_id: PublicUUID | None = None
    site_id: PublicUUID | None = None
    include_reminded: bool = False


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


def utc_now() -> datetime:
    return datetime.now(UTC)
