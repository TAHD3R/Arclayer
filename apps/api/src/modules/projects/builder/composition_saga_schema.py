from __future__ import annotations

from datetime import datetime
from typing import Literal, Self

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.builder._enums import BuilderCompositionSagaStatus
from src.modules.projects.builder.generation_schema import BuilderGenerationOut, BuilderGenerationTargetV1


class BuilderCompositionSagaCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    base_revision_id: PublicUUID
    base_etag: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    agent_run_id: PublicUUID | None = None
    agent_id: PublicUUID | None = None
    objective: str = Field(min_length=1, max_length=8000)
    locale: str = Field(default="zh-CN", min_length=2, max_length=16)
    candidate_count: int = Field(default=1, ge=1, le=3)
    targets: tuple[BuilderGenerationTargetV1, ...] = Field(min_length=1, max_length=100)
    knowledge_reference_ids: tuple[PublicUUID, ...] = Field(default=(), max_length=50)

    @model_validator(mode="after")
    def validate_request(self) -> Self:
        if not self.objective.strip():
            raise ValueError("objective must contain non-whitespace characters")
        if (self.agent_run_id is None) == (self.agent_id is None):
            raise ValueError("exactly one of agentRunId or agentId is required")
        target_identities = [(target.kind, target.item_id) for target in self.targets]
        if len(target_identities) != len(set(target_identities)):
            raise ValueError("targets must be unique")
        if len(self.knowledge_reference_ids) != len(set(self.knowledge_reference_ids)):
            raise ValueError("knowledgeReferenceIds must be unique")
        return self


class BuilderCompositionSagaPhaseTransitionRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    expected_phase: Literal["planning", "composition"]
    applied_change_set_id: PublicUUID
    applied_site_revision_id: PublicUUID


class BuilderCompositionSagaCancelRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    reason: str | None = Field(default=None, max_length=512)


class BuilderCompositionSagaFailureOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    code: str = Field(min_length=1, max_length=96)
    message_key: str = Field(min_length=1, max_length=128)
    meta: JsonObject = Field(default_factory=dict)


class BuilderCompositionSagaOut(BaseSchema):
    saga_id: PublicUUID
    status: BuilderCompositionSagaStatus
    current_phase: Literal["planning", "composition", "completed"]
    initial_base_revision_id: PublicUUID
    initial_base_etag: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    targets: tuple[BuilderGenerationTargetV1, ...]
    planning_targets: tuple[BuilderGenerationTargetV1, ...]
    agent_run_id: PublicUUID | None
    agent_id: PublicUUID
    agent_version_id: PublicUUID
    agent_assignment_id: PublicUUID
    waiting_reason: Literal["planning_review", "composition_review"] | None
    planning_generation: BuilderGenerationOut
    planning_change_set_id: PublicUUID | None
    planning_result_revision_id: PublicUUID | None
    composition_generation: BuilderGenerationOut | None
    composition_change_set_id: PublicUUID | None
    composition_result_revision_id: PublicUUID | None
    failure: BuilderCompositionSagaFailureOut | None
    cancel_requested_at: datetime | None
    created_at: datetime
    updated_at: datetime


class BuilderCompositionSagaRecoveryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    active: BuilderCompositionSagaOut | None
    latest_terminal: BuilderCompositionSagaOut | None


__all__ = [
    "BuilderCompositionSagaCancelRequest",
    "BuilderCompositionSagaCreateRequest",
    "BuilderCompositionSagaFailureOut",
    "BuilderCompositionSagaOut",
    "BuilderCompositionSagaPhaseTransitionRequest",
    "BuilderCompositionSagaRecoveryOut",
]
