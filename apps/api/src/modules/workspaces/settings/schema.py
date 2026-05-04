from __future__ import annotations

from datetime import datetime

from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID


class WorkspaceSettingsDetail(BaseSchema):
    namespace: str = Field(..., description="Settings namespace.")
    value: JsonObject = Field(default_factory=dict, description="Masked settings value.")
    secrets: dict[str, bool] = Field(default_factory=dict, description="Secret field set state by path.")
    updated_at: datetime | None = Field(default=None, description="Last update time.")


class WorkspaceSettingsPatch(BaseSchema):
    patch: JsonObject = Field(default_factory=dict, description="Merge patch payload.")


class WorkspaceRolePolicyOut(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    default_role_code: str = Field(..., description="Default role code used for onboarding/invites.")


class WorkspaceRolePolicyPatch(BaseSchema):
    default_role_code: str = Field(..., min_length=1, max_length=64, description="Default role code.")


class WorkspaceAssignRoleToMembersRequest(BaseSchema):
    role_code: str = Field(..., min_length=1, max_length=64, description="Role code to assign.")
    confirm_name: str = Field(..., min_length=1, max_length=128, description="Workspace name confirmation.")


class WorkspaceAssignRoleToMembersResult(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    role_code: str = Field(..., description="Applied role code.")
    updated_count: int = Field(default=0, ge=0, description="How many memberships were updated.")
