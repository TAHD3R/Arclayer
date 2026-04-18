from __future__ import annotations

from uuid import UUID

from pydantic import Field

from src.common.schemas.base import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID


class ProjectOut(BaseOut):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    slug: str = Field(..., description="Project slug.")
    name: str = Field(..., description="Project name.")
    description: str | None = Field(default=None, description="Project description.")
    is_active: bool = Field(..., description="Whether the project is active.")


class WorkspacePrimaryProjectOut(BaseSchema):
    project_id: PublicUUID = Field(..., description="Primary project id for this workspace.")


class ProjectRuntimeOut(BaseOut):
    project_id: PublicUUID = Field(..., description="Project id.")
    kind: str = Field(..., description="Runtime kind.")
    name: str = Field(..., description="Runtime name.")
    is_active: bool = Field(..., description="Whether the runtime is active.")


class ProjectDetailOut(BaseSchema):
    project: ProjectOut = Field(..., description="Project detail.")
    primary_runtime: ProjectRuntimeOut | None = Field(default=None, description="Primary runtime detail.")


class ProjectContext(BaseSchema):
    project_id: UUID = Field(..., description="Project id.")
    workspace_id: UUID = Field(..., description="Workspace id for this project.")
    organization_id: UUID = Field(..., description="Organization id for this project.")
    runtime_id: UUID | None = Field(default=None, description="Primary runtime id if available.")
