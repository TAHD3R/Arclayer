from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID

ContentModelCategory = Literal["site_builder", "content_library", "system", "custom"]
ContentModelProtocolKey = Literal["article", "page", "reusable-section", "category"]
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
ContentWorkflowStage = Literal["drafting", "in_review", "changes_requested", "approved"]
ContentWorkbenchDerivedStatus = Literal["published", "changed", "draft", "archived"]
ContentWorkbenchRuntime = Literal["text", "visual", "data", "unknown"]
ContentWorkbenchContext = Literal["site_builder", "content_library", "system", "custom", "standalone"]
ContentWorkbenchLibraryGroup = Literal["site-content", "general-content", "structured-content"]
ContentModelKind = Literal["collection_type", "single_type", "component"]
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
ContentModelSchemaSnapshotStage = Literal["published", "current_draft", "next_draft"]
ContentModelSchemaDiffKind = Literal["field", "relation", "view", "policy", "default", "meta", "capability"]
ContentModelSchemaDiffOperation = Literal["added", "removed", "changed"]
ContentModelSchemaApplyGateStatus = Literal["ready", "review", "blocked"]


class ContentModelFieldDefinitionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str = Field(..., min_length=1, description="Stable field key.")
    label: str = Field(..., min_length=1, description="User-facing field label.")
    scalar: FieldScalarType = Field(..., description="Stored scalar type.")
    required: bool = Field(default=False, description="Whether the field is required.")
    config: dict[str, Any] | None = Field(default=None, description="Optional field configuration payload.")


class ContentModelContractBoundaryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    system_fields: list[ContentModelFieldDefinitionOut] = Field(
        default_factory=list,
        description="Locked system fields owned by the official protocol contract.",
    )
    custom_fields: list[ContentModelFieldDefinitionOut] = Field(
        default_factory=list,
        description="Workspace-managed fields that extend the protocol contract.",
    )
    locked_field_keys: list[str] = Field(
        default_factory=list,
        description="Field keys reserved by the official system contract.",
    )
    custom_field_count: int = Field(
        default=0,
        ge=0,
        description="Number of workspace-managed custom fields attached to the model.",
    )


class ContentModelCapabilityRegistryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    workflow: list[ContentModelCapability] = Field(
        default_factory=list,
        description="Capabilities that shape review and revision workflow behavior.",
    )
    delivery: list[ContentModelCapability] = Field(
        default_factory=list,
        description="Capabilities that shape publish and delivery behavior.",
    )
    graphql: list[ContentModelCapability] = Field(
        default_factory=list,
        description="Capabilities that affect GraphQL and query-facing behavior.",
    )


class ContentModelUserRefOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    user_id: PublicUUID = Field(..., description="User id.")
    username: str = Field(..., description="Username.")
    email: str | None = Field(default=None, description="Email.")
    display_name: str | None = Field(default=None, description="Display name.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")


class ContentModelContractRegistryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    protocol_key: ContentModelProtocolKey | None = Field(
        default=None,
        description="Official protocol identity for the current model registry entry.",
    )
    protocol_version: int = Field(default=1, ge=1, description="Protocol registry version.")
    category: ContentModelCategory = Field(default="custom", description="Registry-level model category.")
    system_managed: bool = Field(default=False, description="Whether this registry entry is system managed.")
    boundaries: ContentModelContractBoundaryOut = Field(
        default_factory=ContentModelContractBoundaryOut,
        description="System and custom field boundary definition.",
    )
    capabilities: ContentModelCapabilityRegistryOut = Field(
        default_factory=ContentModelCapabilityRegistryOut,
        description="Capability registry grouped by platform concern.",
    )
    workflow_policy: dict[str, Any] | None = Field(default=None, description="Workflow governance policy payload.")
    delivery_policy: dict[str, Any] | None = Field(default=None, description="Delivery governance policy payload.")
    graphql_policy: dict[str, Any] | None = Field(default=None, description="GraphQL governance policy payload.")


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


class ContentModelRevisionSummaryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    current_draft_revision: int = Field(default=1, ge=1, description="Current mutable draft revision.")
    published_revision: int | None = Field(
        default=None,
        ge=1,
        description="Published revision used by runtime reads when available.",
    )
    next_draft_revision: int = Field(default=1, ge=1, description="Draft revision that would be saved by the patch.")


class ContentModelSchemaSnapshotOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    stage: ContentModelSchemaSnapshotStage = Field(..., description="Snapshot stage within the revision lifecycle.")
    revision: int | None = Field(default=None, ge=1, description="Revision id associated with the snapshot.")
    field_count: int = Field(default=0, ge=0, description="Number of fields stored in the snapshot payload.")
    relation_count: int = Field(default=0, ge=0, description="Number of relations stored in the snapshot payload.")
    view_count: int = Field(default=0, ge=0, description="Number of views stored in the snapshot payload.")
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Canonical schema snapshot payload used for diff and review surfaces.",
    )


class ContentModelSchemaDiffEntryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    kind: ContentModelSchemaDiffKind = Field(..., description="Changed schema concern.")
    operation: ContentModelSchemaDiffOperation = Field(..., description="Diff operation for the changed target.")
    target: str = Field(..., min_length=1, description="Machine-readable change target path.")
    summary: str = Field(..., min_length=1, description="Human-readable description for the changed target.")
    breaking: bool = Field(default=False, description="Whether this diff entry introduces a breaking change.")
    before: Any | None = Field(default=None, description="Current draft value before the change.")
    after: Any | None = Field(default=None, description="Next draft value after the change.")


class ContentModelSchemaDiffOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    has_changes: bool = Field(default=False, description="Whether the change plan contains any schema changes.")
    has_breaking_changes: bool = Field(default=False, description="Whether the diff contains breaking changes.")
    breaking_change_count: int = Field(default=0, ge=0, description="Number of breaking diff entries.")
    entries: list[ContentModelSchemaDiffEntryOut] = Field(
        default_factory=list,
        description="Normalized schema diff entries between current and next draft snapshots.",
    )


class ContentModelSchemaApplyGateOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, description="Machine-readable apply gate code.")
    status: ContentModelSchemaApplyGateStatus = Field(..., description="Apply gate status.")
    title: str = Field(..., min_length=1, description="User-facing apply gate title.")
    detail: str = Field(..., min_length=1, description="User-facing apply gate detail.")


class ContentModelSchemaChangePlanOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    revisions: ContentModelRevisionSummaryOut = Field(
        default_factory=ContentModelRevisionSummaryOut,
        description="Revision lifecycle summary for the current preview.",
    )
    current_snapshot: ContentModelSchemaSnapshotOut = Field(
        default_factory=lambda: ContentModelSchemaSnapshotOut(stage="current_draft"),
        description="Canonical current draft snapshot.",
    )
    next_snapshot: ContentModelSchemaSnapshotOut = Field(
        default_factory=lambda: ContentModelSchemaSnapshotOut(stage="next_draft"),
        description="Canonical next draft snapshot after applying the patch payload.",
    )
    published_snapshot: ContentModelSchemaSnapshotOut | None = Field(
        default=None,
        description="Published baseline snapshot when runtime delivery has a recorded contract revision.",
    )
    diff: ContentModelSchemaDiffOut = Field(
        default_factory=ContentModelSchemaDiffOut,
        description="Normalized diff between the current and next draft snapshots.",
    )
    apply_gates: list[ContentModelSchemaApplyGateOut] = Field(
        default_factory=list,
        description="Read-only apply gates that explain save readiness and review obligations.",
    )
    apply_ready: bool = Field(default=False, description="Whether the current preview can be applied without blockers.")


class ContentModelImpactPreviewOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    affected_items_count: int = Field(
        default=0, ge=0, description="Items whose persisted continuation truth would change."
    )
    recovery_items_count: int = Field(
        default=0, ge=0, description="Items that would move into a non-ready recovery state."
    )
    reshape_items_count: int = Field(default=0, ge=0, description="Items that would stay ready but require reshaping.")
    has_blocking_changes: bool = Field(
        default=False, description="Whether the preview contains blocking continuation changes."
    )
    preview_token: str = Field(
        ..., min_length=1, description="Signed preview token required to commit the same mutation."
    )
    impact: ContentModelImpactOut = Field(
        default_factory=ContentModelImpactOut, description="Schema mutation impact summary."
    )
    change_plan: ContentModelSchemaChangePlanOut = Field(
        default_factory=ContentModelSchemaChangePlanOut,
        description="Formal schema change plan with revision snapshots, diff entries, and apply gates.",
    )


class ContentModelOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Content model id.")
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    singular_key: str = Field(..., min_length=1, max_length=64, description="Stable singular API identifier.")
    plural_key: str = Field(..., min_length=1, max_length=64, description="Stable plural API identifier.")
    name: str = Field(..., min_length=1, max_length=128, description="Display name.")
    description: str | None = Field(default=None, max_length=512, description="Optional model description.")
    protocol_key: ContentModelProtocolKey | None = Field(
        default=None,
        description="Official model protocol identity when this model is system managed.",
    )
    protocol_version: int = Field(default=1, ge=1, description="Official protocol revision.")
    system_managed: bool = Field(default=False, description="Whether the model is managed by the platform.")
    system_field_keys: list[str] = Field(
        default_factory=list,
        description="Locked system field keys reserved by the official protocol.",
    )
    draft_contract_revision: int = Field(default=1, ge=1, description="Current mutable draft contract revision.")
    published_contract_revision: int | None = Field(
        default=None,
        ge=1,
        description="Published contract revision used by delivery reads.",
    )
    updated_by_user_id: PublicUUID | None = Field(default=None, description="Last updater user id.")
    updated_by: ContentModelUserRefOut | None = Field(default=None, description="Last updater user summary.")
    updated_at: datetime = Field(..., description="Last update timestamp.")
    category: ContentModelCategory = Field(..., description="Model grouping category.")
    model_kind: ContentModelKind = Field(default="collection_type", description="Builder model kind.")
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
    contract_registry: ContentModelContractRegistryOut = Field(
        default_factory=ContentModelContractRegistryOut,
        description="Formal model contract registry entry used by admin governance surfaces.",
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


class ContentItemWorkflowNoteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    body: str = Field(..., min_length=1, description="Workflow note body.")
    created_at: datetime = Field(..., description="Workflow note timestamp.")
    actor_user_id: PublicUUID | None = Field(default=None, description="Optional note author id.")


class ContentItemPublishReadinessOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    ready: bool = Field(default=False, description="Whether the item is currently ready for publish orchestration.")
    blocker_codes: list[str] = Field(
        default_factory=list,
        description="Machine-readable blocker codes that explain why publish is still blocked.",
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
    workflow_stage: ContentWorkflowStage = Field(
        default="drafting",
        description="Current editorial workflow stage for the item.",
    )
    workflow_assignee_user_id: PublicUUID | None = Field(
        default=None,
        description="Current editorial assignee for the item.",
    )
    workflow_summary: str | None = Field(
        default=None, description="Optional workflow summary for current review cycle."
    )
    workflow_notes: list[ContentItemWorkflowNoteOut] = Field(
        default_factory=list,
        description="Editorial workflow notes attached to the item.",
    )
    publish_readiness: ContentItemPublishReadinessOut = Field(
        default_factory=ContentItemPublishReadinessOut,
        description="Per-item readiness summary used by workflow and release surfaces.",
    )
    created_by_user_id: PublicUUID | None = Field(default=None, description="Creator user id.")
    updated_by_user_id: PublicUUID | None = Field(default=None, description="Last updater user id.")
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


class ContentItemBulkTransitionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    items: list[ContentVersionOut] = Field(default_factory=list, description="Transitioned content versions.")


class ContentVersionCompareChangeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    path: str = Field(..., min_length=1, description="Changed snapshot path.")
    before: Any = Field(default=None, description="Value from the source version.")
    after: Any = Field(default=None, description="Value from the target version.")


class ContentVersionCompareOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    item_id: PublicUUID = Field(..., description="Content item id.")
    source_version_number: int = Field(..., ge=1, description="Source version number.")
    target_version_number: int = Field(..., ge=1, description="Target version number.")
    changes: list[ContentVersionCompareChangeOut] = Field(default_factory=list, description="Changed fields.")


class ContentModelFieldContract(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str = Field(..., min_length=1, max_length=64, description="Stable field key.")
    label: str = Field(..., min_length=1, max_length=128, description="Field label.")
    scalar: FieldScalarType = Field(..., description="Field scalar type.")
    required: bool = Field(default=False, description="Whether the field must be provided.")
    config: dict[str, Any] | None = Field(default=None, description="Field-level configuration payload.")


class ContentModelFieldPatchContract(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    label: str | None = Field(default=None, min_length=1, max_length=128, description="Field label.")
    scalar: FieldScalarType | None = Field(default=None, description="Field scalar type.")
    required: bool | None = Field(default=None, description="Whether the field must be provided.")
    config: dict[str, Any] | None = Field(default=None, description="Field-level configuration payload.")


class ContentModelFieldReorderContract(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    field_keys: list[str] = Field(..., min_length=1, description="Complete field key order.")


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

    singular_key: str = Field(..., min_length=1, max_length=64, description="Stable singular API identifier.")
    plural_key: str = Field(..., min_length=1, max_length=64, description="Stable plural API identifier.")
    name: str = Field(..., min_length=1, max_length=128, description="Display model name.")
    description: str | None = Field(default=None, max_length=512, description="Optional model description.")
    category: ContentModelCategory = Field(default="custom", description="Product surface grouping.")
    model_kind: ContentModelKind = Field(default="collection_type", description="Builder model kind.")
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
