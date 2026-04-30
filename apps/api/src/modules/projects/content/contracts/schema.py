from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

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
ProjectWorkflowRoleCode = Literal["owner", "editor", "viewer"]
ContentWorkbenchDerivedStatus = Literal["published", "changed", "draft", "archived"]
ContentWorkbenchRuntime = Literal["text", "visual", "data", "unknown"]
ContentWorkbenchContext = Literal["site_builder", "content_library", "system", "custom", "standalone"]
ContentWorkbenchLibraryGroup = Literal["site-content", "general-content", "structured-content"]
ContentModelKind = Literal["collection_type", "single_type", "component"]
ContentModelFieldTypeSource = Literal["built_in", "plugin"]
ContentModelFieldTypeLifecycle = Literal["active", "deprecated", "disabled"]
ContentModelFieldTypeGroup = Literal["text", "value_logic", "time_media", "structure", "custom"]
ContentModelFieldConfigSection = Literal["basic", "advanced"]
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

RelationType = Literal[
    "one_to_one",
    "one_to_many",
    "many_to_one",
    "many_to_many",
    "one_way",
    "many_way",
    "morph_to_one",
    "morph_to_many",
    "morph_one",
    "morph_many",
]
ViewType = Literal["detail", "list", "table", "grid", "tree"]
ContentModelSchemaSnapshotStage = Literal["published", "current_draft", "next_draft"]
ContentModelSchemaDiffKind = Literal["field", "relation", "view", "policy", "default", "meta", "capability"]
ContentModelSchemaDiffOperation = Literal["added", "removed", "changed"]
ContentModelSchemaApplyGateStatus = Literal["ready", "review", "blocked"]
ContentModelStorageSyncStrategy = Literal["jsonb_snapshot"]
ContentModelStorageSyncState = Literal["planned", "applied"]
ContentModelStorageMigrationOperation = Literal[
    "field_add",
    "field_remove",
    "field_rename",
    "field_type_change",
    "field_index_change",
    "field_config_change",
]


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


class ContentModelKindDefinitionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: ContentModelKind = Field(..., description="Model kind identifier.")
    label_key: str = Field(..., min_length=1, description="Admin i18n label key.")
    description_key: str = Field(..., min_length=1, description="Admin i18n description key.")
    default_editor: ContentDefaultEditor = Field(..., description="Default editor for this model kind.")
    default_capabilities: list[ContentModelCapability] = Field(
        default_factory=list,
        description="Capabilities applied when a model of this kind is created.",
    )


class ContentModelFieldTypeDefinitionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    uid: str = Field(..., min_length=1, max_length=128, description="Field type registry UID.")
    config_kind: str = Field(..., min_length=1, max_length=64, description="Value stored in field config.kind.")
    source: ContentModelFieldTypeSource = Field(..., description="Definition source.")
    lifecycle: ContentModelFieldTypeLifecycle = Field(default="active", description="Registration lifecycle state.")
    scalar: FieldScalarType = Field(..., description="Persisted storage scalar.")
    group: ContentModelFieldTypeGroup = Field(..., description="Admin picker group.")
    label_key: str | None = Field(default=None, min_length=1, description="Admin i18n label key.")
    description_key: str | None = Field(default=None, min_length=1, description="Admin i18n description key.")
    label: str | None = Field(default=None, min_length=1, description="Plugin provided label.")
    description: str | None = Field(default=None, min_length=1, description="Plugin provided description.")
    icon: str | None = Field(default=None, min_length=1, max_length=64, description="Admin icon token.")
    plugin_id: str | None = Field(default=None, min_length=1, max_length=128, description="Owning plugin id.")
    config_schema: dict[str, Any] = Field(
        default_factory=dict,
        description="JSON-schema-like config contract owned by the registry definition.",
    )
    settings_sections: list[ContentModelFieldConfigSection] = Field(
        default_factory=list,
        description="Admin settings sections supplied by this field type.",
    )
    allowed_model_kinds: list[ContentModelKind] = Field(
        default_factory=list,
        description="Model kinds that may use this field type.",
    )


class ContentModelFieldTypeRegistryOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    model_kinds: list[ContentModelKindDefinitionOut] = Field(
        default_factory=list,
        description="Supported content model kinds.",
    )
    field_types: list[ContentModelFieldTypeDefinitionOut] = Field(
        default_factory=list,
        description="Registered built-in and plugin field types.",
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


class ContentModelStorageFieldOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str = Field(..., min_length=1, description="Field key inside the JSONB snapshot.")
    scalar: FieldScalarType = Field(..., description="Content model field scalar.")
    db_column_type: str = Field(
        ..., min_length=1, description="Database-native type hint resolved from the field type registry."
    )
    json_path: str = Field(..., min_length=1, description="JSONB path used by query builders and generated routes.")
    required: bool = Field(default=False, description="Whether the field is required by the content model.")
    unique: bool = Field(default=False, description="Whether the field declares uniqueness in its config.")
    indexed: bool = Field(default=False, description="Whether the field declares generated index intent.")
    localizable: bool = Field(default=False, description="Whether the field declares localization in its config.")
    omit_from_api_response: bool = Field(
        default=False, description="Whether the field is hidden from delivery/API responses."
    )


class ContentModelStorageMigrationOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    operation: ContentModelStorageMigrationOperation = Field(..., description="Storage sync migration operation.")
    target: str = Field(..., min_length=1, description="Changed storage path or field pair.")
    state: ContentModelStorageSyncState = Field(..., description="Migration state in the current plan.")
    reversible: bool = Field(default=True, description="Whether a rollback plan is available.")
    summary: str = Field(..., min_length=1, description="Human-readable storage migration summary.")
    before: Any = Field(default=None, description="Source storage metadata.")
    after: Any = Field(default=None, description="Target storage metadata.")
    forward_steps: list[str] = Field(default_factory=list, description="Idempotent forward migration steps.")
    rollback_steps: list[str] = Field(default_factory=list, description="Idempotent rollback steps.")


class ContentModelStorageSyncPlanOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    strategy: ContentModelStorageSyncStrategy = Field(..., description="Canonical storage strategy.")
    state: ContentModelStorageSyncState = Field(..., description="Plan state for this snapshot.")
    schema_revision: int = Field(..., ge=1, description="Schema revision this storage plan describes.")
    storage_target: str = Field(..., min_length=1, description="Physical storage target for content field values.")
    fields: list[ContentModelStorageFieldOut] = Field(
        default_factory=list,
        description="Resolved field storage metadata for the current schema snapshot.",
    )
    migrations: list[ContentModelStorageMigrationOut] = Field(
        default_factory=list,
        description="Forward migration records required to reach this plan.",
    )
    diagnostics: list[str] = Field(
        default_factory=list,
        description="Operator diagnostics explaining storage behavior and repair context.",
    )


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
    storage_sync: ContentModelStorageSyncPlanOut | None = Field(
        default=None,
        description="Versioned storage sync plan generated from the canonical schema diff.",
    )


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


def _default_workflow_stages() -> list[ContentWorkflowStage]:
    return ["drafting", "in_review", "changes_requested", "approved"]


class ContentWorkflowTransitionContract(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    from_stage: ContentWorkflowStage = Field(..., description="Source editorial workflow stage.")
    to_stage: ContentWorkflowStage = Field(..., description="Target editorial workflow stage.")


class ContentWorkflowStageActorContract(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    stage: ContentWorkflowStage = Field(..., description="Editorial workflow stage governed by this rule.")
    role_codes: list[ProjectWorkflowRoleCode] = Field(
        default_factory=list,
        description="Project roles allowed by this rule.",
    )
    user_ids: list[PublicUUID] = Field(
        default_factory=list,
        description="User ids allowed by this rule.",
    )

    @model_validator(mode="after")
    def _validate_actor_selector(self) -> ContentWorkflowStageActorContract:
        if not self.role_codes and not self.user_ids:
            raise ValueError("workflow stage actor rule requires at least one role or user")
        return self


class ContentWorkflowContract(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    states: list[str] = Field(default_factory=list, description="Allowed workflow states.")
    initial_state: str | None = Field(default=None, description="Initial workflow state.")
    stages: list[ContentWorkflowStage] = Field(
        default_factory=_default_workflow_stages,
        min_length=1,
        description="Allowed editorial workflow stages.",
    )
    initial_stage: ContentWorkflowStage = Field(default="drafting", description="Initial editorial workflow stage.")
    publish_stage: ContentWorkflowStage = Field(default="approved", description="Stage required before publishing.")
    transitions: list[ContentWorkflowTransitionContract] = Field(
        default_factory=list,
        description="Allowed editorial workflow stage transitions.",
    )
    stage_assignments: list[ContentWorkflowStageActorContract] = Field(
        default_factory=list,
        description="Stage assignee rules keyed by editorial workflow stage.",
    )
    stage_permissions: list[ContentWorkflowStageActorContract] = Field(
        default_factory=list,
        description="Stage transition permission rules keyed by the current editorial workflow stage.",
    )

    @model_validator(mode="after")
    def _validate_editorial_workflow(self) -> ContentWorkflowContract:
        stage_set = set(self.stages)
        if len(stage_set) != len(self.stages):
            raise ValueError("workflow stages must be unique")
        if self.initial_stage not in stage_set:
            raise ValueError("initialStage must be included in stages")
        if self.publish_stage not in stage_set:
            raise ValueError("publishStage must be included in stages")
        for transition in self.transitions:
            if transition.from_stage not in stage_set or transition.to_stage not in stage_set:
                raise ValueError("workflow transitions must reference configured stages")
        for rule in [*self.stage_assignments, *self.stage_permissions]:
            if rule.stage not in stage_set:
                raise ValueError("workflow stage rules must reference configured stages")
        return self


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
