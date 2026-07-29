from __future__ import annotations

from uuid import UUID

from pydantic import Field

from src.common.schemas import BaseSchema
from src.modules.workspaces.http.schema import WorkspaceAccessType


class ProjectRequestContext(BaseSchema):
    project_id: UUID = Field(..., description="Project id.")
    workspace_id: UUID = Field(..., description="Workspace id.")
    organization_id: UUID = Field(..., description="Organization id.")
    runtime_id: UUID | None = Field(default=None, description="Primary runtime id.")
    access_type: WorkspaceAccessType = Field(..., description="How the user can access the backing workspace.")
    org_membership_id: UUID | None = Field(
        default=None,
        description="Organization membership id resolved from project access context.",
    )
    is_org_owner: bool = Field(default=False, description="Whether the current user is the org owner.")
    workspace_membership_id: UUID | None = Field(
        default=None,
        description="Workspace membership id resolved from project access context.",
    )
    visible_only: bool = Field(
        default=False,
        description="Whether the backing workspace is only visible to the current user.",
    )
    is_creator_admin: bool = Field(
        default=False,
        description="Whether the current user has creator-admin rights in the backing workspace.",
    )
