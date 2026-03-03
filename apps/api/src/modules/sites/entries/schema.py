from __future__ import annotations

from typing import Any, Literal

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.modules.sites.design_document.schema import PageBlueprint


class SiteEntryRevisionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_id: PublicUUID = Field(..., description="Entry id.")
    state: Literal["draft", "published"] = Field(..., description="Revision state.")
    revision: int = Field(..., ge=1, description="Revision number.")
    created_at_ms: int = Field(..., description="Revision created timestamp in milliseconds (UTC).")
    page_blueprint: PageBlueprint | None = Field(
        default=None,
        alias="pageBlueprint",
        description="Optional PageBlueprint payload.",
    )
    data: dict[str, Any] | None = Field(default=None, description="Optional entry data payload (JSON).")
    meta: dict[str, Any] | None = Field(default=None, description="Optional metadata payload (JSON).")
    style_overrides: dict[str, Any] | None = Field(default=None, description="Optional style overrides payload (JSON).")
    variant_id: str | None = Field(default=None, description="Optional theme variant id.")
    deps: dict[str, Any] | None = Field(default=None, description="Optional dependency snapshot payload (JSON).")


class SiteEntryRollbackIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    revision: int = Field(..., ge=1, description="Target revision number to rollback to.")
    target: Literal["draft", "published"] = Field(..., description="Which revision pointer to rollback.")


class SiteEntryRollbackOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_id: PublicUUID = Field(..., description="Entry id.")
    target: Literal["draft", "published"] = Field(..., description="Which revision pointer was rolled back.")
    from_revision: int | None = Field(default=None, ge=1, description="Previous revision pointer value (if any).")
    to_revision: int = Field(..., ge=1, description="New revision pointer value.")
    rolled_back_at_ms: int = Field(..., description="Rollback timestamp in milliseconds (UTC).")


class SiteEntryDraftSaveIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_type_code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    slug: str = Field(..., min_length=1, max_length=256, description="Entry slug (unique within entry type).")
    page_blueprint: PageBlueprint | None = Field(
        default=None,
        alias="pageBlueprint",
        description="Optional PageBlueprint payload.",
    )
    data: dict[str, Any] | None = Field(default=None, description="Optional entry data payload (JSON).")
    meta: dict[str, Any] | None = Field(default=None, description="Optional metadata payload (JSON).")
    style_overrides: dict[str, Any] | None = Field(default=None, description="Optional style overrides payload (JSON).")
    variant_id: str | None = Field(default=None, description="Optional theme variant id.")
    deps: dict[str, Any] | None = Field(default=None, description="Optional dependency snapshot payload (JSON).")
    expected_revision: int | None = Field(
        default=None,
        ge=0,
        description="Optional optimistic lock revision. If provided, must match current draft revision.",
    )


class SiteEntryDraftSaveOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    entry_id: PublicUUID = Field(..., description="Entry id.")
    entry_type_code: str = Field(..., description="Entry type code.")
    slug: str = Field(..., description="Entry slug.")
    revision: int = Field(..., ge=1, description="Draft revision number.")
    saved_at_ms: int = Field(..., description="Saved timestamp in milliseconds (UTC).")


class SiteEntryPublishIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_type_code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    slug: str = Field(..., min_length=1, max_length=256, description="Entry slug (unique within entry type).")
    revision: int | None = Field(
        default=None,
        ge=1,
        description="Draft revision number to publish. If omitted, publish the latest draft revision.",
    )


class SiteEntryPublishOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    entry_id: PublicUUID = Field(..., description="Entry id.")
    entry_type_code: str = Field(..., description="Entry type code.")
    slug: str = Field(..., description="Entry slug.")
    revision: int = Field(..., ge=1, description="Published revision number.")
    published_at_ms: int = Field(..., description="Published timestamp in milliseconds (UTC).")


class SiteEntryUnpublishIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_type_code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    slug: str = Field(..., min_length=1, max_length=256, description="Entry slug (unique within entry type).")


class SiteEntryUnpublishOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    entry_id: PublicUUID = Field(..., description="Entry id.")
    entry_type_code: str = Field(..., description="Entry type code.")
    slug: str = Field(..., description="Entry slug.")
    unpublished_at_ms: int = Field(..., description="Unpublished timestamp in milliseconds (UTC).")


class SiteEntryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Entry id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    entry_type_id: PublicUUID = Field(..., description="Entry type id.")
    entry_type_code: str = Field(..., description="Entry type code.")
    slug: str = Field(..., description="Entry slug.")
    draft_revision: int = Field(default=0, ge=0, description="Current draft revision pointer.")
    published_revision: int | None = Field(default=None, ge=1, description="Current published revision pointer.")


class SiteEntryCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_type_code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    slug: str = Field(..., min_length=1, max_length=256, description="Entry slug (unique within entry type).")


class SiteEntryUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    slug: str | None = Field(default=None, min_length=1, max_length=256, description="Entry slug (unique).")


class SiteEntryDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_id: PublicUUID = Field(..., description="Deleted entry id.")
