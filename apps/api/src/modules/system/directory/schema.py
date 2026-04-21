from __future__ import annotations

from datetime import datetime

from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.organization.organization import OrganizationKind
from src.models.organization.user import UserStatus


class DirectoryActorSummaryOut(BaseSchema):
    user_id: PublicUUID = Field(..., description="User id.")
    username: str = Field(..., description="Username.")
    display_name: str | None = Field(default=None, description="Display name.")
    email: str | None = Field(default=None, description="Email.")


class DirectoryUserListItemOut(BaseSchema):
    user_id: PublicUUID = Field(..., description="User id.")
    username: str = Field(..., description="Username.")
    display_name: str | None = Field(default=None, description="Display name.")
    email: str | None = Field(default=None, description="Email.")
    status: UserStatus = Field(..., description="User status.")
    is_super_admin: bool = Field(default=False, description="Whether the user is a super admin.")
    last_login_at: datetime | None = Field(default=None, description="Last login time.")
    created_at: datetime = Field(..., description="Created at.")
    owned_organizations_count: int = Field(default=0, ge=0, description="Organizations owned by the user.")
    organization_membership_count: int = Field(
        default=0,
        ge=0,
        description="Active organization memberships for the user.",
    )
    workspace_membership_count: int = Field(
        default=0,
        ge=0,
        description="Active workspace memberships for the user.",
    )
    project_membership_count: int = Field(
        default=0,
        ge=0,
        description="Project memberships for the user.",
    )


class DirectoryOrganizationListItemOut(BaseSchema):
    organization_id: PublicUUID = Field(..., description="Organization id.")
    name: str = Field(..., description="Organization name.")
    slug: str = Field(..., description="Organization slug.")
    kind: OrganizationKind = Field(..., description="Organization kind.")
    is_active: bool = Field(default=True, description="Whether the organization is active.")
    created_at: datetime = Field(..., description="Created at.")
    owner: DirectoryActorSummaryOut | None = Field(default=None, description="Owner summary.")
    member_count: int = Field(default=0, ge=0, description="Active member count.")
    workspace_count: int = Field(default=0, ge=0, description="Workspace count.")
    project_count: int = Field(default=0, ge=0, description="Project count.")


class DirectoryWorkspaceListItemOut(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    organization_id: PublicUUID = Field(..., description="Organization id.")
    organization_name: str = Field(..., description="Organization name.")
    name: str = Field(..., description="Workspace name.")
    description: str | None = Field(default=None, description="Workspace description.")
    is_active: bool = Field(default=True, description="Whether the workspace is active.")
    is_archived: bool = Field(default=False, description="Whether the workspace is archived.")
    created_at: datetime = Field(..., description="Created at.")
    owner: DirectoryActorSummaryOut | None = Field(default=None, description="Owner summary.")
    member_count: int = Field(default=0, ge=0, description="Active member count.")
    project_count: int = Field(default=0, ge=0, description="Project count.")


class DirectoryProjectListItemOut(BaseSchema):
    project_id: PublicUUID = Field(..., description="Project id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    workspace_name: str = Field(..., description="Workspace name.")
    organization_id: PublicUUID = Field(..., description="Organization id.")
    organization_name: str = Field(..., description="Organization name.")
    name: str = Field(..., description="Project name.")
    slug: str = Field(..., description="Project slug.")
    description: str | None = Field(default=None, description="Project description.")
    is_active: bool = Field(default=True, description="Whether the project is active.")
    created_at: datetime = Field(..., description="Created at.")
    owner: DirectoryActorSummaryOut | None = Field(default=None, description="Owner summary.")
    member_count: int = Field(default=0, ge=0, description="Project member count.")
