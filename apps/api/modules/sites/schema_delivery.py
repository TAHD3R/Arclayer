"""Delivery API schemas — read-only public content distribution."""

from __future__ import annotations

from typing import Any

from pydantic import ConfigDict, Field

from apps.api.common.schemas import BaseSchema


class DeliveryEntryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    slug: str = Field(..., description="Entry slug.")
    type_code: str = Field(..., description="Content type code.")
    title: str | None = Field(default=None, description="Entry title.")
    field_values: dict[str, Any] | None = Field(default=None, description="Published field values.")
    document_ir: dict[str, Any] | None = Field(default=None, description="Published document IR.")


class DeliveryMenuOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str = Field(..., description="Menu key.")
    items: list[dict[str, Any]] = Field(default_factory=list, description="Menu items tree.")


class DeliveryStyleOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    effective: dict[str, Any] | None = Field(default=None, description="Effective merged style.")
