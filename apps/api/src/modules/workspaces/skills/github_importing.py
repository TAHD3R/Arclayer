from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from src.modules.workspaces.skills.authoring import InlineSkillVersion
from src.modules.workspaces.skills.github_source import GitHubSkillSnapshot


class SkillGitHubImportOutcomeMarker(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    job_id: UUID
    import_id: UUID
    package_id: UUID
    version_id: UUID
    resolved_commit: str
    resolved_tree: str
    package_checksum: str


class SkillGitHubImportWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    job_id: UUID
    actor_user_id: UUID
    workspace_id: UUID
    import_id: UUID
    package_id: UUID | None
    operation: Literal["initial", "refresh"]
    snapshot: GitHubSkillSnapshot
    authored: InlineSkillVersion
