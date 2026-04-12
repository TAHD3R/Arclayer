from __future__ import annotations

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseOut, BaseSchema
from apps.api.src.models.system.rbac import Permission, Role


class PermissionOut(BaseOut):
    code: str = Field(..., description="Permission code.")
    scope: str = Field(..., description="Permission scope (org/workspace).")
    name: str = Field(..., description="Localized permission name.")
    description: str | None = Field(default=None, description="Localized permission description.")
    plugin_id: str | None = Field(default=None, description="Owning plugin id.")


class PermissionTemplate(BaseSchema):
    code: str
    scope: str = "workspace"
    name: str
    description: str | None = None
    name_i18n: str | None = None
    description_i18n: str | None = None
    default_roles: list[str] = Field(default_factory=list)


class PermissionSyncResult(BaseSchema):
    total: int = Field(..., ge=0, description="Total permissions processed.")
    created: int = Field(..., ge=0, description="Created permissions.")
    updated: int = Field(..., ge=0, description="Updated permissions.")
    workspaces: int = Field(..., ge=0, description="Workspaces reconciled (system roles + grants).")


class PermissionCatalogSyncResult(BaseSchema):
    total: int = Field(..., ge=0, description="Total permissions processed.")
    created: int = Field(..., ge=0, description="Created permissions.")
    updated: int = Field(..., ge=0, description="Updated permissions.")


class WorkspacesSyncResult(BaseSchema):
    workspaces: int = Field(..., ge=0, description="Workspaces reconciled (system roles + grants).")


class RBACMatrixPayload(BaseSchema):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    roles: list[Role] = Field(default_factory=list, description="Workspace roles.")
    permissions: list[Permission] = Field(default_factory=list, description="Workspace permissions.")
    grants: dict[str, list[str]] = Field(default_factory=dict, description="Role grants by permission code.")
