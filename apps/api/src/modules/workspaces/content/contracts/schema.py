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
ContentContinuationRole = Literal[
    "page",
    "article",
    "reusable-section",
    "taxonomy",
    "person",
    "settings",
    "data",
    "general",
]
ContentContinuationPosture = Literal["page", "entry", "composition", "structured"]
ContentContinuationSurface = Literal["writing", "canvas", "structured"]
ContentShapeState = Literal["ready", "blocked", "unshaped"]
ContentWorkbenchDerivedStatus = Literal["published", "changed", "draft", "archived"]
ContentWorkbenchRuntime = Literal["text", "visual", "data", "unknown"]
ContentWorkbenchContext = Literal["site_builder", "content_library", "system", "custom", "standalone"]
ContentWorkbenchLibraryGroup = Literal["site-content", "general-content", "structured-content"]
ContentShapeReasonCode = Literal[
    "UNSHAPED_ITEM",
    "MODEL_DEFAULT_INVALID",
    "CONTINUATION_TRUTH_MISSING",
    "SURFACE_UNAVAILABLE",
    "MISSING_ROUTE",
    "PARENT_UNPUBLISHED",
    "RECOVERY_REQUIRED",
]
ContentItemStatus = Literal["draft", "published", "archived"]
ContentItemVisibility = Literal["public", "private"]
ContentBootstrapPresetState = Literal["selected", "customized", "none"]
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
    default_role: ContentContinuationRole | None = Field(
        default=None,
        description="Default continuation role resolved for new items of this model.",
    )
    default_posture: ContentContinuationPosture | None = Field(
        default=None,
        description="Default continuation posture resolved for new items of this model.",
    )
    default_surface: ContentContinuationSurface | None = Field(
        default=None,
        description="Default continuation surface resolved for new items of this model.",
    )
    starter_pack_policy: dict[str, Any] | None = Field(
        default=None,
        description="Starter pack policy used when shaping new items.",
    )
    surface_policy: dict[str, Any] | None = Field(
        default=None,
        description="Surface policy constraints for continuation routing.",
    )
    field_schema: dict[str, Any] | None = Field(default=None, description="Field schema payload.")
    relation_schema: dict[str, Any] | None = Field(default=None, description="Relation schema payload.")
    routing_schema: dict[str, Any] | None = Field(default=None, description="Routing schema payload.")
    presentation_schema: dict[str, Any] | None = Field(default=None, description="Presentation schema payload.")
    workflow_policy: dict[str, Any] | None = Field(default=None, description="Workflow policy payload.")
    view_schema: dict[str, Any] | None = Field(default=None, description="View schema payload.")


class ContentRecoveryActionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    kind: str = Field(..., min_length=1, description="Machine-readable recovery action kind.")
    label: str = Field(..., min_length=1, description="User-facing recovery action label.")
    route: str | None = Field(default=None, description="Optional admin route for the recovery action.")


class ContentOpenIntentOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    surface: ContentContinuationSurface | None = Field(
        default=None,
        description="Target continuation surface.",
    )
    route: str | None = Field(
        default=None,
        description="Admin route to open for this item.",
    )
    blocked: bool = Field(default=False, description="Whether continuation is currently blocked.")
    reason_code: ContentShapeReasonCode | None = Field(
        default=None,
        description="Machine-readable blocker or recovery code.",
    )
    reason_meta: dict[str, Any] | None = Field(
        default=None,
        description="Structured metadata for the blocker or recovery reason.",
    )
    recovery_actions: list[ContentRecoveryActionOut] = Field(
        default_factory=list,
        description="Recovery actions that can unblock continuation.",
    )


class ContentItemOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Content item id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    model_id: PublicUUID | None = Field(default=None, description="Optional content model id.")
    model_key: str | None = Field(default=None, min_length=1, max_length=64, description="Optional content model key.")
    slug: str = Field(..., min_length=1, max_length=256, description="Stable item slug.")
    title: str | None = Field(default=None, description="Optional item title.")
    summary: str | None = Field(default=None, description="Optional item summary/description.")
    status: ContentItemStatus = Field(..., description="Lifecycle status.")
    visibility: ContentItemVisibility = Field(..., description="Visibility status.")
    locale: str = Field(..., min_length=2, max_length=16, description="Locale code.")
    bootstrap_preset_key: str | None = Field(
        default=None,
        min_length=1,
        max_length=64,
        description="Optional starting preset identifier.",
    )
    bootstrap_preset_state: ContentBootstrapPresetState = Field(
        default="none",
        description="Whether the current capability set still matches a selected preset.",
    )
    capability_pack_ids: list[str] = Field(
        default_factory=list,
        description="Activated capability pack identifiers that define the item's current shape.",
    )
    resolved_role: ContentContinuationRole | None = Field(
        default=None,
        description="Resolved continuation role persisted on the item.",
    )
    resolved_posture: ContentContinuationPosture | None = Field(
        default=None,
        description="Resolved continuation posture persisted on the item.",
    )
    resolved_surface: ContentContinuationSurface | None = Field(
        default=None,
        description="Resolved continuation surface persisted on the item.",
    )
    derived_status: ContentWorkbenchDerivedStatus = Field(
        default="draft",
        description="Workbench lifecycle classification used by the content library.",
    )
    runtime: ContentWorkbenchRuntime = Field(
        default="unknown",
        description="Workbench runtime classification used by the content library.",
    )
    context: ContentWorkbenchContext = Field(
        default="standalone",
        description="Workbench content context used by the content library.",
    )
    library_group: ContentWorkbenchLibraryGroup = Field(
        default="general-content",
        description="Workbench grouping used by system views in the content library.",
    )
    edit_with: ContentContinuationSurface = Field(
        default="structured",
        description="Workbench editing surface classification used by the content library.",
    )
    role: ContentContinuationRole = Field(
        default="general",
        description="Workbench role classification used by the content library.",
    )
    shape_state: ContentShapeState = Field(
        default="unshaped",
        description="Resolved continuation shape state.",
    )
    shape_reason_code: ContentShapeReasonCode | None = Field(
        default=None,
        description="Machine-readable reason for blocked or unshaped continuation.",
    )
    shape_reason_meta: dict[str, Any] | None = Field(
        default=None,
        description="Structured metadata for the current shape reason.",
    )
    open_intent: ContentOpenIntentOut | None = Field(
        default=None,
        description="Backend-resolved open intent for routing into the next continuation surface.",
    )
    continuation_target: ContentOpenIntentOut | None = Field(
        default=None,
        description="Alias of the resolved continuation target for UI routing consumers.",
    )
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
    default_role: ContentContinuationRole | None = Field(
        default=None,
        description="Optional explicit default continuation role.",
    )
    default_posture: ContentContinuationPosture | None = Field(
        default=None,
        description="Optional explicit default continuation posture.",
    )
    default_surface: ContentContinuationSurface | None = Field(
        default=None,
        description="Optional explicit default continuation surface.",
    )
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
    starter_pack_policy: dict[str, Any] | None = Field(
        default=None,
        description="Starter pack policy contract.",
    )
    surface_policy: dict[str, Any] | None = Field(
        default=None,
        description="Surface policy contract.",
    )
