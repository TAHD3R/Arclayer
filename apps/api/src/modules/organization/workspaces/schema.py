from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import Field

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.workspaces.workspace import WorkspaceIconMode
from src.modules.projects.schema import WorkspacePrimaryProjectOut


class OrganizationWorkspaceTemplate(StrEnum):
    BLOG = "blog"
    WEBSITE = "website"
    BLANK = "blank"


class OrganizationWorkspaceMemberPreviewOut(BaseSchema):
    user_id: PublicUUID = Field(..., description="Member user id.")
    username: str = Field(..., description="Username.")
    display_name: str | None = Field(default=None, description="Display name.")
    email: str | None = Field(default=None, description="Email address.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")


class OrganizationWorkspaceMemberOut(BaseSchema):
    membership_id: PublicUUID = Field(..., description="Workspace membership id.")
    user_id: PublicUUID = Field(..., description="Member user id.")
    username: str = Field(..., description="Username.")
    display_name: str | None = Field(default=None, description="Display name.")
    email: str | None = Field(default=None, description="Email address.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")
    joined_at: datetime = Field(..., description="Membership joined time.")


class OrganizationWorkspaceOut(BaseOut):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    project_id: PublicUUID | None = Field(default=None, description="Primary project id when available.")
    organization_id: PublicUUID = Field(..., description="Organization id.")
    name: str = Field(..., description="Workspace name.")
    description: str | None = Field(default=None, description="Workspace description.")
    icon_mode: WorkspaceIconMode = Field(
        default=WorkspaceIconMode.INITIALS,
        description="Workspace icon presentation mode.",
    )
    icon_color: str = Field(default="#337ea9", description="Workspace icon background color.")
    icon_glyph: str | None = Field(default=None, description="Workspace icon glyph id.")
    icon_emoji: str | None = Field(default=None, description="Workspace icon emoji.")
    icon_url: str | None = Field(default=None, description="Workspace icon URL.")
    is_archived: bool = Field(default=False, description="Whether workspace is archived.")
    archived_at: datetime | None = Field(default=None, description="Archived timestamp.")
    archived_by_user_id: PublicUUID | None = Field(default=None, description="Archived by user id.")
    member_count: int = Field(default=0, ge=0, description="Active member count.")
    members_preview: list[OrganizationWorkspaceMemberPreviewOut] = Field(
        default_factory=list,
        description="Preview members for avatar group rendering.",
    )
    created_at: datetime = Field(..., description="Workspace creation time.")
    enterable: bool = Field(
        default=False,
        description="Whether current user can enter this workspace admin scope.",
    )
    project: WorkspacePrimaryProjectOut | None = Field(
        default=None,
        description="Primary project binding for this workspace when available.",
    )


class OrganizationWorkspaceCreateRequest(BaseSchema):
    name: str = Field(..., min_length=1, max_length=128, description="Workspace name.")
    description: str | None = Field(default=None, max_length=256, description="Workspace description.")
    template: OrganizationWorkspaceTemplate = Field(
        default=OrganizationWorkspaceTemplate.BLANK,
        description="Workspace bootstrap template.",
    )
    locale: str | None = Field(default=None, description="Default locale (optional).")
    timezone: str | None = Field(default=None, description="Default timezone (optional).")
    date_format: str | None = Field(default=None, description="Default date format (optional).")


class OrganizationWorkspaceArchiveResult(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    is_archived: bool = Field(..., description="Whether workspace is archived.")
    archived_at: datetime | None = Field(default=None, description="Archived timestamp.")
    archived_by_user_id: PublicUUID | None = Field(default=None, description="Archived by user id.")


class OrganizationWorkspaceDeleteResult(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Deleted workspace id.")
    deleted: bool = Field(default=True, description="Whether workspace was deleted.")
