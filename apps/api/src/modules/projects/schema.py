from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from src.common.schemas.base import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.core.http.pagination import PageData
from src.models.workspaces.workspace import WorkspaceIconMode


class ProjectMemberPreviewOut(BaseSchema):
    user_id: PublicUUID = Field(..., description="Member user id.")
    username: str = Field(..., description="Username.")
    display_name: str | None = Field(default=None, description="Display name.")
    email: str | None = Field(default=None, description="Email.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")


class ProjectOut(BaseOut):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    slug: str = Field(..., description="Project slug.")
    name: str = Field(..., description="Project name.")
    description: str | None = Field(default=None, description="Project description.")
    icon_mode: WorkspaceIconMode = Field(
        default=WorkspaceIconMode.INITIALS,
        description="Project icon presentation mode.",
    )
    icon_color: str = Field(default="#337ea9", description="Project icon background color.")
    icon_glyph: str | None = Field(default=None, description="Project icon glyph id.")
    icon_emoji: str | None = Field(default=None, description="Project icon emoji.")
    icon_url: str | None = Field(default=None, description="Project icon URL.")
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


class ProjectListItemOut(ProjectOut):
    primary_runtime: ProjectRuntimeOut | None = Field(default=None, description="Primary runtime detail.")
    member_count: int = Field(default=0, ge=0, description="Active project member count.")
    members_preview: list[ProjectMemberPreviewOut] = Field(
        default_factory=list,
        description="Preview project members for list rendering.",
    )
    archived_at: datetime | None = Field(default=None, description="Archived timestamp.")
    archived_by_user_id: PublicUUID | None = Field(default=None, description="Archived by user id.")
    created_at: datetime = Field(..., description="Project creation time.")
    updated_at: datetime = Field(..., description="Project last update time.")
    enterable: bool = Field(default=True, description="Whether current user can enter this project.")


class ProjectCreateRequest(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Workspace that owns the project.")
    name: str = Field(..., min_length=1, max_length=128, description="Project name.")
    slug: str | None = Field(default=None, min_length=1, max_length=64, description="Project slug.")
    description: str | None = Field(default=None, max_length=256, description="Project description.")


class ProjectUpdateRequest(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=128, description="Project name.")
    slug: str | None = Field(default=None, min_length=1, max_length=64, description="Project slug.")
    description: str | None = Field(default=None, max_length=256, description="Project description.")
    icon_mode: WorkspaceIconMode | None = Field(
        default=None,
        description="Project icon presentation mode.",
    )
    icon_color: str | None = Field(default=None, max_length=16, description="Project icon background color.")
    icon_glyph: str | None = Field(default=None, max_length=64, description="Project icon glyph id.")
    icon_emoji: str | None = Field(default=None, max_length=32, description="Project icon emoji.")
    icon_url: str | None = Field(default=None, max_length=1024, description="Project icon URL.")


class ProjectArchiveResult(BaseSchema):
    project_id: PublicUUID = Field(..., description="Project id.")
    is_active: bool = Field(..., description="Whether the project is active after the operation.")


class ProjectDangerActionOut(BaseSchema):
    enabled: bool = Field(default=False, description="Whether the destructive action is currently allowed.")
    blocked_reason: str | None = Field(default=None, description="Explicit blocking reason code when disabled.")


class ProjectDangerCapabilitiesOut(BaseSchema):
    project_id: PublicUUID = Field(..., description="Project id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id that owns the project.")
    confirm_delete_name: str = Field(..., description="Exact project name required for delete confirmation.")
    archive_action: ProjectDangerActionOut = Field(..., description="Capability for archiving the project.")
    delete_action: ProjectDangerActionOut = Field(..., description="Capability for deleting the project.")


class ProjectSlugAvailabilityOut(BaseSchema):
    normalized_slug: str | None = Field(default=None, description="Normalized project slug if parseable.")
    available: bool = Field(default=False, description="Whether the slug is currently available in the workspace.")
    reason: str | None = Field(
        default=None,
        description="Explicit reason code when unavailable: invalid, reserved, or exists.",
    )


class ProjectDeleteResult(BaseSchema):
    project_id: PublicUUID = Field(..., description="Deleted project id.")
    deleted: bool = Field(default=True, description="Whether project was deleted.")


class ProjectListOut(PageData[ProjectListItemOut]):
    """Project list."""


class ProjectContext(BaseSchema):
    project_id: UUID = Field(..., description="Project id.")
    workspace_id: UUID = Field(..., description="Workspace id for this project.")
    organization_id: UUID = Field(..., description="Organization id for this project.")
    runtime_id: UUID | None = Field(default=None, description="Primary runtime id if available.")
