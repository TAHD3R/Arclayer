from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from apps.api.common.schemas import BaseSchema


class WorkspaceSettingsDetail(BaseSchema):
    namespace: str = Field(..., description="Settings namespace.")
    value: dict[str, Any] = Field(default_factory=dict, description="Masked settings value.")
    secrets: dict[str, bool] = Field(default_factory=dict, description="Secret field set state by path.")
    updated_at: datetime | None = Field(default=None, description="Last update time.")


class WorkspaceSettingsPatch(BaseSchema):
    patch: dict[str, Any] = Field(default_factory=dict, description="Merge patch payload.")
