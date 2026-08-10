from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID


class AgentRunKnowledgeContextV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    context_version: Literal[1] = 1
    workspace_id: PublicUUID
    project_id: PublicUUID | None
    workspace_layer_id: UUID | None
    workspace_revision_id: PublicUUID | None
    workspace_revision_number: int | None = Field(default=None, ge=1)
    workspace_content_hash: str | None = Field(default=None, pattern=r"^sha256:[0-9a-f]{64}$")
    project_layer_id: UUID | None
    project_revision_id: PublicUUID | None
    project_revision_number: int | None = Field(default=None, ge=1)
    project_content_hash: str | None = Field(default=None, pattern=r"^sha256:[0-9a-f]{64}$")
    project_mode: Literal["supplement", "override"] | None
    precedence: tuple[Literal["workspace", "project"], ...]
    effective_guidance: str | None
    attached_knowledge_base_ids: tuple[PublicUUID, ...] = ()
    unavailable_codes: tuple[
        Literal[
            "workspace_guidance_unpublished",
            "project_guidance_unpublished",
            "workspace_guidance_removed",
            "project_guidance_removed",
        ],
        ...,
    ] = ()
    conflict_codes: tuple[Literal["project_override_hides_workspace"], ...] = ()
    context_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class AgentRunKnowledgeSourceSnapshotInputV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    source_order: int = Field(ge=0)
    knowledge_base_id: PublicUUID
    policy_revision: int = Field(ge=1)
    source_id: PublicUUID
    source_version_id: PublicUUID
    source_name: str = Field(min_length=1, max_length=160)
    source_version_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class AgentRunKnowledgeContextInputV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    context: AgentRunKnowledgeContextV1
    sources: tuple[AgentRunKnowledgeSourceSnapshotInputV1, ...] = ()
    context_byte_size: int = Field(ge=1)
