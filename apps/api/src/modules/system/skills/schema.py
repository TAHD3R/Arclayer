from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.modules.workspaces.skills.manifest import SkillManifestV1
from src.modules.workspaces.skills.schema import (
    SkillGitHubImportCreateRequest,
    SkillPackageCreateRequest,
    SkillResourceOut,
    SkillValidationFindingOut,
    SkillVersionCreateRequest,
)


class PlatformSkillPackageCreateRequest(SkillPackageCreateRequest):
    """Create one Arclayer-maintained package and its first immutable version."""


class PlatformSkillVersionCreateRequest(SkillVersionCreateRequest):
    """Publish another immutable version for an official package."""


class PlatformSkillPackageUpdateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=1)
    display_name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, min_length=1, max_length=1000)

    @model_validator(mode="after")
    def _require_change(self) -> PlatformSkillPackageUpdateRequest:
        if self.display_name is None and self.description is None:
            raise ValueError("At least one mutable Skill metadata field is required")
        return self


class PlatformSkillPackageReplaceRequest(SkillVersionCreateRequest):
    """Atomically update package copy and publish the edited Skill content."""

    expected_revision: int = Field(ge=1)
    display_name: str = Field(min_length=1, max_length=128)
    description: str = Field(min_length=1, max_length=1000)


class PlatformSkillGitHubImportRequest(SkillGitHubImportCreateRequest):
    """Synchronously import one bounded public GitHub Skill snapshot."""


class PlatformSkillCapabilitiesOut(BaseSchema):
    supported_tool_ids: tuple[str, ...]


class PlatformSkillValidationOut(BaseSchema):
    id: PublicUUID
    policy_version: int = Field(ge=1)
    status: str
    findings: tuple[SkillValidationFindingOut, ...]
    finding_hash: str
    actor_user_id: PublicUUID | None
    created_at: datetime


class PlatformSkillVersionOut(BaseSchema):
    id: PublicUUID
    package_id: PublicUUID
    version_number: int = Field(ge=1)
    semantic_version: str | None
    package_checksum: str
    status: str
    manifest: SkillManifestV1
    resources: tuple[SkillResourceOut, ...]
    source_provenance: dict[str, object]
    validation: PlatformSkillValidationOut
    created_by_user_id: PublicUUID | None
    created_at: datetime


class PlatformSkillPackageSummaryOut(BaseSchema):
    id: PublicUUID
    stable_key: str
    slug: str
    display_name: str
    description: str
    display_name_key: str | None = None
    description_key: str | None = None
    status: str
    latest_valid_version_id: PublicUUID | None
    metadata_revision: int = Field(ge=1)
    version_count: int = Field(ge=0)
    source_authority: str
    created_by_user_id: PublicUUID | None
    updated_by_user_id: PublicUUID | None
    created_at: datetime
    updated_at: datetime


class PlatformSkillPackageDetailOut(PlatformSkillPackageSummaryOut):
    versions: tuple[PlatformSkillVersionOut, ...]
