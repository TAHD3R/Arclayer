from __future__ import annotations

from datetime import datetime
from typing import Literal, Self

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.builder._enums import BuilderGenerationStatus
from src.modules.jobs.workspace_schema import JobPublicStatus
from src.modules.projects.builder.change_set_schema import BuilderChangeSetPreviewOut


class BuilderGenerationTargetV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["page", "global_section"]
    item_id: PublicUUID


class BuilderGenerationCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    target_stage: Literal["sitemap", "wireframe", "design"] = "sitemap"
    base_revision_id: PublicUUID
    base_etag: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    agent_run_id: PublicUUID | None = None
    agent_id: PublicUUID | None = None
    objective: str = Field(min_length=1, max_length=8000)
    locale: str = Field(default="zh-CN", min_length=2, max_length=16)
    candidate_count: int = Field(default=1, ge=1, le=3)
    targets: tuple[BuilderGenerationTargetV1, ...] = Field(default=(), max_length=100)
    knowledge_reference_ids: tuple[PublicUUID, ...] = Field(default=(), max_length=50)

    @model_validator(mode="after")
    def validate_request(self) -> Self:
        if not self.objective.strip():
            raise ValueError("objective must contain non-whitespace characters")
        if (self.agent_run_id is None) == (self.agent_id is None):
            raise ValueError("exactly one of agentRunId or agentId is required")
        if self.target_stage == "sitemap" and self.agent_run_id is None:
            raise ValueError("Sitemap generation currently requires agentRunId")
        if self.target_stage == "sitemap" and self.targets:
            raise ValueError("Sitemap generation does not accept targets")
        if self.target_stage in {"wireframe", "design"} and not self.targets:
            raise ValueError(f"{self.target_stage.title()} generation requires at least one target")
        target_identities = [(target.kind, target.item_id) for target in self.targets]
        if len(target_identities) != len(set(target_identities)):
            raise ValueError("targets must be unique")
        if len(self.knowledge_reference_ids) != len(set(self.knowledge_reference_ids)):
            raise ValueError("knowledgeReferenceIds must be unique")
        return self


class BuilderGenerationFailureOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    candidate_index: int = Field(ge=0)
    code: str = Field(min_length=1, max_length=96)
    message_key: str = Field(min_length=1, max_length=128)
    meta: JsonObject = Field(default_factory=dict)


class BuilderGenerationCandidateOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    candidate_index: int = Field(ge=0)
    change_set: BuilderChangeSetPreviewOut


class BuilderGenerationOut(BaseSchema):
    generation_id: PublicUUID
    job_id: PublicUUID
    target_stage: Literal["sitemap", "planning", "wireframe", "design"]
    base_revision_id: PublicUUID
    base_etag: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    targets: tuple[BuilderGenerationTargetV1, ...]
    agent_run_id: PublicUUID | None
    agent_id: PublicUUID | None
    agent_version_id: PublicUUID | None
    agent_assignment_id: PublicUUID | None
    status: BuilderGenerationStatus
    job_status: JobPublicStatus
    phase: str | None
    status_key: str | None
    progress_completed: int
    progress_total: int | None
    candidates: tuple[BuilderGenerationCandidateOut, ...]
    failures: tuple[BuilderGenerationFailureOut, ...]
    cancel_requested_at: datetime | None
    cancellation_acknowledged_at: datetime | None
    created_at: datetime
    updated_at: datetime


class BuilderGenerationCancelRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    reason: str | None = Field(default=None, max_length=512)


class BuilderGenerationRecoveryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    active: BuilderGenerationOut | None
    latest_terminal: BuilderGenerationOut | None
