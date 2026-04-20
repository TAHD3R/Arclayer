from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.automation.flow import (
    AutomationFlowStatus,
    AutomationOperationKind,
    AutomationRunLogLevel,
    AutomationRunStatus,
    AutomationTriggerKind,
)


class AutomationTriggerOut(BaseSchema):
    kind: AutomationTriggerKind
    event_name: str
    label: str
    description: str


class AutomationOperationKindOut(BaseSchema):
    kind: AutomationOperationKind
    label: str
    description: str
    required_fields: list[str] = Field(default_factory=list)


class AutomationCatalogOut(BaseSchema):
    triggers: list[AutomationTriggerOut] = Field(default_factory=list)
    operations: list[AutomationOperationKindOut] = Field(default_factory=list)


class AutomationOperationIn(BaseSchema):
    name: str = Field(..., min_length=1, max_length=128)
    kind: AutomationOperationKind
    config: dict[str, Any] | None = None
    sort_order: int = Field(default=0)


class AutomationFlowCreateIn(BaseSchema):
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    trigger_kind: AutomationTriggerKind
    status: AutomationFlowStatus = AutomationFlowStatus.ACTIVE
    retry_limit: int = Field(default=0, ge=0, le=5)
    dead_letter_enabled: bool = True
    credential_binding: dict[str, Any] | None = None
    operations: list[AutomationOperationIn] = Field(default_factory=list)


class AutomationFlowPatchIn(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    status: AutomationFlowStatus | None = None
    retry_limit: int | None = Field(default=None, ge=0, le=5)
    dead_letter_enabled: bool | None = None
    credential_binding: dict[str, Any] | None = None
    operations: list[AutomationOperationIn] | None = None


class AutomationOperationOut(BaseSchema):
    id: PublicUUID
    flow_id: PublicUUID
    name: str
    kind: AutomationOperationKind
    config: dict[str, Any] | None = None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class AutomationFlowOut(BaseSchema):
    id: PublicUUID
    workspace_id: UUID
    project_id: UUID | None = None
    name: str
    description: str | None = None
    status: AutomationFlowStatus
    trigger_kind: AutomationTriggerKind
    trigger_event: str
    retry_limit: int
    dead_letter_enabled: bool
    credential_binding: dict[str, Any] | None = None
    created_by_user_id: UUID | None = None
    updated_by_user_id: UUID | None = None
    operations: list[AutomationOperationOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class AutomationFlowListOut(BaseSchema):
    items: list[AutomationFlowOut] = Field(default_factory=list)


class AutomationRunLogOut(BaseSchema):
    id: PublicUUID
    run_id: PublicUUID
    operation_id: PublicUUID | None = None
    level: AutomationRunLogLevel
    message: str
    payload: dict[str, Any] | None = None
    created_at: datetime


class AutomationRunOut(BaseSchema):
    id: PublicUUID
    workspace_id: UUID
    project_id: UUID | None = None
    flow_id: PublicUUID
    trigger_event: str
    status: AutomationRunStatus
    attempt: int
    max_attempts: int
    event_payload: dict[str, Any] | None = None
    result_payload: dict[str, Any] | None = None
    error: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    logs: list[AutomationRunLogOut] = Field(default_factory=list)


class AutomationRunListOut(BaseSchema):
    items: list[AutomationRunOut] = Field(default_factory=list)
