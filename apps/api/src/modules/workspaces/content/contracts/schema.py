from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.common.types.public_uuid import PublicUUID

ContentModelCategory = Literal["site_builder", "content_library", "system", "custom"]
ContentModelCapability = Literal[
    "versioned",
    "routable",
    "treeable",
    "visual_editable",
    "rich_text_editable",
    "queryable",
    "has_slots",
    "has_relations",
    "localizable",
    "publishable",
    "schedulable",
    "seo_managed",
]
ContentDefaultEditor = Literal["form", "visual", "rich_text", "table"]
ContentItemStatus = Literal["draft", "published", "archived"]
ContentItemVisibility = Literal["public", "private"]
ContentVersionState = Literal["draft", "published", "scheduled", "archived"]
ContentPresentationKind = Literal[
    "form_data",
    "rich_text_document",
    "visual_blueprint",
    "query_definition",
    "slot_mapping",
    "seo",
]

FieldScalarType = Literal[
    "text",
    "long_text",
    "number",
    "boolean",
    "date_time",
    "json",
]

RelationType = Literal["one_to_one", "one_to_many", "many_to_one", "many_to_many"]
ViewType = Literal["detail", "list", "table", "grid", "tree"]


class ContentModelImpactChangeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, description="Machine-readable change code.")
    target: str = Field(..., min_length=1, description="Schema target affected by the change.")
    message: str = Field(..., min_length=1, description="Human-readable impact summary.")


class ContentModelImpactOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    has_breaking_changes: bool = Field(default=False, description="Whether the model edit introduces breaking changes.")
    breaking_changes: list[ContentModelImpactChangeOut] = Field(
        default_factory=list,
        description="Breaking schema changes detected for the model.",
    )
    warnings: list[str] = Field(default_factory=list, description="Non-blocking schema warnings.")


class ContentModelOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Content model id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    key: str = Field(..., min_length=1, max_length=64, description="Stable model key.")
    name: str = Field(..., min_length=1, max_length=128, description="Display name.")
    description: str | None = Field(default=None, max_length=512, description="Optional model description.")
    category: ContentModelCategory = Field(..., description="Model grouping category.")
    capabilities: list[ContentModelCapability] = Field(default_factory=list, description="Enabled model capabilities.")
    default_editor: ContentDefaultEditor = Field(default="form", description="Default editor mode.")
    field_schema: dict[str, Any] | None = Field(default=None, description="Field schema payload.")
    relation_schema: dict[str, Any] | None = Field(default=None, description="Relation schema payload.")
    routing_schema: dict[str, Any] | None = Field(default=None, description="Routing schema payload.")
    presentation_schema: dict[str, Any] | None = Field(default=None, description="Presentation schema payload.")
    workflow_policy: dict[str, Any] | None = Field(default=None, description="Workflow policy payload.")
    view_schema: dict[str, Any] | None = Field(default=None, description="View schema payload.")


class ContentItemOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Content item id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    model_id: PublicUUID = Field(..., description="Content model id.")
    model_key: str = Field(..., min_length=1, max_length=64, description="Content model key.")
    slug: str = Field(..., min_length=1, max_length=256, description="Stable item slug.")
    title: str | None = Field(default=None, description="Optional item title.")
    status: ContentItemStatus = Field(..., description="Lifecycle status.")
    visibility: ContentItemVisibility = Field(..., description="Visibility status.")
    locale: str = Field(..., min_length=2, max_length=16, description="Locale code.")
    draft_version: int = Field(default=0, ge=0, description="Current draft version pointer.")
    published_version: int | None = Field(default=None, ge=1, description="Current published version pointer.")
    updated_at: datetime = Field(..., description="Last update timestamp.")


class ContentPresentationOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    kind: ContentPresentationKind = Field(..., description="Presentation kind.")
    payload: dict[str, Any] | None = Field(default=None, description="Presentation payload.")


class ContentPresentationListOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    items: list[ContentPresentationOut] = Field(default_factory=list, description="Presentation documents.")


class ContentSeoProfileOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    meta_title: str | None = Field(default=None, max_length=256, description="Resolved SEO title.")
    meta_description: str | None = Field(default=None, max_length=512, description="Resolved SEO description.")
    canonical_url: str | None = Field(default=None, max_length=1024, description="Canonical URL.")
    robots_directive: str | None = Field(default=None, max_length=128, description="Robots directive.")
    payload: dict[str, Any] | None = Field(default=None, description="Raw SEO payload.")


class ContentComponentBindingOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    component_key: str = Field(..., min_length=1, max_length=128, description="Component identity.")
    binding_key: str = Field(..., min_length=1, max_length=128, description="Binding identity.")
    binding_payload: dict[str, Any] | None = Field(default=None, description="Binding payload.")
    sort_order: int = Field(default=0, ge=0, description="Binding order within the version.")


class ContentComponentBindingListOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    items: list[ContentComponentBindingOut] = Field(default_factory=list, description="Component bindings.")


class ContentVersionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    item_id: PublicUUID = Field(..., description="Content item id.")
    version_number: int = Field(..., ge=1, description="Monotonic version number.")
    state: ContentVersionState = Field(..., description="Version state.")
    created_at: datetime = Field(..., description="Creation timestamp.")
    created_by_user_id: PublicUUID | None = Field(default=None, description="Creator user id.")
    last_transition_by_user_id: PublicUUID | None = Field(
        default=None,
        description="Last transition actor user id.",
    )
    fields_snapshot: dict[str, Any] = Field(default_factory=dict, description="Structured fields snapshot.")
    presentations: list[ContentPresentationOut] = Field(default_factory=list, description="Presentation snapshots.")
    change_summary: str | None = Field(default=None, max_length=512, description="Optional change summary.")


class ContentModelFieldContract(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str = Field(..., min_length=1, max_length=64, description="Stable field key.")
    label: str = Field(..., min_length=1, max_length=128, description="Field label.")
    scalar: FieldScalarType = Field(..., description="Field scalar type.")
    required: bool = Field(default=False, description="Whether the field must be provided.")
    config: dict[str, Any] | None = Field(default=None, description="Field-level configuration payload.")


class ContentModelRelationContract(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str = Field(..., min_length=1, max_length=64, description="Stable relation key.")
    relation: RelationType = Field(..., description="Relation cardinality.")
    target_model_key: str = Field(..., min_length=1, max_length=64, description="Target model key.")
    required: bool = Field(default=False, description="Whether the relation must be provided.")
    config: dict[str, Any] | None = Field(default=None, description="Relation-level configuration payload.")


class ContentRoutingContract(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    mode: Literal["none", "single", "localized"] = Field(default="none", description="Routing behavior mode.")
    slug_field: str | None = Field(default=None, min_length=1, max_length=64, description="Slug source field.")


class ContentWorkflowContract(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    states: list[str] = Field(default_factory=list, description="Allowed workflow states.")
    initial_state: str | None = Field(default=None, description="Initial workflow state.")


class ContentModelViewContract(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str = Field(..., min_length=1, max_length=64, description="Stable view key.")
    label: str = Field(..., min_length=1, max_length=128, description="View label.")
    type: ViewType = Field(..., description="View type.")
    config: dict[str, Any] | None = Field(default=None, description="View-level configuration payload.")


class ContentModelDefinitionContract(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str = Field(..., min_length=1, max_length=64, description="Stable model key.")
    name: str = Field(..., min_length=1, max_length=128, description="Display model name.")
    description: str | None = Field(default=None, max_length=512, description="Optional model description.")
    category: ContentModelCategory = Field(default="custom", description="Product surface grouping.")
    default_editor: ContentDefaultEditor = Field(default="form", description="Default editing mode.")
    fields: list[ContentModelFieldContract] = Field(default_factory=list, description="Explicit field contracts.")
    relations: list[ContentModelRelationContract] = Field(
        default_factory=list,
        description="Explicit relation contracts.",
    )
    capabilities: list[ContentModelCapability] = Field(
        default_factory=list,
        description="Explicit capability declarations.",
    )
    routing: ContentRoutingContract = Field(
        default_factory=ContentRoutingContract,
        description="Routing contract.",
    )
    workflow: ContentWorkflowContract = Field(
        default_factory=ContentWorkflowContract,
        description="Workflow contract.",
    )
    views: list[ContentModelViewContract] = Field(default_factory=list, description="View contracts.")
    presentation: dict[str, Any] | None = Field(
        default=None,
        description="Presentation policy contract.",
    )
    seo: dict[str, Any] | None = Field(
        default=None,
        description="SEO policy contract.",
    )
