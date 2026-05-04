from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID


class ContentSearchHitOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Content item id.")
    model_key: str = Field(..., min_length=1, description="Content model key.")
    locale: str = Field(..., min_length=1, description="Entry locale.")
    title: str | None = Field(default=None, description="Entry title.")
    slug: str | None = Field(default=None, description="Entry slug.")
    revision: int = Field(..., ge=1, description="Resolved revision number.")
    revision_state: Literal["published"] = Field(default="published", description="Resolved revision state.")
    draft_revision: int = Field(..., ge=0, description="Current draft revision pointer.")
    published_revision: int = Field(..., ge=1, description="Current published revision pointer.")
    fields: JsonObject = Field(default_factory=dict, description="Delivery-safe field payload.")
    custom_fields: JsonObject = Field(default_factory=dict, description="Delivery-safe custom field payload.")
    route_path: str | None = Field(default=None, description="Bound route path, when the entry owns one.")
    route_contract: JsonObject | None = Field(default=None, description="Bound route contract, when available.")
    score: float | None = Field(default=None, description="Backend relevance score when available.")


class ContentSearchResultOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    model_key: str = Field(..., min_length=1, description="Content model key.")
    locale: str | None = Field(default=None, description="Locale filter applied to the result.")
    query: str = Field(..., min_length=1, description="Full-text query.")
    total: int = Field(..., ge=0, description="Total matched entries before pagination.")
    limit: int = Field(..., ge=1, description="Page size.")
    offset: int = Field(..., ge=0, description="Page offset.")
    items: list[ContentSearchHitOut] = Field(default_factory=list, description="Search hits.")


class ContentSearchDocument(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, description="Backend document id.")
    item_id: UUID = Field(..., description="Content item id.")
    runtime_id: UUID = Field(..., description="Runtime id.")
    site_id: UUID = Field(..., description="Site id.")
    model_key: str = Field(..., min_length=1, description="Content model key.")
    locale: str = Field(..., min_length=1, description="Entry locale.")
    title: str | None = Field(default=None, description="Entry title.")
    slug: str | None = Field(default=None, description="Entry slug.")
    revision: int = Field(..., ge=1, description="Resolved revision number.")
    draft_revision: int = Field(..., ge=0, description="Current draft revision pointer.")
    published_revision: int = Field(..., ge=1, description="Current published revision pointer.")
    fields: JsonObject = Field(default_factory=dict, description="Delivery-safe field payload.")
    custom_fields: JsonObject = Field(default_factory=dict, description="Delivery-safe custom field payload.")
    route_path: str | None = Field(default=None, description="Bound route path, when available.")
    route_contract: JsonObject | None = Field(default=None, description="Bound route contract, when available.")


class ContentSearchQuery(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    runtime_id: UUID
    site_id: UUID
    model_key: str
    query: str
    locale: str | None = None
    limit: int = 20
    offset: int = 0


class ContentSearchResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    total: int
    hits: list[ContentSearchDocument]
