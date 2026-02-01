from __future__ import annotations

from uuid import UUID

from pydantic import Field

from apps.api.common.schemas import BaseOut, BaseSchema


class MyWorkspaceOut(BaseOut):
    workspace_id: UUID = Field(..., description="Workspace id.")
    organization_id: UUID = Field(..., description="Organization id.")
    slug: str = Field(..., description="Workspace slug.")
    name: str = Field(..., description="Workspace name.")

    visible_only: bool = Field(
        default=False,
        description="If true, workspace is visible but user cannot manage it without explicit grant.",
    )
    is_creator_admin: bool = Field(
        default=False,
        description="If true, current user is org owner and workspace creator; has implicit admin management rights.",
    )


class MyWorkspaceListResult(BaseSchema):
    items: list[MyWorkspaceOut] = Field(default_factory=list, description="Workspaces visible to current user.")
