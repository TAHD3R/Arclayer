from __future__ import annotations

from pydantic import ConfigDict, Field

from apps.api.common.schemas import BaseSchema


class WorkspaceSiteOut(BaseSchema):
    """
    Workspace-scoped site metadata.

    Notes:
    - Single-site workspace model: each workspace maps to exactly one site.
    - Admin UI uses this endpoint to discover `site_id` for Portal editor URLs.
    """

    model_config = ConfigDict(extra="forbid")

    site_id: str = Field(..., alias="siteId", description="Resolved site id for the workspace.")
    workspace_id: str = Field(..., alias="workspaceId", description="Workspace id.")

    slug: str = Field(..., description="Site slug (kept for compatibility/future).")
    name: str = Field(..., description="Site display name.")

    default_locale: str = Field(default="zh-CN", alias="defaultLocale", description="Default locale code.")
    fallback_locale: str = Field(default="en-US", alias="fallbackLocale", description="Fallback locale code.")

    primary_host: str | None = Field(default=None, alias="primaryHost", description="Optional primary host mapping.")
    is_active: bool = Field(default=True, alias="isActive", description="Whether the site is active.")
