from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field, model_serializer

from src.common.schemas import BaseSchema

ContentLibraryViewVisibility = Literal["private", "workspace"]
ContentLibraryViewStatus = Literal["published", "changed", "draft", "archived"]
ContentLibraryViewRole = Literal[
    "page",
    "article",
    "reusable-section",
    "taxonomy",
    "person",
    "settings",
    "data",
    "general",
]
ContentLibraryViewEditWith = Literal["canvas", "writing", "structured"]
ContentLibraryViewMode = Literal["table", "card"]
ContentLibraryViewRowHeight = Literal["short", "medium", "tall", "extraTall"]
ContentLibrarySystemViewId = Literal[
    "all",
    "site-content",
    "draft",
    "published",
    "needs-attention",
]


class ContentLibraryViewFiltersSchema(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    status: ContentLibraryViewStatus | None = Field(default=None)
    model_key: str | None = Field(default=None, min_length=1, max_length=128)
    role: ContentLibraryViewRole | None = Field(default=None)
    edit_with: ContentLibraryViewEditWith | None = Field(default=None)

    @model_serializer(mode="wrap")
    def serialize_without_nulls(self, handler):
        data = handler(self)
        return {key: value for key, value in data.items() if value is not None}


class ContentLibraryViewSortingItemSchema(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=128)
    desc: bool = Field(default=False)


class ContentLibraryViewColumnsSchema(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    visibility: dict[str, bool] | None = Field(default=None)
    order: list[str] | None = Field(default=None)
    row_height: ContentLibraryViewRowHeight | None = Field(default=None)
    wrap_headers: bool | None = Field(default=None)

    @model_serializer(mode="wrap")
    def serialize_without_nulls(self, handler):
        data = handler(self)
        return {key: value for key, value in data.items() if value is not None}


class ContentLibraryViewOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=120)
    base_view_id: ContentLibrarySystemViewId = Field(...)
    query: str = Field(default="", max_length=200)
    filters: ContentLibraryViewFiltersSchema = Field(default_factory=ContentLibraryViewFiltersSchema)
    sorting: list[ContentLibraryViewSortingItemSchema] = Field(default_factory=list)
    view_mode: ContentLibraryViewMode | None = Field(default=None)
    columns: ContentLibraryViewColumnsSchema = Field(default_factory=ContentLibraryViewColumnsSchema)
    visibility: ContentLibraryViewVisibility = Field(...)
    pinned: bool = Field(default=False)
    is_default: bool = Field(default=False)


class ContentLibraryViewsStateOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    items: list[ContentLibraryViewOut] = Field(default_factory=list)
    default_view_id: str | None = Field(default=None, min_length=1, max_length=64)


class ContentLibraryViewCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=120)
    base_view_id: ContentLibrarySystemViewId = Field(...)
    query: str = Field(default="", max_length=200)
    filters: ContentLibraryViewFiltersSchema = Field(default_factory=ContentLibraryViewFiltersSchema)
    sorting: list[ContentLibraryViewSortingItemSchema] = Field(default_factory=list)
    view_mode: ContentLibraryViewMode | None = Field(default=None)
    columns: ContentLibraryViewColumnsSchema | None = Field(default=None)
    visibility: ContentLibraryViewVisibility = Field(default="private")
    pinned: bool = Field(default=False)
    is_default: bool = Field(default=False)


class ContentLibraryViewPatchIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    base_view_id: ContentLibrarySystemViewId | None = Field(default=None)
    query: str | None = Field(default=None, max_length=200)
    filters: ContentLibraryViewFiltersSchema | None = Field(default=None)
    sorting: list[ContentLibraryViewSortingItemSchema] | None = Field(default=None)
    view_mode: ContentLibraryViewMode | None = Field(default=None)
    columns: ContentLibraryViewColumnsSchema | None = Field(default=None)
    visibility: ContentLibraryViewVisibility | None = Field(default=None)
    pinned: bool | None = Field(default=None)
    is_default: bool | None = Field(default=None)


class ContentLibraryViewMoveIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    direction: Literal["up", "down"] = Field(...)
