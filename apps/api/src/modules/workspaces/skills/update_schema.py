from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.skills._enums import SkillUpdateRisk
from src.modules.workspaces.skills.manifest import (
    SkillCompatibilityV1,
    SkillDataEgressDeclarationV1,
    SkillPermissionDeclarationV1,
    SkillToolRequirementV1,
)
from src.modules.workspaces.skills.schema import (
    SkillInstallationOut,
    SkillValidationFindingOut,
)

SkillUpdateChangeType = Literal["added", "removed", "modified"]


class SkillUpdateTargetOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    version_id: PublicUUID
    version_number: int = Field(ge=1)
    semantic_version: str | None
    package_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    validation_policy_version: int = Field(ge=1)
    validation_status: str
    validation_finding_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class SkillUpdateResourceChangeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    path: str
    change_type: SkillUpdateChangeType
    before_digest: str | None
    after_digest: str | None


class SkillUpdateToolChangeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    tool_id: str
    change_type: SkillUpdateChangeType
    before: SkillToolRequirementV1 | None
    after: SkillToolRequirementV1 | None


class SkillUpdatePermissionChangeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    action: str
    change_type: SkillUpdateChangeType
    before: SkillPermissionDeclarationV1 | None
    after: SkillPermissionDeclarationV1 | None


class SkillUpdateDataEgressChangeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    destination: str
    change_type: SkillUpdateChangeType
    before: SkillDataEgressDeclarationV1 | None
    after: SkillDataEgressDeclarationV1 | None


class SkillUpdateDiffOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    resource_changes: tuple[SkillUpdateResourceChangeOut, ...] = Field(default_factory=tuple)
    instructions_changed: bool
    compatibility_changed: bool
    current_compatibility: SkillCompatibilityV1
    candidate_compatibility: SkillCompatibilityV1
    required_tool_changes: tuple[SkillUpdateToolChangeOut, ...] = Field(default_factory=tuple)
    permission_changes: tuple[SkillUpdatePermissionChangeOut, ...] = Field(default_factory=tuple)
    data_egress_changes: tuple[SkillUpdateDataEgressChangeOut, ...] = Field(default_factory=tuple)
    capability_tags_added: tuple[str, ...] = Field(default_factory=tuple)
    capability_tags_removed: tuple[str, ...] = Field(default_factory=tuple)
    source_provenance_changed: bool
    validation_findings_changed: bool
    current_validation_findings: tuple[SkillValidationFindingOut, ...] = Field(default_factory=tuple)
    candidate_validation_findings: tuple[SkillValidationFindingOut, ...] = Field(default_factory=tuple)


class SkillUpdatePreviewCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    candidate_version_id: PublicUUID
    expected_revision: int = Field(ge=1)
    current_version_id: PublicUUID
    current_package_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    current_validation_finding_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class SkillUpdatePreviewOut(BaseSchema):
    id: PublicUUID
    installation_id: PublicUUID
    expected_revision: int = Field(ge=1)
    current: SkillUpdateTargetOut
    candidate: SkillUpdateTargetOut
    risk: SkillUpdateRisk
    risk_categories: tuple[SkillUpdateRisk, ...]
    diff: SkillUpdateDiffOut
    preview_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    created_by_user_id: PublicUUID | None
    created_at: datetime


class SkillInstallationRepinRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    preview_id: PublicUUID
    preview_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    expected_revision: int = Field(ge=1)
    current_version_id: PublicUUID
    current_package_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    current_validation_finding_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    candidate_version_id: PublicUUID
    candidate_package_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    candidate_validation_finding_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    accepted_required_tools: tuple[str, ...] = Field(default_factory=tuple, max_length=128)
    accepted_permissions: tuple[str, ...] = Field(default_factory=tuple, max_length=128)
    accepted_data_egress: tuple[str, ...] = Field(default_factory=tuple, max_length=128)


class SkillInstallationRepinOut(BaseSchema):
    preview_id: PublicUUID
    installation: SkillInstallationOut
