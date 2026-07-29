from __future__ import annotations

import re
from datetime import datetime
from enum import StrEnum
from typing import Self

from pydantic import EmailStr, Field, field_validator, model_validator

from src.common.constants.auth import PASSWORD_REGEX
from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.commerce.billing import SubscriptionStatus
from src.models.content._enums import ContentReleaseStatus
from src.models.organization.user import UserStatus
from src.models.projects.deployment import ProjectDeploymentStatus
from src.models.projects.membership import ProjectMemberRole
from src.models.system.access_restriction import (
    AccessRestrictionReasonCategory,
    AccessRestrictionState,
    AccessRestrictionType,
)
from src.models.workspaces.workspace import WorkspaceIconMode, WorkspaceMembershipStatus
from src.modules.access_restrictions.schema import AccessRestrictionAdminOut
from src.modules.commerce.schema import WorkspaceCommerceDirectoryOut, WorkspaceCommerceDirectoryRisk


class DirectoryActorSummaryOut(BaseSchema):
    user_id: PublicUUID = Field(..., description="User id.")
    username: str = Field(..., description="Username.")
    display_name: str | None = Field(default=None, description="Display name.")
    email: str | None = Field(default=None, description="Email.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")


class DirectoryProjectRuntimeState(StrEnum):
    READY = "ready"
    RUNTIME_MISSING = "runtime_missing"
    SITE_MISSING = "site_missing"


