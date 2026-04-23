from __future__ import annotations

from pydantic import Field, model_validator

from src.common.schemas import BaseOut, BaseSchema


class WorkspaceRoleOut(BaseOut):
    code: str = Field(..., description="Role code (unique within workspace).")
    name: str = Field(..., description="Localized role name.")
    description: str | None = Field(default=None, description="Localized role description.")
    permission_codes: list[str] = Field(default_factory=list, description="Granted workspace permission codes.")
    is_default: bool = Field(default=False, description="Whether this role is default for onboarding/invites.")
    is_superuser: bool = Field(default=False, description="Whether this role has all workspace permissions.")
    is_system: bool = Field(default=False, description="Whether this role is a built-in system role (immutable).")


class WorkspacePermissionOut(BaseOut):
    code: str = Field(..., description="Permission code.")
    name: str = Field(..., description="Localized permission name.")
    description: str | None = Field(default=None, description="Localized permission description.")
    owner_key: str | None = Field(default=None, description="Permission catalog owner key.")
    owner_name: str | None = Field(default=None, description="Localized owner name (if applicable).")


class WorkspacePermissionActionOut(BaseSchema):
    code: str = Field(..., description="Canonical action code.")
    description: str | None = Field(default=None, description="Action description.")
    subject_kinds: list[str] = Field(default_factory=list, description="Supported subject kinds.")
    permission_codes: list[str] = Field(
        default_factory=list,
        description="Workspace permission codes that back this action.",
    )


class RoleCreateFromTemplateRequest(BaseSchema):
    code: str | None = Field(default=None, min_length=1, max_length=64, description="New role code (optional).")
    template_role_code: str | None = Field(
        default=None,
        min_length=1,
        max_length=64,
        description="Template role code to clone (optional).",
    )
    name: str | None = Field(default=None, min_length=1, max_length=128, description="Role name (current locale).")
    description: str | None = Field(
        default=None,
        max_length=2000,
        description="Role description (current locale, optional).",
    )

    @model_validator(mode="after")
    def _validate_name_required(self) -> RoleCreateFromTemplateRequest:
        if not self.name:
            raise ValueError("name is required")
        return self


class RoleUpdateRequest(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=128, description="Role name (current locale).")
    description: str | None = Field(default=None, max_length=2000, description="Role description (current locale).")

    @model_validator(mode="after")
    def _validate_any_update(self) -> RoleUpdateRequest:
        if self.name is None and self.description is None:
            raise ValueError("At least one field is required")
        return self


class PermissionRoleSetRequest(BaseSchema):
    role_codes: list[str] = Field(default_factory=list, description="Custom role codes to grant this permission.")


class RolePermissionSetRequest(BaseSchema):
    permission_codes: list[str] = Field(
        default_factory=list,
        description="Workspace permission codes to grant to the custom role (system roles are immutable).",
    )
