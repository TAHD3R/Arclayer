from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.modules.sites.design_document.schema import PageBlueprint


class SitePageDraftSaveIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    page_blueprint: PageBlueprint = Field(
        ...,
        alias="pageBlueprint",
        description="Draft PageBlueprint payload.",
    )
    meta: dict[str, Any] | None = Field(default=None, description="Optional metadata payload (JSON).")
    style_overrides: dict[str, Any] | None = Field(default=None, description="Optional style overrides payload (JSON).")
    variant_id: str | None = Field(default=None, description="Optional theme variant id.")
    deps: dict[str, Any] | None = Field(default=None, description="Optional dependency snapshot payload (JSON).")
    expected_revision: int | None = Field(
        default=None,
        ge=0,
        description="Optional optimistic lock revision. If provided, must match current draft revision.",
        examples=[0],
    )


class SitePageDraftSaveOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    page_id: PublicUUID = Field(..., description="Page id.")
    path: str = Field(..., description="Page pathname (stable public URL).")
    revision: int = Field(..., ge=1, description="Draft revision number.")
    saved_at_ms: int = Field(..., description="Saved timestamp in milliseconds (UTC).")


class SitePagePublishIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    revision: int | None = Field(
        default=None,
        ge=1,
        description="Draft revision number to publish. If omitted, publish the latest draft revision.",
        examples=[1],
    )


class SitePagePublishOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    page_id: PublicUUID = Field(..., description="Page id.")
    path: str = Field(..., description="Page pathname (stable public URL).")
    revision: int = Field(..., ge=1, description="Published revision number.")
    published_at_ms: int = Field(..., description="Published timestamp in milliseconds (UTC).")


class SitePageUnpublishOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    page_id: PublicUUID = Field(..., description="Page id.")
    path: str = Field(..., description="Page pathname (stable public URL).")
    unpublished_at_ms: int = Field(..., description="Unpublished timestamp in milliseconds (UTC).")


class SitePageUserSummaryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="User id.")
    display_name: str | None = Field(default=None, description="Display name.")
    email: str | None = Field(default=None, description="Email.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")


class SitePageTreeNodeOut(BaseSchema):
    """
    Site page tree node (IA structure).

    Notes:
    - This is a tree node output schema, not an ORM schema. We build it explicitly in service layer.
    - Keep it stable and minimal to avoid coupling Admin UI to internal DB fields.
    """

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Page id.")
    title: str | None = Field(default=None, max_length=256, description="Page title.")
    description: str | None = Field(default=None, max_length=1024, description="Page description.")
    path: str = Field(..., description="Resolved unique pathname (e.g. /about).")
    parent_id: PublicUUID | None = Field(default=None, description="Parent page id (null for root).")
    sort_order: int = Field(default=0, description="Sort order within siblings.")
    visibility: Literal["public", "private"] = Field(..., description="Page visibility.")
    draft_revision: int = Field(default=0, ge=0, description="Current draft revision pointer.")
    published_revision: int | None = Field(default=None, ge=0, description="Current published revision pointer.")
    updated_at: datetime | None = Field(default=None, description="Last update time (UTC).")
    updated_by: SitePageUserSummaryOut | None = Field(
        default=None,
        description="Last updated-by user summary.",
    )
    children: list[SitePageTreeNodeOut] = Field(default_factory=list, description="Child pages.")


class SitePageCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=256, description="Page title.")
    description: str | None = Field(default=None, max_length=1024, description="Page description.")
    path: str = Field(..., description="Unique pathname (e.g. /about).", examples=["/about"])
    parent_id: PublicUUID | None = Field(default=None, description="Optional parent page id.")
    sort_order: int = Field(default=0, description="Sort order within siblings.")
    visibility: Literal["public", "private"] = Field(default="public", description="Page visibility.")


class SitePageUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=256, description="Page title.")
    description: str | None = Field(default=None, max_length=1024, description="Page description.")
    path: str | None = Field(default=None, description="Unique pathname (e.g. /about).", examples=["/about"])
    parent_id: PublicUUID | None = Field(default=None, description="Parent page id (null for root).")
    sort_order: int | None = Field(default=None, description="Sort order within siblings.")
    visibility: Literal["public", "private"] | None = Field(default=None, description="Page visibility.")


class SitePageMoveIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    parent_id: PublicUUID | None = Field(default=None, description="New parent page id (null for root).")
    sort_order: int = Field(default=0, description="New sort order within siblings.")


class SitePageDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    page_id: PublicUUID = Field(..., description="Deleted page id.")


class SitePageRevisionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    page_id: PublicUUID = Field(..., description="Page id.")
    state: Literal["draft", "published"] = Field(..., description="Revision state.")
    revision: int = Field(..., ge=1, description="Revision number.")
    created_at_ms: int = Field(..., description="Revision created timestamp in milliseconds (UTC).")
    page_blueprint: PageBlueprint = Field(
        ...,
        alias="pageBlueprint",
        description="PageBlueprint payload.",
    )
    meta: dict[str, Any] | None = Field(default=None, description="Optional metadata payload (JSON).")
    style_overrides: dict[str, Any] | None = Field(default=None, description="Optional style overrides payload (JSON).")
    variant_id: str | None = Field(default=None, description="Optional theme variant id.")
    deps: dict[str, Any] | None = Field(default=None, description="Optional dependency snapshot payload (JSON).")


class SitePageRollbackIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    revision: int = Field(..., ge=1, description="Target revision number to rollback to.")
    target: Literal["draft", "published"] = Field(..., description="Which revision pointer to rollback.")


class SitePageRollbackOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    page_id: PublicUUID = Field(..., description="Page id.")
    target: Literal["draft", "published"] = Field(..., description="Which revision pointer was rolled back.")
    from_revision: int | None = Field(default=None, ge=1, description="Previous revision pointer value (if any).")
    to_revision: int = Field(..., ge=1, description="New revision pointer value.")
    rolled_back_at_ms: int = Field(..., description="Rollback timestamp in milliseconds (UTC).")


SitePageTreeNodeOut.model_rebuild()
