from __future__ import annotations

from uuid import UUID

from pydantic import Field

from apps.api.src.common.schemas import BaseSchema


class WorkspaceContext(BaseSchema):
    workspace_id: UUID = Field(..., description="Workspace id.")
    organization_id: UUID = Field(..., description="Organization id for this workspace.")

    org_membership_id: UUID = Field(..., description="Org membership id.")
    is_org_owner: bool = Field(default=False, description="Whether current user is the org owner.")

    workspace_membership_id: UUID | None = Field(default=None, description="Workspace membership id (if any).")
    visible_only: bool = Field(
        default=False,
        description="If true, workspace is visible to the user but not manageable unless explicitly granted.",
    )
    is_creator_admin: bool = Field(
        default=False,
        description="If true, org owner created this workspace and gets implicit admin management rights.",
    )
