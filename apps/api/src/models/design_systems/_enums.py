from __future__ import annotations

from enum import StrEnum


class DesignSystemOwnerKind(StrEnum):
    WORKSPACE = "workspace"
    PROJECT = "project"


class DesignSystemStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class DesignSystemVersionSource(StrEnum):
    MANUAL = "manual"
    AGENT = "agent"
    IMPORT = "import"
    DERIVED = "derived"
    FORK = "fork"


class DesignSystemVersionStatus(StrEnum):
    CANDIDATE = "candidate"
    VALIDATING = "validating"
    VALID = "valid"
    PUBLISHED = "published"
    INVALID = "invalid"
    SUPERSEDED = "superseded"
    ARCHIVED = "archived"


class DesignSystemValidationStatus(StrEnum):
    VALID = "valid"
    INVALID = "invalid"


class DesignSystemValidationSeverity(StrEnum):
    WARNING = "warning"
    BLOCKER = "blocker"


class DesignSystemConceptGenerationStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    PARTIAL = "partial"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
