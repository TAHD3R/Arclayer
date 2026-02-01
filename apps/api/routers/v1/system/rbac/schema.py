from __future__ import annotations

from pydantic import Field

from apps.api.common.schemas import BaseOut, BaseSchema


class RoleOut(BaseOut):
    code: str = Field(..., description="Role code (immutable).")
    name: str = Field(..., description="Role name.")
    description: str | None = Field(default=None, description="Role description.")
    is_default: bool = Field(default=False, description="Whether this role is default.")
    is_superuser: bool = Field(default=False, description="Whether this role is superuser.")


class PermissionOut(BaseOut):
    code: str = Field(..., description="Permission code.")
    name: str = Field(..., description="Permission name.")
    description: str | None = Field(default=None, description="Permission description.")
    plugin_id: str | None = Field(default=None, description="Owning plugin id.")


class RoleCreateRequest(BaseSchema):
    code: str = Field(..., min_length=1, max_length=64, description="Role code (immutable).")
    name: str = Field(..., min_length=1, max_length=128, description="Role name.")
    description: str | None = Field(default=None, description="Role description.")
    is_default: bool = Field(default=False, description="Whether this role is default.")
    is_superuser: bool = Field(default=False, description="Whether this role is superuser.")


class RoleUpdateRequest(BaseSchema):
    # code is intentionally excluded: immutable.
    name: str | None = Field(default=None, min_length=1, max_length=128, description="Role name.")
    description: str | None = Field(default=None, description="Role description.")
    is_default: bool | None = Field(default=None, description="Whether this role is default.")
    is_superuser: bool | None = Field(default=None, description="Whether this role is superuser.")


class PermissionSyncResult(BaseSchema):
    total: int = Field(..., ge=0, description="Total permissions processed.")
    created: int = Field(..., ge=0, description="Created permissions.")
    updated: int = Field(..., ge=0, description="Updated permissions.")
    granted_admin: int = Field(..., ge=0, description="Granted to admin role.")
    granted_user: int = Field(..., ge=0, description="Granted to user role.")


class RolePermissionSetRequest(BaseSchema):
    permission_codes: list[str] = Field(default_factory=list, description="Permission code list.")
