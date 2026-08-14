from __future__ import annotations

from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.design_systems._enums import DesignSystemConceptGenerationStatus
from src.modules.jobs.workspace_schema import JobPublicStatus
from src.modules.workspaces.design_systems.manifest import DesignSystemManifestInputV1
from src.modules.workspaces.design_systems.schema import (
    DesignSystemValidationResultOut,
    DesignSystemVersionDetailOut,
)


class DesignSystemConceptGenerationCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    base_version_id: PublicUUID
    expected_base_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    base_revision_id: PublicUUID
    base_etag: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    agent_run_id: PublicUUID | None = None
    agent_id: PublicUUID | None = None
    objective: str = Field(min_length=1, max_length=8000)
    locale: str = Field(default="zh-CN", min_length=2, max_length=16)
    candidate_count: int = Field(default=2, ge=1, le=3)

    @model_validator(mode="after")
    def validate_request(self) -> Self:
        if not self.objective.strip():
            raise ValueError("objective must contain non-whitespace characters")
        if (self.agent_run_id is None) == (self.agent_id is None):
            raise ValueError("exactly one of agentRunId or agentId is required")
        return self


class DesignSystemConceptGenerationFailureOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    candidate_index: int = Field(ge=0)
    code: str = Field(min_length=1, max_length=96)
    message_key: str = Field(min_length=1, max_length=128)
    meta: JsonObject = Field(default_factory=dict)


class DesignSystemConceptFeedbackEntryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    comment: str = Field(min_length=1, max_length=2000)
    actor_user_id: PublicUUID
    created_at: datetime


class DesignSystemConceptGenerationCandidateOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    candidate_index: int = Field(ge=0)
    summary: str = Field(min_length=1, max_length=1000)
    version: DesignSystemVersionDetailOut
    validation: DesignSystemValidationResultOut
    feedback: tuple[DesignSystemConceptFeedbackEntryOut, ...] = ()


class DesignSystemConceptGenerationOut(BaseSchema):
    generation_id: PublicUUID
    job_id: PublicUUID
    design_system_id: PublicUUID
    base_version_id: PublicUUID
    base_revision_id: PublicUUID
    agent_run_id: PublicUUID | None
    agent_id: PublicUUID | None
    agent_version_id: PublicUUID | None
    agent_assignment_id: PublicUUID | None
    status: DesignSystemConceptGenerationStatus
    job_status: JobPublicStatus
    phase: str | None
    status_key: str | None
    progress_completed: int
    progress_total: int | None
    candidates: tuple[DesignSystemConceptGenerationCandidateOut, ...]
    failures: tuple[DesignSystemConceptGenerationFailureOut, ...]
    cancel_requested_at: datetime | None
    cancellation_acknowledged_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DesignSystemConceptGenerationRecoveryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    active: DesignSystemConceptGenerationOut | None
    latest_terminal: DesignSystemConceptGenerationOut | None


class DesignSystemConceptGenerationCancelRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    reason: str | None = Field(default=None, max_length=512)


class DesignSystemConceptGenerationFeedbackRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    concept_index: int = Field(ge=0)
    comment: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def validate_feedback(self) -> Self:
        if not self.comment.strip():
            raise ValueError("comment must contain non-whitespace characters")
        return self


class AgentDesignSystemConceptVersionCreate(BaseSchema):
    """Internal exact command for one immutable Agent concept candidate."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    generation_id: UUID
    candidate_index: int = Field(ge=0)
    base_version_id: UUID
    expected_base_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    agent_run_id: UUID | None
    agent_id: UUID
    agent_version_id: UUID
    agent_assignment_id: UUID
    summary: str = Field(min_length=1, max_length=1000)
    manifest: DesignSystemManifestInputV1
