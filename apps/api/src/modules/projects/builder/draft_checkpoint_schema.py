from __future__ import annotations

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.builder._enums import BuilderProvenanceSource
from src.modules.projects.builder.change_set_schema import BuilderOperationV1


class BuilderDraftCheckpointSaveIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    base_revision_id: PublicUUID
    base_etag: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    expected_checkpoint_version: int = Field(ge=0)
    client_session_id: str = Field(min_length=1, max_length=128)
    operations: tuple[BuilderOperationV1, ...] = Field(max_length=100)
    provenance_source: BuilderProvenanceSource = BuilderProvenanceSource.HUMAN
    agent_run_id: PublicUUID | None = None
    agent_id: PublicUUID | None = None

    @model_validator(mode="after")
    def validate_provenance_identity(self) -> Self:
        is_agent = self.provenance_source is BuilderProvenanceSource.AGENT
        if is_agent and ((self.agent_run_id is None) == (self.agent_id is None)):
            raise ValueError("exactly one of agentRunId or agentId is required for agent provenance")
        if not is_agent and (self.agent_run_id is not None or self.agent_id is not None):
            raise ValueError("Agent identity is only valid for agent provenance")
        return self


class BuilderDraftCheckpointOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    id: PublicUUID
    project_id: PublicUUID
    client_session_id: str
    base_revision_id: PublicUUID
    base_etag: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    checkpoint_version: int = Field(ge=1)
    operations: tuple[BuilderOperationV1, ...]
    operations_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    status: Literal["draft", "conflict", "applied", "discarded"]
    provenance_source: BuilderProvenanceSource
    conflict_meta: JsonObject | None = None
    applied_change_set_id: UUID | None = None
    created_at: datetime
    updated_at: datetime
