from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID


class WorkspaceDesignSystemPublicationCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    expected_status_revision: int = Field(ge=1)
    expected_manifest_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    expected_validation_finding_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class WorkspaceDesignSystemArtifactOut(BaseSchema):
    id: PublicUUID
    artifact_input_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    artifact_hash: str | None = Field(default=None, pattern=r"^sha256:[0-9a-f]{64}$")
    status: Literal["pending", "building", "ready", "failed"]
    compiler_version: str
    renderer_profile: str
    renderer_version: str
    component_catalog_version: str | None
    asset_pins_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    failure_code: str | None
    created_at: datetime
    built_at: datetime | None


class WorkspaceDesignSystemPublicationOut(BaseSchema):
    id: PublicUUID
    workspace_id: PublicUUID
    design_system_id: PublicUUID
    version_id: PublicUUID
    manifest_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    validation_finding_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    validator_version: int = Field(ge=1)
    job_id: PublicUUID
    status: Literal["pending", "building", "published", "failed"]
    actor_user_id: PublicUUID
    artifact: WorkspaceDesignSystemArtifactOut
    failure_code: str | None
    created_at: datetime
    published_at: datetime | None
