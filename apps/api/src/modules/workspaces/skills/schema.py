from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field, field_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.skills._enums import SkillPackageScope
from src.modules.workspaces.skills.manifest import (
    SkillDataEgressDeclarationV1,
    SkillManifestV1,
    SkillPermissionDeclarationV1,
    SkillToolRequirementV1,
    normalize_skill_resource_path,
)


class SkillCursorPage[T](BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    items: tuple[T, ...] = Field(default_factory=tuple)
    next_cursor: PublicUUID | None = None


class SkillInlineReferenceInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    path: str = Field(min_length=1, max_length=512)
    content: str = Field(min_length=1, max_length=262_144)
    mime_type: Literal["text/markdown", "text/plain", "application/json"] = "text/markdown"

    @field_validator("path")
    @classmethod
    def _validate_path(cls, value: str) -> str:
        normalized = normalize_skill_resource_path(value)
        if normalized != value:
            raise ValueError("Reference path must already be normalized")
        if normalized == "SKILL.md":
            raise ValueError("Reference path cannot replace the Skill instructions entrypoint")
        return normalized


class SkillInlineVersionInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    instructions: str = Field(min_length=1, max_length=524_288)
    references: tuple[SkillInlineReferenceInput, ...] = Field(default_factory=tuple, max_length=128)
    semantic_version: str | None = Field(default=None, min_length=1, max_length=64)
    required_tools: tuple[SkillToolRequirementV1, ...] = Field(default_factory=tuple, max_length=128)
    permissions: tuple[SkillPermissionDeclarationV1, ...] = Field(default_factory=tuple, max_length=128)
    data_egress: tuple[SkillDataEgressDeclarationV1, ...] = Field(default_factory=tuple, max_length=128)
    capability_tags: tuple[str, ...] = Field(default_factory=tuple, max_length=128)


class SkillPackageCreateRequest(SkillInlineVersionInput):
    slug: str = Field(min_length=1, max_length=96)
    display_name: str = Field(min_length=1, max_length=128)
    description: str = Field(min_length=1, max_length=1000)


class SkillVersionCreateRequest(SkillInlineVersionInput):
    pass


class SkillResourceOut(BaseSchema):
    path: str
    role: str
    mime_type: str
    byte_size: int = Field(ge=1)
    digest: str
    content: str | None = None


class SkillVersionSummaryOut(BaseSchema):
    id: PublicUUID
    package_id: PublicUUID
    workspace_id: PublicUUID
    version_number: int = Field(ge=1)
    semantic_version: str | None
    package_checksum: str
    status: str
    validation_policy_version: int = Field(ge=1)
    created_by_user_id: PublicUUID | None
    created_at: datetime


class SkillVersionDetailOut(SkillVersionSummaryOut):
    manifest: SkillManifestV1
    resources: tuple[SkillResourceOut, ...]
    source_provenance: dict[str, object]


class SkillPackageSummaryOut(BaseSchema):
    id: PublicUUID
    workspace_id: PublicUUID
    slug: str
    display_name: str
    description: str
    source_kind: str
    trust_level: str
    publisher_id: str
    publisher_name: str
    status: str
    latest_valid_version_id: PublicUUID | None
    metadata_revision: int = Field(ge=1)
    version_count: int = Field(ge=0)
    created_by_user_id: PublicUUID | None
    updated_by_user_id: PublicUUID | None
    created_at: datetime
    updated_at: datetime


class SkillPackageDetailOut(SkillPackageSummaryOut):
    latest_version: SkillVersionSummaryOut | None


class SkillPackageCreateOut(BaseSchema):
    package: SkillPackageDetailOut
    version: SkillVersionDetailOut


class WorkspaceSkillsCapabilitiesOut(BaseSchema):
    inline_authoring_available: Literal[True]
    immutable_versions: Literal[True]
    official_catalog_available: bool
    github_import_available: bool
    validation_available: bool
    installation_available: bool
    agent_skill_grants_available: bool


class SkillGitHubImportCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    repository_url: str = Field(min_length=1, max_length=2048)
    requested_ref: str = Field(min_length=1, max_length=256)
    subpath: str = Field(default="", max_length=512)
    slug: str = Field(min_length=1, max_length=96)
    display_name: str = Field(min_length=1, max_length=128)
    description: str = Field(min_length=1, max_length=1000)


class SkillGitHubImportAcceptedOut(BaseSchema):
    import_id: PublicUUID
    job_id: PublicUUID
    operation: Literal["initial", "refresh"]
    status: Literal["queued"] = "queued"


class SkillGitHubImportOut(BaseSchema):
    id: PublicUUID
    workspace_id: PublicUUID
    package_id: PublicUUID | None
    version_id: PublicUUID | None
    operation: Literal["initial", "refresh"]
    status: Literal["queued", "fetching", "persisting", "succeeded", "failed", "cancelled"]
    repository_url: str
    requested_ref: str
    subpath: str
    request_revision: str
    resolved_commit: str | None
    resolved_tree: str | None
    job_id: PublicUUID | None
    safe_error_code: str | None
    safe_error_message: str | None
    actor_user_id: PublicUUID | None
    created_at: datetime
    updated_at: datetime


class SkillValidationCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    policy_version: Literal[1] = 1


class SkillValidationFindingOut(BaseSchema):
    code: str
    severity: Literal["warning", "error"]
    resource_path: str | None = None
    message_key: str
    message: str


class SkillValidationResultOut(BaseSchema):
    id: PublicUUID
    version_id: PublicUUID
    workspace_id: PublicUUID
    policy_version: int = Field(ge=1)
    status: str
    findings: tuple[SkillValidationFindingOut, ...]
    finding_hash: str
    actor_user_id: PublicUUID | None
    created_at: datetime


class OfficialSkillCatalogItemOut(BaseSchema):
    package_id: PublicUUID
    version_id: PublicUUID
    package_scope: Literal["system"] = "system"
    slug: str
    display_name: str
    description: str
    display_name_key: str
    description_key: str
    publisher_id: str
    publisher_name: str
    publisher_verified: Literal[True]
    semantic_version: str | None
    version_number: int = Field(ge=1)
    package_checksum: str
    capability_tags: tuple[str, ...]
    validation_status: str
    validation_finding_hash: str
    installed: bool
    installation_id: PublicUUID | None = None
    installation_version_id: PublicUUID | None = None
    installation_status: str | None = None
    installation_metadata_revision: int | None = Field(default=None, ge=1)
    updated_at: datetime


class OfficialSkillValidationEvidenceOut(BaseSchema):
    policy_version: int = Field(ge=1)
    status: str
    findings: tuple[SkillValidationFindingOut, ...]
    finding_hash: str
    created_at: datetime


class OfficialSkillCatalogDetailOut(OfficialSkillCatalogItemOut):
    manifest: SkillManifestV1
    resources: tuple[SkillResourceOut, ...]
    validation: OfficialSkillValidationEvidenceOut


class SkillInstallationCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    package_scope: SkillPackageScope
    package_id: PublicUUID
    version_id: PublicUUID
    expected_package_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    validation_finding_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    accepted_required_tools: tuple[str, ...] = Field(default_factory=tuple, max_length=128)
    accepted_permissions: tuple[str, ...] = Field(default_factory=tuple, max_length=128)
    accepted_data_egress: tuple[str, ...] = Field(default_factory=tuple, max_length=128)

    @field_validator(
        "accepted_required_tools",
        "accepted_permissions",
        "accepted_data_egress",
    )
    @classmethod
    def _require_unique_acceptances(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        if len(values) != len(set(values)):
            raise ValueError("Accepted declaration identities must be unique")
        return values


class SkillInstallationUpdateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=1)
    enabled: bool


class SkillInstallationOut(BaseSchema):
    id: PublicUUID
    workspace_id: PublicUUID
    package_scope: str
    package_id: PublicUUID
    version_id: PublicUUID
    package_checksum: str
    status: str
    safe_reason_code: str | None
    accepted_required_tools: tuple[str, ...]
    accepted_permissions: tuple[str, ...]
    accepted_data_egress: tuple[str, ...]
    validation_finding_hash: str
    metadata_revision: int = Field(ge=1)
    installed_by_user_id: PublicUUID | None
    updated_by_user_id: PublicUUID | None
    created_at: datetime
    updated_at: datetime
