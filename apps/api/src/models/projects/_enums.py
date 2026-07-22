from __future__ import annotations

from enum import StrEnum


class ProjectAuthoringMode(StrEnum):
    BUILDER_MANAGED = "builder_managed"
    SOURCE_MANAGED = "source_managed"


class ProjectAuthoringState(StrEnum):
    READY = "ready"
    MIGRATION_REQUIRED = "migration_required"
