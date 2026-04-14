from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import Field

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.workspaces.workspace import WorkspaceKind


class WorkspaceFirstOnboardingStatus(StrEnum):
    PENDING_WORKSPACE = "pending_workspace"
    PENDING_WORKSPACE_DEFAULTS = "pending_workspace_defaults"
    COMPLETED = "completed"


class MyWorkspaceMemberPreviewOut(BaseSchema):
    user_id: PublicUUID = Field(..., description="Member user id.")
    username: str = Field(..., description="Username.")
    display_name: str | None = Field(default=None, description="Display name.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")


class MyWorkspaceOut(BaseOut):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    organization_id: PublicUUID = Field(..., description="Organization id.")
    slug: str = Field(..., description="Workspace slug.")
    name: str = Field(..., description="Workspace name.")
    kind: WorkspaceKind = Field(default=WorkspaceKind.TEAM, description="Workspace kind.")
    description: str | None = Field(default=None, description="Workspace description.")
    icon_url: str | None = Field(default=None, description="Workspace icon URL.")
    member_count: int = Field(default=0, ge=0, description="Active member count.")
    members_preview: list[MyWorkspaceMemberPreviewOut] = Field(
        default_factory=list,
        description="Preview members for avatar group rendering.",
    )
    created_at: datetime | None = Field(default=None, description="Workspace creation time.")

    visible_only: bool = Field(
        default=False,
        description="If true, workspace is visible but user cannot manage it without explicit grant.",
    )
    is_creator_admin: bool = Field(
        default=False,
        description="If true, current user is org owner and workspace creator; has implicit admin management rights.",
    )
    is_legacy: bool = Field(
        default=False,
        description="Whether the underlying organization is in legacy multi-workspace compatibility mode.",
    )


class InstanceSetupStateOut(BaseSchema):
    status: str = Field(..., description="Instance setup state: uninitialized, ready, repair_required.")
    repair_reason: str | None = Field(default=None, description="Explicit repair reason code when setup is invalid.")


class WorkspaceSwitcherOut(BaseSchema):
    teams: list[MyWorkspaceOut] = Field(default_factory=list, description="Team workspaces visible to current user.")


class WorkspaceFirstOnboardingOut(BaseSchema):
    status: WorkspaceFirstOnboardingStatus = Field(
        ..., description="Workspace-first onboarding state for current user."
    )
    workspace_id: PublicUUID | None = Field(
        default=None,
        description="Workspace id already created by onboarding when step 1 has completed.",
    )


class OnboardingWorkspaceCreateRequest(BaseSchema):
    name: str | None = Field(
        default=None, min_length=1, max_length=128, description="Workspace name chosen during onboarding."
    )
    slug: str | None = Field(
        default=None, min_length=1, max_length=64, description="Workspace slug chosen during onboarding."
    )


class OnboardingWorkspaceCreateOut(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Created workspace id.")


class MyWorkspaceListResult(BaseSchema):
    items: list[MyWorkspaceOut] = Field(default_factory=list, description="Workspaces visible to current user.")
    switcher: WorkspaceSwitcherOut = Field(..., description="Pre-grouped switcher state from the backend.")
    instance_setup: InstanceSetupStateOut = Field(..., description="Canonical instance setup status for this runtime.")
    onboarding: WorkspaceFirstOnboardingOut = Field(
        ..., description="Current user's workspace-first onboarding progress."
    )


class WorkspaceDetailOut(BaseOut):
    """Workspace metadata used by the admin workspace settings page."""

    organization_id: PublicUUID = Field(..., description="Organization id.")
    kind: WorkspaceKind = Field(..., description="Workspace kind.")
    slug: str = Field(..., description="Workspace slug.")
    name: str = Field(..., description="Workspace name.")
    icon_url: str | None = Field(default=None, description="Workspace icon/logo URL (optional).")
    icon_asset_aligned: bool = Field(
        default=False,
        description="Whether the icon asset was auto-aligned (purpose/visibility/indexable) in this response.",
    )


class WorkspaceUpdateRequest(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=128, description="Workspace name.")
    slug: str | None = Field(default=None, min_length=1, max_length=64, description="Workspace slug.")
    icon_url: str | None = Field(default=None, max_length=1024, description="Workspace icon/logo URL.")


class LeaveWorkspaceRequest(BaseSchema):
    confirm_text: str = Field(..., min_length=1, max_length=32, description="Confirmation text, must be LEAVE.")


class LeaveWorkspaceResult(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    membership_id: PublicUUID = Field(..., description="Deleted workspace membership id.")
    left: bool = Field(default=True, description="Whether current user left the workspace.")


class WorkspaceDeleteResult(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Deleted workspace id.")
    deleted: bool = Field(default=True, description="Whether workspace was deleted.")


class WorkspaceDangerActionOut(BaseSchema):
    enabled: bool = Field(default=False, description="Whether the destructive action is currently allowed.")
    blocked_reason: str | None = Field(default=None, description="Explicit blocking reason code when disabled.")


class WorkspaceDangerCapabilitiesOut(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    organization_id: PublicUUID = Field(..., description="Organization id for the workspace.")
    confirm_leave_text: str = Field(default="LEAVE", description="Exact confirmation text required for leave.")
    confirm_delete_name: str = Field(..., description="Exact workspace name required for delete confirmation.")
    leave_action: WorkspaceDangerActionOut = Field(..., description="Capability for leaving the workspace.")
    delete_action: WorkspaceDangerActionOut = Field(..., description="Capability for deleting the workspace.")
