from __future__ import annotations

from pydantic import ConfigDict, Field, field_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.modules.projects.content.contracts.schema import (
    ContentBootstrapPresetState,
    ContentPresentationKind,
    ContentWorkflowStage,
)


def _normalize_locale_code(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("Locale code is required")
    return normalized


class ContentItemCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    title: str = Field(..., min_length=1, max_length=256)
    locale: str = Field(default="zh-CN", min_length=2, max_length=16)
    model_key: str = Field(..., min_length=1, max_length=64)
    translation_group_id: PublicUUID | None = Field(
        default=None,
        description="Optional translation group id to link this item into.",
    )

    @field_validator("locale")
    @classmethod
    def normalize_locale(cls, value: str) -> str:
        return _normalize_locale_code(value)


class ContentTranslationCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    target_locale: str = Field(..., min_length=2, max_length=16)

    @field_validator("target_locale")
    @classmethod
    def normalize_target_locale(cls, value: str) -> str:
        return _normalize_locale_code(value)


class ContentItemBootstrapShapeIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    preset_key: str | None = Field(default=None, min_length=1, max_length=64)
    preset_state: ContentBootstrapPresetState = Field(default="none")
    capability_pack_ids: list[str] = Field(default_factory=list, max_length=32)


class ContentPresentationIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    kind: ContentPresentationKind
    payload: JsonObject | None = None


class ContentVersionDraftSaveIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expected_version: int | None = Field(default=None, ge=0)
    change_summary: str | None = Field(default=None, max_length=512)
    fields_snapshot: JsonObject = Field(default_factory=dict)
    presentations: list[ContentPresentationIn] = Field(default_factory=list)


class ContentVersionPatchIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    change_summary: str | None = Field(default=None, max_length=512)
    fields_snapshot: JsonObject | None = None
    presentations: list[ContentPresentationIn] | None = None


class ContentItemBulkTransitionIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    item_ids: list[PublicUUID] = Field(..., min_length=1, max_length=100)


class ContentWorkflowNoteIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    body: str = Field(..., min_length=1, max_length=2000)


class ContentItemWorkflowPatchIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    stage: ContentWorkflowStage | None = Field(default=None)
    assignee_user_id: str | None = Field(default=None, min_length=22, max_length=22)
    summary: str | None = Field(default=None, max_length=256)
    note: ContentWorkflowNoteIn | None = Field(default=None)
