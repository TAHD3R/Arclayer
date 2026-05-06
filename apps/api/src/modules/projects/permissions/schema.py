from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.system.rbac import PermissionScope
from src.modules.permissions import PermissionConditionSet


class PermissionActionDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)
    code: str
    module: str | None = None
    name: str | None = None
    description: str | None = None
    permission_codes: tuple[str, ...] = ()
    subject_kinds: tuple[str, ...] = ()
    scope: str = PermissionScope.PROJECT.value
    name_i18n: str | None = None
    description_i18n: str | None = None
    default_role_codes: tuple[str, ...] = ()
    condition_templates: tuple[str, ...] = ()


class PermissionSubjectKind(StrEnum):
    PROJECT_MEMBER = "project_member"
    WORKSPACE_MEMBER = "workspace_member"
    PERSONAL_API_KEY = "personal_api_key"
    WORKSPACE_API_KEY = "workspace_api_key"
    DELIVERY_API_KEY = "delivery_api_key"
    PUBLIC = "public"


class PermissionContext(BaseSchema):
    action: str = Field(..., description="Canonical action code.")
    subject_kind: PermissionSubjectKind = Field(..., description="Subject type that requests the action.")
    project_id: PublicUUID | None = Field(default=None, description="Project scope id.")
    workspace_id: PublicUUID | None = Field(default=None, description="Workspace scope id.")
    site_id: PublicUUID | None = Field(default=None, description="Site scope id.")
    user_id: PublicUUID | None = Field(default=None, description="User id when the subject is user-backed.")
    role_codes: list[str] = Field(default_factory=list, description="Effective role codes.")
    permission_codes: list[str] = Field(default_factory=list, description="Effective permission grants.")
    is_superuser: bool = Field(default=False, description="Whether the subject has all grants for the active scope.")
    granted_actions: list[str] = Field(
        default_factory=list,
        description="Direct action grants from API key scopes or similar.",
    )
    field_grants: dict[str, list[str]] = Field(default_factory=dict, description="Reserved field-level grants.")
    payload_constraints: dict[str, str] = Field(default_factory=dict, description="Reserved payload-level constraints.")
    resource_attributes: dict[str, str | int | bool | None] = Field(
        default_factory=dict,
        description="Authoritative resource attributes used for conditional permission checks.",
    )
    permission_conditions: dict[str, list[PermissionConditionSet]] = Field(
        default_factory=dict,
        description="Condition sets attached to permission grants by permission code.",
    )
    action_conditions: dict[str, list[PermissionConditionSet]] = Field(
        default_factory=dict,
        description="Condition sets attached to direct action grants by action code.",
    )


class PermissionDecision(BaseSchema):
    action: str = Field(..., description="Canonical action code.")
    allowed: bool = Field(..., description="Whether the action is allowed.")
    reason: str = Field(..., description="Decision reason code, including subject-kind mismatches.")
    matched_permission_codes: list[str] = Field(
        default_factory=list,
        description="Permission grants used by the decision.",
    )
    matched_actions: list[str] = Field(default_factory=list, description="Direct action grants used by the decision.")
    matched_condition_count: int = Field(default=0, ge=0, description="Matched condition count for the grant.")
