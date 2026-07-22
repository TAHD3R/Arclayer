from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.modules.analytics.schema import ActivityUserSummaryOut


class ObservabilityTrendMetric(StrEnum):
    HTTP_REQUESTS = "httpRequests"
    HTTP_ERRORS = "httpErrors"
    HTTP_LATENCY = "httpLatency"
    AI_REQUESTS = "requests"
    AI_ERRORS = "errors"
    AI_LATENCY = "latency"
    TOKENS = "tokens"
    COST = "cost"
    AUDIT_EVENTS = "auditEvents"


class HTTPRequestRecordOrdering(StrEnum):
    OCCURRED_DESC = "-occurred_at"
    OCCURRED_ASC = "occurred_at"
    DURATION_DESC = "-duration_ms"
    DURATION_ASC = "duration_ms"
    STATUS_DESC = "-status_code"


class HTTPRequestGroupOrdering(StrEnum):
    REQUESTS_DESC = "-requests"
    ERROR_RATE_DESC = "-error_rate"
    P95_DESC = "-p95_latency_ms"
    P99_DESC = "-p99_latency_ms"
    AVG_LATENCY_DESC = "-avg_latency_ms"
    LAST_SEEN_DESC = "-last_seen_at"


class ObservabilityPeriodOut(BaseSchema):
    start_date: date
    end_date: date
    days: int


class ObservabilityResourcesOut(BaseSchema):
    active_workspaces: int | None = None
    active_projects: int
    active_users: int | None = None
    active_members: int | None = None


class HTTPObservabilitySummaryOut(BaseSchema):
    requests: int
    error_requests: int
    error_rate: float = Field(ge=0, le=1)
    avg_latency_ms: float = Field(ge=0)
    p95_latency_ms: float | None = Field(default=None, ge=0)
    p99_latency_ms: float | None = Field(default=None, ge=0)
    max_latency_ms: int = Field(ge=0)


class AIObservabilitySummaryOut(BaseSchema):
    requests: int
    error_requests: int
    error_rate: float = Field(ge=0, le=1)
    p50_latency_ms: float = Field(ge=0)
    p95_latency_ms: float = Field(ge=0)
    p99_latency_ms: float = Field(ge=0)
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_micros: int


class ObservabilityOperationsOut(BaseSchema):
    audit_events: int
    open_feedback: int
    active_subscriptions: int


class ObservabilityAttributionCoverageOut(BaseSchema):
    supported: bool
    attributed_records: int = Field(ge=0)
    total_records: int = Field(ge=0)
    coverage_rate: float = Field(ge=0, le=1)


class ObservabilityDataAvailabilityOut(BaseSchema):
    http_project_attribution: ObservabilityAttributionCoverageOut
    ai_project_attribution: ObservabilityAttributionCoverageOut
    audit_project_attribution: ObservabilityAttributionCoverageOut


class ObservabilityOverviewOut(BaseSchema):
    period: ObservabilityPeriodOut
    resources: ObservabilityResourcesOut
    http: HTTPObservabilitySummaryOut
    ai: AIObservabilitySummaryOut
    operations: ObservabilityOperationsOut
    data_availability: ObservabilityDataAvailabilityOut


class ObservabilityTrendPointOut(BaseSchema):
    date: date
    value: int | float


class ObservabilityTrendOut(BaseSchema):
    metric: ObservabilityTrendMetric
    period: ObservabilityPeriodOut
    points: list[ObservabilityTrendPointOut]
    total: int | float


class HTTPRequestGroupOut(BaseSchema):
    route_template: str
    method: str
    status_class: int = Field(ge=0, le=5)
    requests: int = Field(ge=0)
    error_requests: int = Field(ge=0)
    error_rate: float = Field(ge=0, le=1)
    avg_latency_ms: float = Field(ge=0)
    p95_latency_ms: float | None = Field(default=None, ge=0)
    p99_latency_ms: float | None = Field(default=None, ge=0)
    max_latency_ms: int = Field(ge=0)
    last_seen_at: datetime


class HTTPRequestRecordOut(BaseSchema):
    id: PublicUUID
    occurred_at: datetime
    trace_id: str | None = None
    actor_user_id: PublicUUID | None = None
    actor: ActivityUserSummaryOut | None = None
    workspace_id: PublicUUID | None = None
    project_id: PublicUUID | None = None
    route_template: str
    method: str
    status_code: int = Field(ge=0, le=599)
    duration_ms: int = Field(ge=0)


class AIUsageGroupOut(BaseSchema):
    provider: str
    model: str
    requests: int = Field(ge=0)
    error_requests: int = Field(ge=0)
    error_rate: float = Field(ge=0, le=1)
    prompt_tokens: int = Field(ge=0)
    completion_tokens: int = Field(ge=0)
    total_tokens: int = Field(ge=0)
    cost_micros: int = Field(ge=0)
    avg_latency_ms: float = Field(ge=0)
    last_seen_at: datetime
