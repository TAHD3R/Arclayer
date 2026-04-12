from __future__ import annotations

from typing import Any

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema


class DeliveryMenuOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str = Field(..., description="Menu key.")
    items: list[dict[str, Any]] = Field(default_factory=list, description="Menu items.")


class DeliveryStyleOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    effective: dict[str, Any] | None = Field(default=None, description="Effective site style payload.")
