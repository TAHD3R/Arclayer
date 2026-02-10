from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import Field

from apps.api.common.schemas import BaseOut, BaseSchema
from apps.api.common.types.public_uuid import PublicUUID


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


class OrganizationWorkspaceOut(BaseOut):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    organization_id: PublicUUID = Field(..., description="Organization id.")
    slug: str = Field(..., description="Workspace slug.")
    name: str = Field(..., description="Workspace name.")
    description: str | None = Field(default=None, description="Workspace description.")
    icon_url: str | None = Field(default=None, description="Workspace icon URL.")
    member_count: int = Field(default=0, ge=0, description="Active member count.")
    members_preview: list[OrganizationWorkspaceMemberPreviewOut] = Field(
        default_factory=list,
        description="Preview members for avatar group rendering.",
    )
    created_at: datetime = Field(..., description="Workspace creation time.")


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


class OrganizationWorkspaceDeleteResult(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Deleted workspace id.")
    deleted: bool = Field(default=True, description="Whether workspace was deleted.")
