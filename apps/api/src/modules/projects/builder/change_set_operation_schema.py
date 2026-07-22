from __future__ import annotations

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema


class BuilderOperationBaseV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    operation_id: str = Field(min_length=1, max_length=96)


__all__ = ["BuilderOperationBaseV1"]
