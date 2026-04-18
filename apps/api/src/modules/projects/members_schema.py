from __future__ import annotations

from pydantic import Field

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.organization.user import UserStatus
from src.models.projects.membership import ProjectMemberRole


class ProjectMemberOut(BaseOut):
    project_id: PublicUUID = Field(..., description="Project id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    user_id: PublicUUID = Field(..., description="User id.")
    username: str = Field(..., description="Username.")
    email: str | None = Field(default=None, description="Email.")
    display_name: str | None = Field(default=None, description="Display name.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")
    user_status: UserStatus = Field(..., description="User status.")
    role: ProjectMemberRole = Field(..., description="Project role.")


class ProjectMemberRoleUpdateRequest(BaseSchema):
    role: ProjectMemberRole = Field(..., description="Project role to assign.")
