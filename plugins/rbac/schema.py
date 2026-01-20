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


class PermissionOut(BaseOut):
    code: str = Field(..., description="Permission code.")
    name: str = Field(..., description="Permission name.")
    description: str | None = Field(default=None, description="Permission description.")
    plugin_id: str | None = Field(default=None, description="Owning plugin identifier.")


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
