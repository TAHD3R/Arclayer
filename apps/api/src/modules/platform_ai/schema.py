from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.core.http.pagination import PageData
from src.models.agents.runtime_v1 import AgentExecutionModeV1, AgentRunStatusV1
from src.models.jobs.background_job import JobInternalStatus

PlatformAITaskAction = Literal["retry", "cancel", "reconcile"]
PlatformAITaskOutcome = Literal[
    "active",
    "waiting_workspace_approval",
    "succeeded",
    "failed",
    "partial",
    "unknown",
    "cancelled",
]


class PlatformAITaskListQuery(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    status: AgentRunStatusV1 | None = Field(default=None)
    workspace_id: PublicUUID | None = Field(default=None)
    project_id: PublicUUID | None = Field(default=None)
    agent_id: str | None = Field(default=None, min_length=1, max_length=160)
    agent_version_id: UUID | None = Field(default=None)
    provider: str | None = Field(default=None, min_length=1, max_length=96)
    model: str | None = Field(default=None, min_length=1, max_length=255)
    failure_class: str | None = Field(default=None, min_length=1, max_length=64)
    correlation: str | None = Field(default=None, min_length=1, max_length=192)
    waiting_reason: str | None = Field(default=None, min_length=1, max_length=64)
    age_days: int | None = Field(default=None, ge=1, le=3650)


class PlatformAITaskActionAvailabilityOut(BaseSchema):
    action: PlatformAITaskAction
    state_eligible: bool
    available: bool
    reason_code: str | None = None
    idempotency_required: bool = True


class PlatformAITaskActionRequest(BaseSchema):
    idempotency_key: str = Field(..., min_length=1, max_length=192)
    reason: str | None = Field(default=None, min_length=1, max_length=512)


class PlatformAITaskOut(BaseSchema):
    id: PublicUUID
    workspace_id: PublicUUID
    project_id: PublicUUID | None
    job_id: PublicUUID | None
    status: AgentRunStatusV1
    durable_job_status: JobInternalStatus | None
    execution_mode: AgentExecutionModeV1
    outcome: PlatformAITaskOutcome
    created_at: datetime
    updated_at: datetime
    terminal_at: datetime | None
    interrupt_reason: str | None
    waiting_for_workspace_approval: bool
    status_key: str | None
    progress_completed: int
    progress_total: int | None
    error_code: str | None
    last_sequence: int
    evidence_updated_at: datetime
    actions: tuple[PlatformAITaskActionAvailabilityOut, ...]


class PlatformAITaskTimelineEntryOut(BaseSchema):
    occurred_at: datetime
    source: Literal["run", "job", "attempt", "event", "approval", "recovery"]
    type: str
    status: str | None = None
    sequence: int | None = None
    summary: str


class PlatformAITaskMessageSummaryOut(BaseSchema):
    total: int
    assistant: int
    user: int
    tool: int
    latest_at: datetime | None = None


class PlatformAITaskUsageOut(BaseSchema):
    usage: dict[str, object] | None = None
    settlement: dict[str, object] | None = None
    telemetry_available: bool


class PlatformAITaskDiagnosticsOut(BaseSchema):
    error_code: str | None = None
    failure_classification: str | None = None
    retry_decision: str | None = None
    correlation_id: str
    trace_id: str | None = None
    sanitized_metadata: dict[str, object] | None = None


class PlatformAITaskLinksOut(BaseSchema):
    task_path: str
    run_path: str
    usage_path: str


class PlatformAITaskDossierOut(BaseSchema):
    task: PlatformAITaskOut
    attempts: tuple[dict[str, object], ...]
    timeline: tuple[PlatformAITaskTimelineEntryOut, ...]
    messages: PlatformAITaskMessageSummaryOut
    usage: PlatformAITaskUsageOut
    diagnostics: PlatformAITaskDiagnosticsOut
    links: PlatformAITaskLinksOut
    raw_content_available: bool


class PlatformAIProviderActionAvailabilityOut(BaseSchema):
    action: Literal[
        "test_readiness",
        "enable",
        "disable",
        "rotate_credentials",
        "remove_credentials",
        "archive",
        "restore",
        "delete",
    ]
    available: bool
    reason_code: str | None = None


class PlatformAIProviderOut(BaseSchema):
    id: PublicUUID
    provider: str
    label: str
    default_model: str
    desired_is_active: bool
    archived: bool
    cleanup_required: bool
    configured: bool
    reachable: bool | None
    permitted: bool
    routable: bool
    health: Literal["unknown", "healthy", "unhealthy"]
    health_failure_code: str | None
    freshness_at: datetime | None
    expires_at: datetime | None
    last_used_at: datetime | None
    actions: tuple[PlatformAIProviderActionAvailabilityOut, ...]


class PlatformAIProviderReadinessOut(BaseSchema):
    items: tuple[PlatformAIProviderOut, ...]
    missing_prerequisite_codes: tuple[str, ...]


class PlatformAIRuntimeHealthOut(BaseSchema):
    measured_at: datetime
    current_runs: int
    waiting_runs: int
    failed_runs: int
    queued_jobs: int
    queue_latency_ms: int | None
    provider_readiness: PlatformAIProviderReadinessOut


PlatformAITaskPage = PageData[PlatformAITaskOut]