class DirectoryProjectHealthState(StrEnum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    INACTIVE = "inactive"
    NOT_DEPLOYED = "not_deployed"
    UNAVAILABLE = "unavailable"


class DirectoryProjectDomainState(StrEnum):
    READY = "ready"
    ATTENTION_REQUIRED = "attention_required"
    NONE = "none"


class DirectoryProjectReleaseState(StrEnum):
    ACTIVE = "active"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    CANCELLED = "cancelled"
    NOT_RELEASED = "not_released"


class DirectoryProjectUsageCoverage(StrEnum):
    AI_AUDIT_LOG = "ai_audit_log"
    NO_OBSERVED_USAGE = "no_observed_usage"


class DirectoryProjectActivitySource(StrEnum):
    AUDIT_EVENT = "audit_event"
    RELEASE = "release"
    DEPLOYMENT = "deployment"
    PROJECT_RECORD = "project_record"


class DirectoryProjectUsageOut(BaseSchema):
    window_start: datetime = Field(..., description="Inclusive project usage window start.")
    window_end: datetime = Field(..., description="Exclusive project usage window end.")
    coverage: DirectoryProjectUsageCoverage = Field(..., description="Project usage attribution coverage.")
    requests: int = Field(..., ge=0)
    prompt_tokens: int = Field(..., ge=0)
    completion_tokens: int = Field(..., ge=0)
    cost_micros: int = Field(..., ge=0)


class DirectoryProjectOperationalSummaryOut(BaseSchema):
    captured_at: datetime = Field(..., description="Time at which the operational projection was captured.")
    runtime_state: DirectoryProjectRuntimeState
    health: DirectoryProjectHealthState
    domain_state: DirectoryProjectDomainState
    domain_count: int = Field(..., ge=0)
    verified_domain_count: int = Field(..., ge=0)
    latest_deployment_status: ProjectDeploymentStatus | None = None
    latest_deployment_at: datetime | None = None
    release_state: DirectoryProjectReleaseState
    latest_release_status: ContentReleaseStatus | None = None
    latest_release_number: int | None = Field(default=None, ge=1)
    latest_release_at: datetime | None = None
    last_activity_at: datetime
    last_activity_source: DirectoryProjectActivitySource
    usage: DirectoryProjectUsageOut


class DirectoryUserListItemOut(BaseSchema):
    user_id: PublicUUID = Field(..., description="User id.")
    username: str = Field(..., description="Username.")
    display_name: str | None = Field(default=None, description="Display name.")
    email: str | None = Field(default=None, description="Email.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")
    status: UserStatus = Field(..., description="User status.")
    is_super_admin: bool = Field(default=False, description="Whether the user is a super admin.")
    has_password: bool = Field(default=False, description="Whether a local password is configured.")
    two_factor_enabled: bool = Field(default=False, description="Whether two-factor authentication is enabled.")
    linked_oauth_providers: list[str] = Field(
        default_factory=list,
        description="Linked OAuth providers for the account.",
    )
    last_login_at: datetime | None = Field(default=None, description="Last login time.")
    created_at: datetime = Field(..., description="Created at.")
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
    restrictions: list[AccessRestrictionAdminOut] = Field(
        default_factory=list,
        description="Active access restrictions visible to the system operator.",
    )


class DirectoryWorkspaceListItemOut(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    name: str = Field(..., description="Workspace name.")
    description: str | None = Field(default=None, description="Workspace description.")
    icon_mode: WorkspaceIconMode | None = Field(default=None, description="Workspace icon mode.")
    icon_color: str | None = Field(default=None, description="Workspace icon color.")
    icon_glyph: str | None = Field(default=None, description="Workspace icon glyph.")
    icon_emoji: str | None = Field(default=None, description="Workspace icon emoji.")
    icon_url: str | None = Field(default=None, description="Workspace icon URL.")
    is_active: bool = Field(default=True, description="Whether the workspace is active.")
    is_archived: bool = Field(default=False, description="Whether the workspace is archived.")
    created_at: datetime = Field(..., description="Created at.")
    last_activity_at: datetime = Field(..., description="Latest workspace-record activity time.")
    owner: DirectoryActorSummaryOut | None = Field(default=None, description="Owner summary.")
    member_count: int = Field(default=0, ge=0, description="Active member count.")
    project_count: int = Field(default=0, ge=0, description="Project count.")
    restrictions: list[AccessRestrictionAdminOut] = Field(
        default_factory=list,
        description="Active access restrictions visible to the system operator.",
    )
    commerce: WorkspaceCommerceDirectoryOut = Field(
        ...,
        description="Read-only commercial projection from the canonical commerce domain.",
    )


class DirectoryProjectListItemOut(BaseSchema):
    project_id: PublicUUID = Field(..., description="Project id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    workspace_name: str = Field(..., description="Workspace name.")
    name: str = Field(..., description="Project name.")
    slug: str = Field(..., description="Project slug.")
    description: str | None = Field(default=None, description="Project description.")
    icon_mode: WorkspaceIconMode | None = Field(default=None, description="Project icon mode.")
    icon_color: str | None = Field(default=None, description="Project icon color.")
    icon_glyph: str | None = Field(default=None, description="Project icon glyph.")
    icon_emoji: str | None = Field(default=None, description="Project icon emoji.")
    icon_url: str | None = Field(default=None, description="Project icon URL.")
    is_active: bool = Field(default=True, description="Whether the project is active.")
    created_at: datetime = Field(..., description="Created at.")
    last_activity_at: datetime = Field(..., description="Latest project operational activity time.")
    owner: DirectoryActorSummaryOut | None = Field(default=None, description="Owner summary.")
    member_count: int = Field(default=0, ge=0, description="Project member count.")
    restrictions: list[AccessRestrictionAdminOut] = Field(
        default_factory=list,
        description="Active access restrictions visible to the system operator.",
    )
    operations: DirectoryProjectOperationalSummaryOut = Field(
        ...,
        description="Batch project operational projection with explicit coverage and freshness.",
    )


class DirectoryUserWorkspaceMembershipOut(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    workspace_name: str = Field(..., description="Workspace name.")
    status: WorkspaceMembershipStatus = Field(..., description="Workspace membership status.")
    role_codes: list[str] = Field(default_factory=list, description="Assigned workspace role codes.")
    is_owner: bool = Field(default=False, description="Whether the user owns the workspace.")
    joined_at: datetime = Field(..., description="Membership creation time.")


class DirectoryUserProjectMembershipOut(BaseSchema):
    project_id: PublicUUID = Field(..., description="Project id.")
    project_name: str = Field(..., description="Project name.")
    workspace_id: PublicUUID = Field(..., description="Parent workspace id.")
    workspace_name: str = Field(..., description="Parent workspace name.")
    role: ProjectMemberRole = Field(..., description="Project membership role.")
    joined_at: datetime = Field(..., description="Membership creation time.")


class DirectoryUserAuditActivityOut(BaseSchema):
    event_id: PublicUUID = Field(..., description="Audit event id.")
    event_name: str = Field(..., description="Stable audit event name.")
    occurred_at: datetime = Field(..., description="Event occurrence time.")
    source: str | None = Field(default=None, description="Audit event source.")
    workspace_id: PublicUUID | None = Field(default=None, description="Related workspace id.")
    project_id: PublicUUID | None = Field(default=None, description="Related project id.")


class DirectoryUserFeedbackActivityOut(BaseSchema):
    feedback_id: PublicUUID = Field(..., description="Feedback ticket id.")
    intent: str | None = Field(default=None, description="Feedback intent.")
    status: str = Field(..., description="Feedback status.")
    source: str = Field(..., description="Feedback source.")
    message: str = Field(..., description="Feedback message.")
    last_activity_at: datetime = Field(..., description="Latest feedback activity time.")


class DirectoryUserRestrictionHistoryOut(BaseSchema):
    command_id: PublicUUID = Field(..., description="Restriction transition command id.")
    restriction_type: AccessRestrictionType = Field(..., description="Restriction type.")
    state: AccessRestrictionState = Field(..., description="Resulting restriction state.")
    reason_category: AccessRestrictionReasonCategory = Field(..., description="Reason category.")
    reason_code: str = Field(..., description="Stable reason code.")
    operator_note: str = Field(..., description="Operator note captured for the transition.")
    actor_user_id: PublicUUID | None = Field(default=None, description="Operator user id.")
    changed_at: datetime = Field(..., description="Transition time.")
    revision: int = Field(..., ge=1, description="Resulting revision.")


class DirectoryUserDetailOut(DirectoryUserListItemOut):
    updated_at: datetime = Field(..., description="Last update time.")
    owned_workspace_count: int = Field(default=0, ge=0, description="Owned workspace count.")
    owned_project_count: int = Field(default=0, ge=0, description="Owned project count.")
    workspace_memberships: list[DirectoryUserWorkspaceMembershipOut] = Field(default_factory=list)
    project_memberships: list[DirectoryUserProjectMembershipOut] = Field(default_factory=list)
    recent_audit_activity: list[DirectoryUserAuditActivityOut] = Field(default_factory=list)
    recent_feedback_activity: list[DirectoryUserFeedbackActivityOut] = Field(default_factory=list)
    restriction_history: list[DirectoryUserRestrictionHistoryOut] = Field(default_factory=list)


class DirectoryWorkspaceDetailOut(DirectoryWorkspaceListItemOut):
    updated_at: datetime = Field(..., description="Last update time.")
    icon_mode: str = Field(..., description="Workspace icon mode.")
    icon_color: str = Field(..., description="Workspace icon color.")
    icon_glyph: str | None = Field(default=None, description="Workspace icon glyph.")
    icon_emoji: str | None = Field(default=None, description="Workspace icon emoji.")
    icon_url: str | None = Field(default=None, description="Workspace icon URL.")


class DirectoryProjectDetailOut(DirectoryProjectListItemOut):
    updated_at: datetime = Field(..., description="Last update time.")
    icon_mode: str = Field(..., description="Project icon mode.")
    icon_color: str = Field(..., description="Project icon color.")
    icon_glyph: str | None = Field(default=None, description="Project icon glyph.")
    icon_emoji: str | None = Field(default=None, description="Project icon emoji.")
    icon_url: str | None = Field(default=None, description="Project icon URL.")


class DirectoryUserUpdateRequest(BaseSchema):
    email: EmailStr | None = Field(default=None, description="Email address.")
    display_name: str | None = Field(default=None, max_length=64, description="Display name.")
    is_super_admin: bool | None = Field(
        default=None,
        description="Whether the user has system-wide super admin access.",
    )
    avatar_asset_id: PublicUUID | None = Field(
        default=None,
        description="Avatar asset id.",
        validation_alias="avatarAssetId",
    )

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class DirectoryUserResetPasswordRequest(BaseSchema):
    new_password: str = Field(min_length=8, max_length=128, description="New password.")

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if not re.match(PASSWORD_REGEX, value):
            raise ValueError("New password must contain letters and numbers, and be 8-128 characters long.")
        return value


class DirectoryUserListFilters(BaseSchema):
    status: UserStatus | None = Field(default=None, description="Account status filter.")
    is_super_admin: bool | None = Field(default=None, description="Super admin permission filter.")
    has_password: bool | None = Field(default=None, description="Local password filter.")
    two_factor_enabled: bool | None = Field(default=None, description="Two-factor authentication filter.")
    oauth_provider: str | None = Field(default=None, description="OAuth provider filter.")
    created_from: datetime | None = Field(default=None, description="Created-at range lower bound, inclusive.")
    created_to: datetime | None = Field(default=None, description="Created-at range upper bound, inclusive.")
    last_login_from: datetime | None = Field(default=None, description="Last-login range lower bound, inclusive.")
    last_login_to: datetime | None = Field(default=None, description="Last-login range upper bound, inclusive.")
    workspace_member_of_id: PublicUUID | None = Field(
        default=None,
        description="Filter users with an active membership in this workspace.",
    )
    project_member_of_id: PublicUUID | None = Field(
        default=None,
        description="Filter users with a membership in this project.",
    )
    owned_workspace_id: PublicUUID | None = Field(
        default=None,
        description="Filter by the authoritative owner of this workspace.",
    )
    owned_project_id: PublicUUID | None = Field(
        default=None,
        description="Filter by the current project-owner projection.",
    )

    @field_validator("oauth_provider")
    @classmethod
    def normalize_oauth_provider(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        return normalized or None

    @model_validator(mode="after")
    def validate_time_ranges(self) -> Self:
        if self.created_from is not None and self.created_to is not None and self.created_from > self.created_to:
            raise ValueError("created_from must be earlier than or equal to created_to")
        if (
            self.last_login_from is not None
            and self.last_login_to is not None
            and self.last_login_from > self.last_login_to
        ):
            raise ValueError("last_login_from must be earlier than or equal to last_login_to")
        return self


class DirectoryWorkspaceListFilters(BaseSchema):
    is_archived: bool | None = Field(default=None, description="Workspace archive state filter.")
    is_active: bool | None = Field(default=None, description="Workspace active state filter.")
    owner_user_id: PublicUUID | None = Field(default=None, description="Workspace owner filter.")
    plan_code: str | None = Field(default=None, description="Commerce plan code filter.")
    subscription_status: SubscriptionStatus | None = Field(default=None, description="Subscription status filter.")
    commerce_risk: WorkspaceCommerceDirectoryRisk | None = Field(
        default=None,
        description="Commercial attention state filter.",
    )
    created_from: datetime | None = Field(default=None, description="Created-at range lower bound, inclusive.")
    created_to: datetime | None = Field(default=None, description="Created-at range upper bound, inclusive.")
    activity_from: datetime | None = Field(
        default=None,
        description="Workspace-record activity range lower bound, inclusive.",
    )
    activity_to: datetime | None = Field(
        default=None,
        description="Workspace-record activity range upper bound, inclusive.",
    )

    @field_validator("plan_code")
    @classmethod
    def normalize_plan_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        return normalized or None

    @model_validator(mode="after")
    def validate_time_ranges(self) -> Self:
        if self.created_from is not None and self.created_to is not None and self.created_from > self.created_to:
            raise ValueError("created_from must be earlier than or equal to created_to")
        if self.activity_from is not None and self.activity_to is not None and self.activity_from > self.activity_to:
            raise ValueError("activity_from must be earlier than or equal to activity_to")
        return self


class DirectoryProjectListFilters(BaseSchema):
    workspace_id: PublicUUID | None = Field(default=None, description="Workspace id filter.")
    is_active: bool | None = Field(default=None, description="Project active state filter.")
    owner_user_id: PublicUUID | None = Field(default=None, description="Project owner filter.")
    runtime_health: DirectoryProjectHealthState | None = Field(default=None, description="Runtime health filter.")
    domain_state: DirectoryProjectDomainState | None = Field(default=None, description="Domain readiness filter.")
    release_state: DirectoryProjectReleaseState | None = Field(default=None, description="Latest release state filter.")
    created_from: datetime | None = Field(default=None, description="Created-at range lower bound, inclusive.")
    created_to: datetime | None = Field(default=None, description="Created-at range upper bound, inclusive.")
    activity_from: datetime | None = Field(default=None, description="Project-record activity lower bound, inclusive.")
    activity_to: datetime | None = Field(default=None, description="Project-record activity upper bound, inclusive.")

    @model_validator(mode="after")
    def validate_time_ranges(self) -> Self:
        if self.created_from is not None and self.created_to is not None and self.created_from > self.created_to:
            raise ValueError("created_from must be earlier than or equal to created_to")
        if self.activity_from is not None and self.activity_to is not None and self.activity_from > self.activity_to:
            raise ValueError("activity_from must be earlier than or equal to activity_to")
        return self


class DirectoryWorkspaceUpdateRequest(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=128, description="Workspace name.")
    description: str | None = Field(default=None, max_length=256, description="Workspace description.")
    icon_mode: WorkspaceIconMode | None = Field(default=None, description="Workspace icon presentation mode.")
    icon_color: str | None = Field(default=None, max_length=16, description="Workspace icon background color.")
    icon_glyph: str | None = Field(default=None, max_length=64, description="Workspace icon glyph id.")
    icon_emoji: str | None = Field(default=None, max_length=32, description="Workspace icon emoji.")
    icon_url: str | None = Field(default=None, max_length=1024, description="Workspace icon URL.")

    @field_validator("name")
    @classmethod
    def normalize_workspace_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("Workspace name is required.")
        return normalized

    @field_validator("description", "icon_color", "icon_glyph", "icon_emoji", "icon_url")
    @classmethod
    def normalize_optional_string(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class DirectoryProjectUpdateRequest(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=128, description="Project name.")
    slug: str | None = Field(default=None, min_length=1, max_length=64, description="Project slug.")
    description: str | None = Field(default=None, max_length=256, description="Project description.")
    icon_mode: WorkspaceIconMode | None = Field(default=None, description="Project icon presentation mode.")
    icon_color: str | None = Field(default=None, max_length=16, description="Project icon background color.")
    icon_glyph: str | None = Field(default=None, max_length=64, description="Project icon glyph id.")
    icon_emoji: str | None = Field(default=None, max_length=32, description="Project icon emoji.")
    icon_url: str | None = Field(default=None, max_length=1024, description="Project icon URL.")

    @field_validator("name", "slug")
    @classmethod
    def normalize_project_required_optional_string(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("Value is required.")
        return normalized

    @field_validator("description", "icon_color", "icon_glyph", "icon_emoji", "icon_url")
    @classmethod
    def normalize_project_optional_string(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class DirectoryDeleteRequest(BaseSchema):
    confirm_name: str = Field(
        min_length=1,
        max_length=128,
        description="Current entity name confirmation for destructive delete.",
        validation_alias="confirmName",
    )

    @field_validator("confirm_name")
    @classmethod
    def normalize_confirm_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Value is required.")
        return normalized
