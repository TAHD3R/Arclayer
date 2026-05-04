from __future__ import annotations

from datetime import datetime

from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject


class ProjectSettingsDetail(BaseSchema):
    namespace: str = Field(..., description="Settings namespace.")
    value: JsonObject = Field(default_factory=dict, description="Masked settings value.")
    secrets: dict[str, bool] = Field(default_factory=dict, description="Secret field set state by path.")
    updated_at: datetime | None = Field(default=None, description="Last update time.")


class ProjectSettingsPatch(BaseSchema):
    patch: JsonObject = Field(default_factory=dict, description="Merge patch payload.")
