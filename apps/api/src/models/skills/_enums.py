from __future__ import annotations

from enum import StrEnum


class SkillSourceKind(StrEnum):
    BUILTIN = "builtin"
    INLINE = "inline"
    ARCHIVE = "archive"
    GITHUB = "github"


class SkillPackageScope(StrEnum):
    SYSTEM = "system"
    WORKSPACE = "workspace"


class SkillTrustLevel(StrEnum):
    OFFICIAL_VERIFIED = "official_verified"
    WORKSPACE_AUTHORED = "workspace_authored"
    IMPORTED_UNVERIFIED = "imported_unverified"


class SkillPackageStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class SkillVersionStatus(StrEnum):
    CANDIDATE = "candidate"
    VALIDATING = "validating"
    VALID = "valid"
    WARNING = "warning"
    INVALID = "invalid"
    QUARANTINED = "quarantined"
    SUPERSEDED = "superseded"


class SkillValidationStatus(StrEnum):
    VALID = "valid"
    WARNING = "warning"
    INVALID = "invalid"
    QUARANTINED = "quarantined"


class SkillResourceRole(StrEnum):
    INSTRUCTIONS = "instructions"
    REFERENCE = "reference"
    ASSET = "asset"


class SkillInstallationStatus(StrEnum):
    ENABLED = "enabled"
    DISABLED = "disabled"
    FAILED = "failed"
    INCOMPATIBLE = "incompatible"


class SkillUpdateRisk(StrEnum):
    NONE = "none"
    CONTENT = "content"
    CAPABILITY = "capability"
    PERMISSION = "permission"
    DATA_EGRESS = "data_egress"
    INCOMPATIBLE = "incompatible"


class SkillGitHubImportOperation(StrEnum):
    INITIAL = "initial"
    REFRESH = "refresh"


class SkillGitHubImportStatus(StrEnum):
    QUEUED = "queued"
    FETCHING = "fetching"
    PERSISTING = "persisting"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
