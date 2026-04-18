from __future__ import annotations

from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID


class ProjectRuntimeBridgeOut(BaseSchema):
    runtime_id: PublicUUID = Field(..., alias="runtimeId", description="Primary runtime id.")
    project_id: PublicUUID = Field(..., alias="projectId", description="Project id.")
    workspace_id: PublicUUID = Field(..., alias="workspaceId", description="Workspace id.")
    site_id: PublicUUID = Field(..., alias="siteId", description="Resolved site bridge id.")
    kind: str = Field(..., description="Runtime kind.")
    name: str = Field(..., description="Runtime name.")
    slug: str = Field(..., description="Resolved runtime slug.")
    default_locale: str = Field(..., alias="defaultLocale", description="Default locale.")
    fallback_locale: str = Field(..., alias="fallbackLocale", description="Fallback locale.")
    is_active: bool = Field(..., alias="isActive", description="Whether the runtime is active.")


class RuntimePreviewTokenOut(BaseSchema):
    runtime_id: PublicUUID = Field(..., alias="runtimeId", description="Runtime id.")
    site_id: PublicUUID = Field(..., alias="siteId", description="Resolved site id.")
    token: str = Field(..., description="Preview token.")
    expires_at_ms: int = Field(..., alias="expiresAtMs", description="Expiration timestamp in milliseconds.")
