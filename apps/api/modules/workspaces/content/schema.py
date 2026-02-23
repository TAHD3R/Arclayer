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


class ContentGlobalSlotOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    slot_key: str = Field(..., min_length=1, max_length=128, description="Global slot key.")
    value: dict[str, Any] | None = Field(default=None, description="Global slot value payload.")
    updated_at_ms: int = Field(..., ge=0, description="Global slot update timestamp in milliseconds.")


class ContentGlobalSlotsOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    items: list[ContentGlobalSlotOut] = Field(default_factory=list, description="Global slots.")


class ContentGlobalSlotUpsertIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    value: dict[str, Any] | None = Field(default=None, description="Global slot value payload.")


ContentMenuItemKind = Literal["link", "page", "entry", "custom"]
ContentViewFilterOp = Literal["eq", "neq", "in", "contains"]
ContentViewSortOrder = Literal["asc", "desc"]


class ContentMenuItemOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Menu item id.")
    label: str = Field(..., min_length=1, max_length=256, description="Menu item label.")
    kind: ContentMenuItemKind = Field(default="link", description="Menu item kind.")
    target: str | None = Field(default=None, max_length=512, description="Menu item target value.")
    parent_id: PublicUUID | None = Field(default=None, description="Parent menu item id.")
    sort_order: int = Field(default=0, description="Menu item sort order.")
    meta: dict[str, Any] | None = Field(default=None, description="Menu item metadata payload.")
    children: list[ContentMenuItemOut] = Field(default_factory=list, description="Nested child menu items.")


class ContentMenuOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Menu id.")
    key: str = Field(..., min_length=1, max_length=64, description="Stable menu key.")
    name: str = Field(..., min_length=1, max_length=128, description="Menu display name.")
    items: list[ContentMenuItemOut] = Field(default_factory=list, description="Menu items tree.")
    updated_at_ms: int = Field(..., ge=0, description="Menu update timestamp in milliseconds.")


class ContentMenuCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str = Field(..., min_length=1, max_length=64, description="Stable menu key.")
    name: str = Field(..., min_length=1, max_length=128, description="Menu display name.")


class ContentMenuUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str | None = Field(default=None, min_length=1, max_length=64, description="Stable menu key.")
    name: str | None = Field(default=None, min_length=1, max_length=128, description="Menu display name.")


class ContentMenuDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    menu_id: PublicUUID = Field(..., description="Deleted menu id.")


class ContentMenuItemCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    label: str = Field(..., min_length=1, max_length=256, description="Menu item label.")
    kind: ContentMenuItemKind = Field(default="link", description="Menu item kind.")
    target: str | None = Field(default=None, max_length=512, description="Menu item target value.")
    parent_id: PublicUUID | None = Field(default=None, description="Parent menu item id.")
    sort_order: int = Field(default=0, description="Menu item sort order.")
    meta: dict[str, Any] | None = Field(default=None, description="Menu item metadata payload.")


class ContentMenuItemUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    label: str | None = Field(default=None, min_length=1, max_length=256, description="Menu item label.")
    kind: ContentMenuItemKind | None = Field(default=None, description="Menu item kind.")
    target: str | None = Field(default=None, max_length=512, description="Menu item target value.")
    parent_id: PublicUUID | None = Field(default=None, description="Parent menu item id.")
    sort_order: int | None = Field(default=None, description="Menu item sort order.")
    meta: dict[str, Any] | None = Field(default=None, description="Menu item metadata payload.")


class ContentMenuItemDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    item_id: PublicUUID = Field(..., description="Deleted menu item id.")


class ContentMenuItemReorderNodeIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Menu item id.")
    children: list[ContentMenuItemReorderNodeIn] = Field(default_factory=list, description="Nested child order.")


class ContentMenuItemsReorderIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    items: list[ContentMenuItemReorderNodeIn] = Field(default_factory=list, description="Ordered menu item tree.")


class ContentBlockOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Block id.")
    code: str = Field(..., min_length=1, max_length=64, description="Block stable code.")
    name: str = Field(..., min_length=1, max_length=128, description="Block display name.")
    payload: dict[str, Any] | None = Field(default=None, description="Block payload.")
    updated_at_ms: int = Field(..., ge=0, description="Block update timestamp in milliseconds.")


class ContentBlockCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, max_length=64, description="Block stable code.")
    name: str = Field(..., min_length=1, max_length=128, description="Block display name.")
    payload: dict[str, Any] | None = Field(default=None, description="Block payload.")


class ContentBlockUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=128, description="Block display name.")
    payload: dict[str, Any] | None = Field(default=None, description="Block payload.")


class ContentBlockDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    block_id: PublicUUID = Field(..., description="Deleted block id.")


class ContentBlockUsageOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    source: Literal["page", "entry", "menu", "view"] = Field(..., description="Usage source type.")
    source_id: PublicUUID = Field(..., description="Usage source id.")
    path: str = Field(..., description="Usage path hint.")


class ContentBlockUsagesOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    block_id: PublicUUID = Field(..., description="Block id.")
    usages: list[ContentBlockUsageOut] = Field(default_factory=list, description="Block usages.")


class ContentViewFilterIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    field: str = Field(..., min_length=1, max_length=64, description="Filter field.")
    op: ContentViewFilterOp = Field(..., description="Filter operator.")
    value: Any = Field(..., description="Filter value.")


class ContentViewSortIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    field: str = Field(..., min_length=1, max_length=64, description="Sort field.")
    order: ContentViewSortOrder = Field(default="desc", description="Sort order.")


class ContentViewDslIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    filters: list[ContentViewFilterIn] = Field(default_factory=list, description="View filter rules.")
    sort: list[ContentViewSortIn] = Field(default_factory=list, description="View sort rules.")
    limit: int | None = Field(default=None, ge=1, le=1000, description="Default preview limit.")
    projection: list[str] | None = Field(default=None, description="Field projection list.")
    display_mode: str | None = Field(default=None, max_length=64, description="Display mode code for field filtering.")
    include_document_ir: bool = Field(default=False, description="Whether to include full DocumentIR.")


class ContentViewOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="View id.")
    code: str = Field(..., min_length=1, max_length=64, description="View stable code.")
    name: str = Field(..., min_length=1, max_length=128, description="View display name.")
    type_code: str | None = Field(default=None, min_length=1, max_length=64, description="Optional content type code.")
    dsl: ContentViewDslIn = Field(..., description="View DSL definition.")
    enabled: bool = Field(default=True, description="Whether this view is enabled.")
    updated_at_ms: int = Field(..., ge=0, description="View update timestamp in milliseconds.")


class ContentViewCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, max_length=64, description="View stable code.")
    name: str = Field(..., min_length=1, max_length=128, description="View display name.")
    type_code: str | None = Field(default=None, min_length=1, max_length=64, description="Optional content type code.")
    dsl: ContentViewDslIn = Field(default_factory=ContentViewDslIn, description="View DSL definition.")
    enabled: bool = Field(default=True, description="Whether this view is enabled.")


class ContentViewUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=128, description="View display name.")
    type_code: str | None = Field(default=None, min_length=1, max_length=64, description="Optional content type code.")
    dsl: ContentViewDslIn | None = Field(default=None, description="View DSL definition.")
    enabled: bool | None = Field(default=None, description="Whether this view is enabled.")


class ContentViewDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    view_id: PublicUUID = Field(..., description="Deleted view id.")


class ContentViewPreviewIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    limit: int | None = Field(default=None, ge=1, le=1000, description="Preview limit override.")
    offset: int = Field(default=0, ge=0, description="Preview offset.")


class ContentViewPreviewOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    view_id: PublicUUID = Field(..., description="View id.")
    total: int = Field(..., ge=0, description="Total matched rows before pagination.")
    items: list[dict[str, Any]] = Field(default_factory=list, description="Preview rows.")


class ContentActiveThemeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    theme_id: str | None = Field(default=None, description="Active theme id.")
    version: str | None = Field(default=None, description="Active theme version.")


class ContentActiveThemeSetIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    theme_id: str = Field(..., min_length=1, max_length=128, description="Theme id.")
    version: str = Field(..., min_length=1, max_length=64, description="Theme version.")


class ContentStyleValueOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    value: dict[str, Any] | None = Field(default=None, description="Style payload.")


class ContentStyleSetIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    value: dict[str, Any] | None = Field(default=None, description="Style payload.")


class ContentEffectiveStyleOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    global_style: dict[str, Any] | None = Field(default=None, description="Global style payload.")
    type_style: dict[str, Any] | None = Field(default=None, description="Type style payload.")
    entry_style: dict[str, Any] | None = Field(default=None, description="Entry style payload.")
    effective: dict[str, Any] | None = Field(default=None, description="Merged effective style payload.")
