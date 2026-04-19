from __future__ import annotations

from enum import StrEnum

from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID


class PermissionSubjectKind(StrEnum):
    WORKSPACE_MEMBER = "workspace_member"
    PERSONAL_API_KEY = "personal_api_key"
    WORKSPACE_API_KEY = "workspace_api_key"
    DELIVERY_API_KEY = "delivery_api_key"
    PUBLIC = "public"


class PermissionContext(BaseSchema):
    action: str = Field(..., description="Canonical action code.")
    subject_kind: PermissionSubjectKind = Field(..., description="Subject type that requests the action.")
    workspace_id: PublicUUID | None = Field(default=None, description="Workspace scope id.")
    site_id: PublicUUID | None = Field(default=None, description="Site scope id.")
    user_id: PublicUUID | None = Field(default=None, description="User id when the subject is user-backed.")
    role_codes: list[str] = Field(default_factory=list, description="Effective role codes.")
    permission_codes: list[str] = Field(default_factory=list, description="Effective permission grants.")
    is_superuser: bool = Field(default=False, description="Whether the subject has all workspace grants.")
    granted_actions: list[str] = Field(
        default_factory=list, description="Direct action grants from API key scopes or similar."
    )
    field_grants: dict[str, list[str]] = Field(default_factory=dict, description="Reserved field-level grants.")
    payload_constraints: dict[str, str] = Field(default_factory=dict, description="Reserved payload-level constraints.")


class PermissionDecision(BaseSchema):
    action: str = Field(..., description="Canonical action code.")
    allowed: bool = Field(..., description="Whether the action is allowed.")
    reason: str = Field(..., description="Decision reason code.")
    matched_permission_codes: list[str] = Field(
        default_factory=list, description="Permission grants used by the decision."
    )
    matched_actions: list[str] = Field(default_factory=list, description="Direct action grants used by the decision.")
