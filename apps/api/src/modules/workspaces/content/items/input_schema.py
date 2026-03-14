from __future__ import annotations

from typing import Any

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.models.content._enums import ContentItemStatus, ContentItemVisibility
from apps.api.src.modules.workspaces.content.contracts.schema import ContentPresentationKind


class ContentItemCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    model_key: str = Field(..., min_length=1, max_length=64)
    slug: str = Field(..., min_length=1, max_length=256)
    title: str | None = Field(default=None, max_length=256)
    locale: str = Field(default="zh-CN", min_length=2, max_length=16)
    status: ContentItemStatus = Field(default="draft")
    visibility: ContentItemVisibility = Field(default="public")


class ContentPresentationIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    kind: ContentPresentationKind
    payload: dict[str, Any] | None = None


class ContentVersionDraftSaveIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expected_version: int | None = Field(default=None, ge=0)
    change_summary: str | None = Field(default=None, max_length=512)
    fields_snapshot: dict[str, Any] = Field(default_factory=dict)
    presentations: list[ContentPresentationIn] = Field(default_factory=list)


class ContentVersionPatchIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    change_summary: str | None = Field(default=None, max_length=512)
    fields_snapshot: dict[str, Any] | None = None
    presentations: list[ContentPresentationIn] | None = None
