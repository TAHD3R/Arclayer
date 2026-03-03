from __future__ import annotations

from pydantic import Field

from apps.api.src.common.schemas import BaseOut, BaseSchema
from apps.api.src.common.types.public_uuid import PublicUUID


class MyWorkspaceOut(BaseOut):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    organization_id: PublicUUID = Field(..., description="Organization id.")
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


class WorkspaceDetailOut(BaseOut):
    """Workspace metadata used by the admin workspace settings page."""

    organization_id: PublicUUID = Field(..., description="Organization id.")
    slug: str = Field(..., description="Workspace slug.")
    name: str = Field(..., description="Workspace name.")


class WorkspaceUpdateRequest(BaseSchema):
    name: str | None = Field(default=None, description="Workspace name.")
    slug: str | None = Field(default=None, description="Workspace slug.")


class LeaveWorkspaceRequest(BaseSchema):
    confirm_text: str = Field(..., min_length=1, max_length=32, description="Confirmation text, must be LEAVE.")


class LeaveWorkspaceResult(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    membership_id: PublicUUID = Field(..., description="Deleted workspace membership id.")
    left: bool = Field(default=True, description="Whether current user left the workspace.")


class WorkspaceDeleteResult(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Deleted workspace id.")
    deleted: bool = Field(default=True, description="Whether workspace was deleted.")
