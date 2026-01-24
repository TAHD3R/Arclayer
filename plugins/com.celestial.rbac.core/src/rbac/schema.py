from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from apps.api.common.schemas import BaseOut, BaseSchema


class RoleOut(BaseOut):
    code: str = Field(..., description="Role code.")
    name: str = Field(..., description="Role name.")
    description: str | None = Field(default=None, description="Role description.")
    is_default: bool = Field(..., description="Whether the role is the default role.")
    is_superuser: bool = Field(..., description="Whether the role has full access.")


class RoleCreate(BaseSchema):
    code: str = Field(..., min_length=1, max_length=64, description="Role code.")
    name: str = Field(..., min_length=1, max_length=128, description="Role name.")
    description: str | None = Field(default=None, description="Role description.")
    is_default: bool = Field(default=False, description="Whether the role is the default role.")
    is_superuser: bool = Field(default=False, description="Whether the role has full access.")


class RoleUpdate(BaseSchema):
    name: str | None = Field(default=None, min_length=1, max_length=128, description="Role name.")
    description: str | None = Field(default=None, description="Role description.")
    is_default: bool | None = Field(default=None, description="Whether the role is the default role.")
    is_superuser: bool | None = Field(default=None, description="Whether the role has full access.")


class PermissionOut(BaseOut):
    code: str = Field(..., description="Permission code.")
    name: str = Field(..., description="Permission name.")
    description: str | None = Field(default=None, description="Permission description.")
    plugin_id: str | None = Field(default=None, description="Owning plugin identifier.")


class RolePermissionSet(BaseSchema):
    permission_codes: list[str] = Field(default_factory=list, description="Permission codes to set on the role.")


class AuthzSnapshot(BaseSchema):
    user_id: UUID = Field(..., description="User identifier.")
    role_codes: list[str] = Field(default_factory=list, description="Effective role codes.")
    permission_codes: list[str] = Field(default_factory=list, description="Effective permission codes.")
    is_superuser: bool = Field(..., description="Whether user has a superuser role.")


class SyncResult(BaseSchema):
    total: int = Field(..., ge=0, description="Total permissions processed.")
    created: int = Field(..., ge=0, description="Permissions created.")
    updated: int = Field(..., ge=0, description="Permissions updated.")
    granted_admin: int = Field(..., ge=0, description="Permissions granted to admin role.")
    granted_user: int = Field(..., ge=0, description="Permissions granted to user role.")


class BootstrapResult(BaseSchema):
    user_id: UUID = Field(..., description="User identifier.")
    role_code: str = Field(..., description="Assigned role code.")
    done_at: datetime | None = Field(default=None, description="Bootstrap completion time.")
