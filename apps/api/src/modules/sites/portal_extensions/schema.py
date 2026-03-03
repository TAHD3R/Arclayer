from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from apps.api.src.common.schemas import BaseSchema


class PortalExtensionOut(BaseSchema):
    """
    Declarative Portal extension descriptor.

    Notes:
    - Portal is a public boundary. Avoid putting secrets in `meta`.
    - `permission_code` is informational for now (Portal doesn't have a user RBAC context).
    """

    plugin_id: str = Field(..., description="Owner plugin id.")
    id: str = Field(..., description="Extension id (stable within plugin).")
    kind: Literal["head_link", "head_script", "style", "unknown"] = Field(
        ...,
        description="Extension kind (Portal runtime interprets meta based on kind).",
    )
    title: str = Field(..., description="Human title fallback.")
    title_i18n: str | None = Field(default=None, description="i18n key reference (namespace:key).")
    permission_code: str | None = Field(
        default=None,
        description="Optional permission code (only applied in preview/editor contexts in the future).",
    )
    meta: dict[str, Any] | None = Field(default=None, description="Arbitrary extension payload.")


class PortalExtensionsOut(BaseSchema):
    items: list[PortalExtensionOut] = Field(default_factory=list, description="Portal extensions list.")
