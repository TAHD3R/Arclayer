from __future__ import annotations

from pydantic import Field, model_validator

from apps.api.common.schemas import BaseOut, BaseSchema


class OrganizationRoleOut(BaseOut):
    code: str = Field(..., description="Role code (unique within organization).")
    name: str = Field(..., description="Role name.")
    description: str | None = Field(default=None, description="Role description.")
    is_system: bool = Field(default=False, description="Whether this role is immutable.")
    is_builtin: bool = Field(default=False, description="Whether this role is built-in.")


class OrganizationPermissionOut(BaseOut):
    code: str = Field(..., description="Permission code.")
    module: str = Field(..., description="Permission module key.")
    name: str = Field(..., description="Permission display name.")
    description: str | None = Field(default=None, description="Permission description.")


class OrganizationRBACMatrixPermissionRowOut(BaseSchema):
    code: str = Field(..., description="Permission code.")
    module: str = Field(..., description="Permission module key.")
    name: str = Field(..., description="Permission display name.")
    description: str | None = Field(default=None, description="Permission description.")
    granted_role_codes: list[str] = Field(default_factory=list, description="Granted role codes.")


class OrganizationRBACMatrixOut(BaseSchema):
    roles: list[OrganizationRoleOut] = Field(default_factory=list, description="Organization roles.")
    permissions: list[OrganizationRBACMatrixPermissionRowOut] = Field(
        default_factory=list,
        description="Organization permission rows.",
    )


class OrganizationRoleCreateFromTemplateRequest(BaseSchema):
    code: str | None = Field(default=None, min_length=1, max_length=64, description="New role code (optional).")
    template_role_code: str | None = Field(
        default=None,
        min_length=1,
        max_length=64,
        description="Template role code to clone (optional).",
    )
    name: str | None = Field(default=None, min_length=1, max_length=128, description="Role name.")
    description: str | None = Field(default=None, max_length=2000, description="Role description.")

    @model_validator(mode="after")
    def _validate_name_required(self) -> OrganizationRoleCreateFromTemplateRequest:
        if not self.name:
            raise ValueError("name is required")
        return self


class OrganizationPermissionRoleSetRequest(BaseSchema):
    role_codes: list[str] = Field(default_factory=list, description="Custom role codes.")


class OrganizationRolePermissionSetRequest(BaseSchema):
    permission_codes: list[str] = Field(default_factory=list, description="Permission codes.")
