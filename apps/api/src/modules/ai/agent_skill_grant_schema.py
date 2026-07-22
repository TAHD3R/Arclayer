from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema


class AgentRunSkillGrantSnapshotInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    agent_assignment_id: UUID
    agent_version_id: UUID
    agent_order: int = Field(ge=0)
    skill_order: int = Field(ge=0)
    installation_id: UUID
    package_scope: Literal["system", "workspace"]
    package_id: UUID
    skill_version_id: UUID
    package_checksum: str = Field(min_length=71, max_length=71)
    validation_policy_version: int = Field(ge=1)
    validation_finding_hash: str = Field(min_length=71, max_length=71)
    context_byte_size: int = Field(ge=1)


class AgentSkillContextResource(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    path: str
    role: Literal["instructions", "reference"]
    mime_type: str
    digest: str
    content: str
    byte_size: int = Field(ge=1)


class AgentSkillContextPackage(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    installation_id: UUID
    package_id: UUID
    skill_version_id: UUID
    package_checksum: str
    name: str
    instructions_entrypoint: str
    resources: tuple[AgentSkillContextResource, ...]
