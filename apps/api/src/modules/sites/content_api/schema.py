from __future__ import annotations

from typing import Any, Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.modules.sites.delivery.schema import DeliveryPerspective


class ContentApiEntryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Content item id.")
    model_key: str = Field(..., min_length=1, description="Content model key.")
    locale: str = Field(..., min_length=1, description="Entry locale.")
    title: str | None = Field(default=None, description="Entry title.")
    slug: str | None = Field(default=None, description="Entry slug.")
    revision: int = Field(..., ge=1, description="Resolved revision number.")
    revision_state: Literal["draft", "published"] = Field(..., description="Resolved revision state.")
    draft_revision: int = Field(..., ge=0, description="Current draft revision pointer.")
    published_revision: int | None = Field(default=None, ge=1, description="Current published revision pointer.")
    fields: dict[str, Any] = Field(default_factory=dict, description="Delivery-safe field payload.")
    custom_fields: dict[str, Any] = Field(default_factory=dict, description="Delivery-safe custom field payload.")
    route_path: str | None = Field(default=None, description="Bound route path, when the entry owns one.")
    route_contract: dict[str, Any] | None = Field(default=None, description="Bound route contract, when available.")


class ContentApiEntryListOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    model_key: str = Field(..., min_length=1, description="Content model key.")
    perspective: DeliveryPerspective = Field(..., description="Delivery perspective.")
    locale: str | None = Field(default=None, description="Locale filter applied to the result.")
    total: int = Field(..., ge=0, description="Total matched entries before pagination.")
    limit: int = Field(..., ge=1, description="Page size.")
    offset: int = Field(..., ge=0, description="Page offset.")
    items: list[ContentApiEntryOut] = Field(default_factory=list, description="Content entries.")
