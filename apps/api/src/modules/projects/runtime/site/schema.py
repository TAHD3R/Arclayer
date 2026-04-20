from __future__ import annotations

from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID


class ProjectRuntimeSiteOut(BaseSchema):
    """
    Project runtime site metadata.
    """

    site_id: PublicUUID = Field(..., alias="siteId", description="Resolved site id for the runtime.")
    workspace_id: PublicUUID = Field(..., alias="workspaceId", description="Workspace id.")

    slug: str = Field(..., description="Site slug (kept for compatibility/future).")
    name: str = Field(..., description="Site display name.")

    default_locale: str = Field(default="zh-CN", alias="defaultLocale", description="Default locale code.")
    fallback_locale: str = Field(default="en-US", alias="fallbackLocale", description="Fallback locale code.")

    is_active: bool = Field(default=True, alias="isActive", description="Whether the site is active.")
