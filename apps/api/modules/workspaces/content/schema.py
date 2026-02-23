from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import AliasChoices, ConfigDict, Field

from apps.api.common.schemas import BaseSchema
from apps.api.common.types.public_uuid import PublicUUID

ContentTypeKind = Literal["page", "post", "template", "block", "menu", "view", "custom"]
ContentEntryStatus = Literal["draft", "published", "archived"]
ContentEntryVisibility = Literal["public", "private"]
ContentRevisionState = Literal["draft", "published"]
ContentRevisionTarget = Literal["draft", "published"]


class ContentTypeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Content type id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    code: str = Field(..., description="Stable content type code.")
    name: str = Field(..., description="Display name.")
    kind: ContentTypeKind = Field(..., description="Type kind.")
    field_schema: dict[str, Any] | None = Field(default=None, description="Field schema payload.")
    editor_schema: dict[str, Any] | None = Field(default=None, description="Editor schema payload.")
    render_contract: dict[str, Any] | None = Field(default=None, description="Render contract payload.")
    workflow_policy: dict[str, Any] | None = Field(default=None, description="Workflow policy payload.")


class ContentTypeCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, max_length=64, description="Stable content type code.")
    name: str = Field(..., min_length=1, max_length=128, description="Display name.")
    kind: ContentTypeKind = Field(default="custom", description="Type kind.")
    field_schema: dict[str, Any] | None = Field(default=None, description="Field schema payload.")
    editor_schema: dict[str, Any] | None = Field(default=None, description="Editor schema payload.")
    render_contract: dict[str, Any] | None = Field(default=None, description="Render contract payload.")
    workflow_policy: dict[str, Any] | None = Field(default=None, description="Workflow policy payload.")


class ContentTypeUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=128, description="Display name.")
    kind: ContentTypeKind | None = Field(default=None, description="Type kind.")
    field_schema: dict[str, Any] | None = Field(default=None, description="Field schema payload.")
    editor_schema: dict[str, Any] | None = Field(default=None, description="Editor schema payload.")
    render_contract: dict[str, Any] | None = Field(default=None, description="Render contract payload.")
    workflow_policy: dict[str, Any] | None = Field(default=None, description="Workflow policy payload.")


class ContentTypeDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    type_id: PublicUUID = Field(..., description="Deleted content type id.")


class ContentEntryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Entry id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    type_id: PublicUUID = Field(..., description="Content type id.")
    type_code: str = Field(..., description="Content type code.")
    slug: str = Field(..., description="Entry slug.")
    title: str | None = Field(default=None, description="Entry title.")
    status: ContentEntryStatus = Field(..., description="Entry status.")
    visibility: ContentEntryVisibility = Field(..., description="Entry visibility.")
    locale: str = Field(..., description="Entry locale.")
    draft_revision: int = Field(default=0, ge=0, description="Current draft revision pointer.")
    published_revision: int | None = Field(default=None, ge=1, description="Current published revision pointer.")
    updated_at: datetime = Field(..., description="Last update time.")


class ContentEntryCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    type_code: str = Field(..., min_length=1, max_length=64, description="Content type code.")
    slug: str = Field(..., min_length=1, max_length=256, description="Entry slug.")
    title: str | None = Field(default=None, max_length=256, description="Entry title.")
    visibility: ContentEntryVisibility = Field(default="public", description="Entry visibility.")
    locale: str = Field(default="zh-CN", min_length=2, max_length=16, description="Entry locale.")


class ContentEntryUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    slug: str | None = Field(default=None, min_length=1, max_length=256, description="Entry slug.")
    title: str | None = Field(default=None, max_length=256, description="Entry title.")
    visibility: ContentEntryVisibility | None = Field(default=None, description="Entry visibility.")
    locale: str | None = Field(default=None, min_length=2, max_length=16, description="Entry locale.")


class ContentEntryDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_id: PublicUUID = Field(..., description="Deleted entry id.")


class ContentEntryDraftSaveIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    document_ir: dict[str, Any] | None = Field(
        default=None,
        description="Document payload.",
        validation_alias=AliasChoices("documentIr", "document"),
    )
    field_values: dict[str, Any] | None = Field(
        default=None,
        description="Field values payload.",
        validation_alias=AliasChoices("fieldValues", "data"),
    )
    meta: dict[str, Any] | None = Field(default=None, description="Metadata payload.")
    expected_revision: int | None = Field(
        default=None,
        ge=0,
        description="Optional optimistic lock revision. If provided, it must match current draft revision.",
    )


class ContentEntryDraftSaveOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_id: PublicUUID = Field(..., description="Entry id.")
    revision: int = Field(..., ge=1, description="Draft revision number.")
    saved_at_ms: int = Field(..., ge=0, description="Saved timestamp in milliseconds.")


class ContentEntryPublishIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    revision: int | None = Field(default=None, ge=1, description="Optional draft revision to publish.")


class ContentEntryPublishOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_id: PublicUUID = Field(..., description="Entry id.")
    revision: int = Field(..., ge=1, description="Published revision number.")
    published_at_ms: int = Field(..., ge=0, description="Published timestamp in milliseconds.")


class ContentEntryUnpublishOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_id: PublicUUID = Field(..., description="Entry id.")
    unpublished_at_ms: int = Field(..., ge=0, description="Unpublished timestamp in milliseconds.")


class ContentEntryRevisionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_id: PublicUUID = Field(..., description="Entry id.")
    state: ContentRevisionState = Field(..., description="Revision state.")
    revision: int = Field(..., ge=1, description="Revision number.")
    created_at_ms: int = Field(..., ge=0, description="Revision created timestamp in milliseconds.")
    snapshot: dict[str, Any] = Field(..., description="Revision snapshot payload.")


class ContentEntryRollbackIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    target: ContentRevisionTarget = Field(..., description="Revision pointer target to rollback.")
    revision: int = Field(..., ge=1, description="Target revision number.")


class ContentEntryRollbackOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_id: PublicUUID = Field(..., description="Entry id.")
    target: ContentRevisionTarget = Field(..., description="Rollback target pointer.")
    from_revision: int | None = Field(default=None, ge=1, description="Previous pointer value.")
    to_revision: int = Field(..., ge=1, description="New pointer value.")
    rolled_back_at_ms: int = Field(..., ge=0, description="Rollback timestamp in milliseconds.")
