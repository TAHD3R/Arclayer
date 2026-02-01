from __future__ import annotations

from pydantic import Field

from apps.api.common.schemas import BaseOut, BaseSchema


class PermissionOut(BaseOut):
    code: str = Field(..., description="Permission code.")
    scope: str = Field(..., description="Permission scope (org/workspace).")
    name: str = Field(..., description="Localized permission name.")
    description: str | None = Field(default=None, description="Localized permission description.")
    plugin_id: str | None = Field(default=None, description="Owning plugin id.")


class PermissionSyncResult(BaseSchema):
    total: int = Field(..., ge=0, description="Total permissions processed.")
    created: int = Field(..., ge=0, description="Created permissions.")
    updated: int = Field(..., ge=0, description="Updated permissions.")
    workspaces: int = Field(..., ge=0, description="Workspaces reconciled (system roles + grants).")
