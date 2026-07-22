from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.modules.projects.builder.schema import ContentStructureSnapshotV1, SiteRevisionManifestV1


class AgentRunBuilderContextV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    context_version: Literal[1] = 1
    workspace_id: PublicUUID
    project_id: PublicUUID
    site_id: PublicUUID
    environment_id: PublicUUID
    site_revision_id: PublicUUID
    revision_number: int = Field(ge=1)
    manifest_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    status_etag: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    content_structure_revision_id: PublicUUID
    content_structure_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    manifest: SiteRevisionManifestV1
    content_structure: ContentStructureSnapshotV1
    context_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class AgentRunBuilderContextInputV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    context: AgentRunBuilderContextV1
    context_byte_size: int = Field(ge=1)
