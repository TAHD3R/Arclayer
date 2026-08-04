from __future__ import annotations

from pydantic import Field

from src.common.schemas import BaseSchema


class AIProviderIcon(BaseSchema):
    """Theme-aware provider icon shared by Platform and Product APIs."""

    light_url: str = Field(..., min_length=1)
    dark_url: str = Field(..., min_length=1)
