from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.core.http.pagination import PageData
from src.models.agents.runtime_v1 import AgentExecutionModeV1, AgentRunStatusV1


class PlatformAITaskListQuery(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    status: AgentRunStatusV1 | None = Field(default=None)


class PlatformAITaskOut(BaseSchema):
    id: PublicUUID
    workspace_id: PublicUUID
    project_id: PublicUUID | None
    status: AgentRunStatusV1
    execution_mode: AgentExecutionModeV1
    created_at: datetime
    updated_at: datetime
    terminal_at: datetime | None
    interrupt_reason: str | None
    status_key: str | None
    progress_completed: int
    progress_total: int | None
    error_code: str | None
    last_sequence: int


class PlatformAIProviderOut(BaseSchema):
    id: PublicUUID
    provider: str
    label: str
    request_model: str
    is_active: bool
    configured: bool
    expires_at: datetime | None
    last_used_at: datetime | None


class PlatformAIProviderReadinessOut(BaseSchema):
    items: tuple[PlatformAIProviderOut, ...]
    missing_prerequisite_codes: tuple[str, ...]


PlatformAITaskPage = PageData[PlatformAITaskOut]
