from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from src.common.schemas import BaseOut, BaseSchema
from src.modules.permissions import PermissionConditionSet, PermissionConditionTemplate


class RolePermissionGrantIn(BaseSchema):
    permission_code: str = Field(..., min_length=1, description="Workspace permission code.")
    condition_sets: list[PermissionConditionSet] = Field(
        default_factory=list,
        description="Conditional grant sets. Empty means unconditional.",
    )


class RolePermissionGrantOut(BaseSchema):
    permission_code: str = Field(..., description="Workspace permission code.")
    condition_sets: list[PermissionConditionSet] = Field(
        default_factory=list,
        description="Conditional grant sets. Empty means unconditional.",
    )


class WorkspaceRoleOut(BaseOut):
    code: str = Field(..., description="Role code (unique within workspace).")
    name: str = Field(..., description="Localized role name.")
    description: str | None = Field(default=None, description="Localized role description.")
    permission_codes: list[str] = Field(default_factory=list, description="Granted workspace permission codes.")
    permission_grants: list[RolePermissionGrantOut] = Field(
        default_factory=list,
        description="Granted workspace permissions with optional condition sets.",
    )
    is_default: bool = Field(default=False, description="Whether this role is default for onboarding/invites.")
    is_superuser: bool = Field(default=False, description="Whether this role has all workspace permissions.")
    is_system: bool = Field(default=False, description="Whether this role is a built-in system role (immutable).")
    source: Literal["system", "custom"] = Field(..., description="Role ownership source.")
    immutable: bool = Field(..., description="Whether grants and role metadata are immutable.")
    revision: str = Field(..., description="Opaque row revision required by role mutations.")


class WorkspacePermissionOut(BaseOut):
    code: str = Field(..., description="Permission code.")
    scope: str = Field(..., description="Permission scope.")
    name: str = Field(..., description="Localized permission name.")
    description: str | None = Field(default=None, description="Localized permission description.")
    name_i18n: str | None = Field(default=None, description="Stable localized name resource reference.")
    description_i18n: str | None = Field(
        default=None,
        description="Stable localized description resource reference.",
    )
    group_code: str = Field(..., description="Stable permission group code.")
    group_name: str = Field(..., description="Localized permission group name.")
    sort_order: int = Field(..., description="Deterministic permission order.")
    owner_key: str | None = Field(default=None, description="Permission catalog owner key.")
    owner_name: str | None = Field(default=None, description="Localized owner name (if applicable).")
    lifecycle: Literal["active", "deprecated", "retained_unavailable"] = Field(
        ...,
        description="Permission catalog lifecycle state.",
    )
    replacement_code: str | None = Field(default=None, description="Replacement permission code.")
    action_codes: list[str] = Field(default_factory=list, description="Actions backed by this permission.")
    condition_templates: list[str] = Field(
        default_factory=list,
        description="Supported conditional grant template keys.",
    )


class WorkspacePermissionGroupOut(BaseSchema):
    code: str = Field(..., description="Stable group code.")
    name: str = Field(..., description="Localized group name.")
    order: int = Field(..., description="Deterministic group order.")


class WorkspacePermissionActionOut(BaseSchema):
    code: str = Field(..., description="Canonical action code.")
    module: str | None = Field(default=None, description="Action module code.")
    name: str | None = Field(default=None, description="Localized action name.")
    description: str | None = Field(default=None, description="Action description.")
    subject_kinds: list[str] = Field(default_factory=list, description="Supported subject kinds.")
    permission_codes: list[str] = Field(
        default_factory=list,
        description="Workspace permission codes that back this action.",
    )
    condition_templates: list[str] = Field(
        default_factory=list,
        description="Supported conditional permission template keys for this action.",
    )


class WorkspacePermissionConditionTemplateOut(PermissionConditionTemplate):
    pass


class WorkspacePermissionCatalogOut(BaseSchema):
    catalog_revision: str = Field(..., description="Deterministic permission definition revision.")
    etag: str = Field(..., description="Opaque HTTP entity tag for conditional refresh.")
    groups: list[WorkspacePermissionGroupOut] = Field(default_factory=list)
    permissions: list[WorkspacePermissionOut] = Field(default_factory=list)
    roles: list[WorkspaceRoleOut] = Field(default_factory=list)
    actions: list[WorkspacePermissionActionOut] = Field(default_factory=list)
    condition_templates: list[WorkspacePermissionConditionTemplateOut] = Field(default_factory=list)


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
    permission_grants: list[RolePermissionGrantIn] = Field(
        default_factory=list,
        description="Workspace permission grants with optional condition sets.",
    )

    @model_validator(mode="after")
    def _validate_grant_codes(self) -> RolePermissionSetRequest:
        seen: set[str] = set()
        for grant in self.permission_grants:
            code = str(grant.permission_code or "").strip()
            if not code:
                raise ValueError("permission_code is required")
            if code in seen:
                raise ValueError("permission_grants contains duplicate permission_code")
            seen.add(code)
        return self


class RolePermissionBatchItemIn(BaseSchema):
    role_code: str = Field(..., min_length=1, max_length=64)
    role_revision: str = Field(..., min_length=1, max_length=128)
    permission_grants: list[RolePermissionGrantIn] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_unique_grants(self) -> RolePermissionBatchItemIn:
        codes = [grant.permission_code for grant in self.permission_grants]
        if len(codes) != len(set(codes)):
            raise ValueError("permission_grants contains duplicate permission_code")
        return self


class RolePermissionBatchSetRequest(BaseSchema):
    catalog_revision: str = Field(..., min_length=1, max_length=128)
    idempotency_key: str = Field(..., min_length=8, max_length=128)
    roles: list[RolePermissionBatchItemIn] = Field(..., min_length=1)

    @model_validator(mode="after")
    def _validate_unique_roles(self) -> RolePermissionBatchSetRequest:
        codes = [item.role_code for item in self.roles]
        if len(codes) != len(set(codes)):
            raise ValueError("roles contains duplicate role_code")
        return self


class RolePermissionBatchSetOut(BaseSchema):
    catalog_revision: str
    roles: list[WorkspaceRoleOut] = Field(default_factory=list)
