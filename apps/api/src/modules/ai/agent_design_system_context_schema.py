from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.modules.workspaces.design_systems.manifest import DesignSystemManifestV1
from src.modules.workspaces.design_systems.validator import DesignSystemValidationFinding


class AgentRunDesignSystemContextV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    context_version: Literal[1] = 1
    project_id: PublicUUID
    assignment_id: PublicUUID
    assignment_revision: int = Field(ge=1)
    design_system_id: PublicUUID
    version_id: PublicUUID
    owner_kind: Literal["workspace", "project"]
    manifest_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    validation_finding_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    token_index_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    context_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    manifest: DesignSystemManifestV1
    validation_findings: tuple[DesignSystemValidationFinding, ...]
    compatibility: dict[str, str]
    publish_ready: Literal[False] = False


class AgentRunDesignSystemContextInputV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    context: AgentRunDesignSystemContextV1
    context_byte_size: int = Field(ge=1)
