from __future__ import annotations

from enum import StrEnum


class BuilderProvenanceSource(StrEnum):
    HUMAN = "human"
    AGENT = "agent"
    IMPORT = "import"
    SYSTEM = "system"


class SiteRevisionLifecycleStatus(StrEnum):
    DRAFT = "draft"
    REVIEW = "review"
    READY = "ready"
    SUPERSEDED = "superseded"


class BuilderChangeSetStatus(StrEnum):
    PREVIEWED = "previewed"
    APPLIED = "applied"
    EXPIRED = "expired"
    FAILED = "failed"


class BuilderApprovalClass(StrEnum):
    NONE = "none"
    REVIEW = "review"
    DESTRUCTIVE = "destructive"


class BuilderApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    CONSUMED = "consumed"
    EXPIRED = "expired"


class BuilderChangeSetCommandKind(StrEnum):
    PREVIEW = "preview"
    APPLY = "apply"


class BuilderGenerationStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    PARTIAL = "partial"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class BuilderCompositionSagaStatus(StrEnum):
    PLANNING_QUEUED = "planning_queued"
    PLANNING_RUNNING = "planning_running"
    PLANNING_REVIEW_PENDING = "planning_review_pending"
    COMPOSITION_QUEUED = "composition_queued"
    COMPOSITION_RUNNING = "composition_running"
    COMPOSITION_REVIEW_PENDING = "composition_review_pending"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class BuilderCompositionSagaPhase(StrEnum):
    PLANNING = "planning"
    COMPOSITION = "composition"
