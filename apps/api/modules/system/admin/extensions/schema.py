from __future__ import annotations

from typing import Any

from pydantic import Field

from apps.api.common.schemas import BaseSchema


class AdminUIExtensionOut(BaseSchema):
    plugin_id: str = Field(..., description="Owner plugin id.")
    id: str = Field(..., description="Extension id (stable within plugin).")
    slot: str = Field(..., description="UI slot identifier.")
    title: str = Field(..., description="Human title fallback.")
    title_i18n: str | None = Field(default=None, description="i18n key reference (namespace:key).")
    kind: str = Field(..., description="Extension kind (action/link/panel/etc).")
    icon: str | None = Field(default=None, description="Icon name (frontend maps to lucide icon).")
    permission_code: str | None = Field(
        default=None, description="Workspace permission required to see this extension."
    )
    meta: dict[str, Any] | None = Field(default=None, description="Arbitrary extension payload.")
