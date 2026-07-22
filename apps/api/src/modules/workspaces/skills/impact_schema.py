from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID

SkillImpactBlocker = Literal["agent_versions", "assignments", "retained_runs"]
SkillPackageImpactBlocker = Literal[
    "installations",
    "agent_versions",
    "assignments",
    "retained_runs",
    "active_github_operations",
]


class SkillInstallationImpactOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    installation_id: PublicUUID
    metadata_revision: int = Field(ge=1)
    status: str
    agent_version_count: int = Field(ge=0)
    published_agent_version_count: int = Field(ge=0)
    assignment_count: int = Field(ge=0)
    enabled_assignment_count: int = Field(ge=0)
    retained_run_count: int = Field(ge=0)
    blockers: tuple[SkillImpactBlocker, ...] = Field(default_factory=tuple)
    can_remove: bool


class SkillInstallationRemovalOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    installation_id: PublicUUID
    removed: Literal[True] = True
    impact: SkillInstallationImpactOut
    removed_at: datetime


class SkillPackageImpactOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    package_id: PublicUUID
    metadata_revision: int = Field(ge=1)
    status: str
    version_count: int = Field(ge=0)
    resource_count: int = Field(ge=0)
    validation_count: int = Field(ge=0)
    installation_count: int = Field(ge=0)
    enabled_installation_count: int = Field(ge=0)
    agent_version_count: int = Field(ge=0)
    published_agent_version_count: int = Field(ge=0)
    assignment_count: int = Field(ge=0)
    enabled_assignment_count: int = Field(ge=0)
    retained_run_count: int = Field(ge=0)
    active_github_operation_count: int = Field(ge=0)
    blockers: tuple[SkillPackageImpactBlocker, ...] = Field(default_factory=tuple)
    can_archive: bool


class SkillPackageArchiveOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    package_id: PublicUUID
    archived: Literal[True] = True
    status: Literal["archived"] = "archived"
    metadata_revision: int = Field(ge=2)
    impact: SkillPackageImpactOut
    archived_at: datetime
