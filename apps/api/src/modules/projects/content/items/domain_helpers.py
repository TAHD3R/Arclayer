from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.common.utils.slug import slugify
from src.core.exceptions import Conflict
from src.models.content._enums import (
    ContentItemStatus,
    ContentItemVisibility,
    ContentVersionState,
    ContentWorkflowStage,
)
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.model_definition import ContentModelDefinitionRecord
from src.modules.projects.content.continuation import (
    CONTINUATION_TRUTH_MISSING_REASON_CODE,
)
from src.modules.projects.content.contracts.schema import (
    ContentBootstrapPresetState,
    ContentContinuationPosture,
    ContentContinuationRole,
    ContentContinuationSurface,
    ContentItemOut,
    ContentItemPublishReadinessOut,
    ContentItemWorkflowNoteOut,
    ContentOpenIntentOut,
    ContentPresentationKind,
    ContentPresentationOut,
    ContentRecoveryActionOut,
    ContentShapeState,
    ContentVersionOut,
)
from src.modules.projects.content.contracts.schema import (
    ContentItemStatus as ContentItemStatusLiteral,
)
from src.modules.projects.content.contracts.schema import (
    ContentItemVisibility as ContentItemVisibilityLiteral,
)
from src.modules.projects.content.contracts.schema import (
    ContentVersionState as ContentVersionStateLiteral,
)
from src.modules.projects.content.items.input_schema import (
    ContentPresentationIn,
    ContentVersionPatchIn,
)
from src.modules.projects.content.items.password_fields import (
    password_field_keys,
    sanitize_password_field_values,
    sanitize_password_presentations,
)
from src.modules.projects.content.items.workflow_policy import resolve_workflow_policy
from src.modules.projects.content.models.protocol_registry import get_official_model_protocol

PresentationPayload = list[tuple[ContentPresentationKind, dict[str, Any] | None]]
SEO_PRESENTATION_KIND: ContentPresentationKind = "seo"
SLOT_MAPPING_PRESENTATION_KIND: ContentPresentationKind = "slot_mapping"
DEFAULT_FORMLESS_SLUG = "draft"
DEFAULT_DUPLICATE_TITLE = "Copy"
MAX_SLUG_LENGTH = 256
SLUG_SUFFIX_LENGTH = 8
WORKFLOW_PUBLISH_BLOCKER_CODE = "WORKFLOW_STAGE_NOT_APPROVED"
WORKBENCH_ROLE_PRESET_MAP = {
    "page": "page",
    "post": "article",
    "reusable-block": "reusable-section",
    "taxonomy-item": "taxonomy",
}

VERSION_TRANSITIONS: dict[ContentVersionState, tuple[ContentVersionState, ...]] = {
    ContentVersionState.PUBLISHED: (ContentVersionState.DRAFT, ContentVersionState.SCHEDULED),
    ContentVersionState.SCHEDULED: (ContentVersionState.DRAFT,),
    ContentVersionState.ARCHIVED: (
        ContentVersionState.DRAFT,
        ContentVersionState.SCHEDULED,
        ContentVersionState.PUBLISHED,
    ),
}


def normalize_text(value: str, *, field: str) -> str:
    out = value.strip()
    if out:
        return out
    raise Conflict(f"Invalid content item {field}", error="CONTENT_ITEM_CONTRACT_INVALID")


def normalize_initial_status(status: ContentItemStatus) -> str:
    if status != ContentItemStatus.DRAFT:
        raise Conflict("Invalid initial item status", error="CONTENT_ITEM_STATUS_INVALID")
    return str(ContentItemStatus.DRAFT)


def normalize_visibility(visibility: ContentItemVisibility) -> str:
    return str(visibility)


def build_formless_draft_slug(title: str) -> str:
    base = slugify(title) or DEFAULT_FORMLESS_SLUG
    suffix = uuid4().hex[:SLUG_SUFFIX_LENGTH]
    trimmed = base[: max(1, MAX_SLUG_LENGTH - len(suffix) - 1)]
    return f"{trimmed}-{suffix}"


def build_duplicate_item_title(value: str | None) -> str:
    base = (value or "").strip() or DEFAULT_DUPLICATE_TITLE
    suffix = " Copy"
    if len(base) + len(suffix) <= MAX_SLUG_LENGTH:
        return f"{base}{suffix}"
    return f"{base[: max(1, MAX_SLUG_LENGTH - len(suffix))].rstrip()}{suffix}"


def normalize_capability_pack_ids(values: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        out.append(normalized)
    return out


def normalize_bootstrap_shape(
    *,
    preset_key: str | None,
    preset_state: str,
    capability_pack_ids: list[str],
) -> tuple[str | None, str, list[str]]:
    normalized_preset = preset_key.strip() if isinstance(preset_key, str) else None
    normalized_preset = normalized_preset or None
    normalized_packs = normalize_capability_pack_ids(capability_pack_ids)
    if preset_state != "none" and normalized_preset is None:
        raise Conflict("Preset state requires a preset selection", error="CONTENT_BOOTSTRAP_PRESET_INVALID")
    if preset_state == "none":
        normalized_preset = None
    return normalized_preset, preset_state, normalized_packs


def _item_capabilities(item: ContentItemRecord) -> set[str]:
    item_capabilities = {
        str(value).strip() for value in item.capability_pack_ids or [] if isinstance(value, str) and value.strip()
    }
    model_capabilities = {
        str(value).strip()
        for value in (
            item.model_definition.capabilities
            if item.model_definition is not None and isinstance(item.model_definition.capabilities, list)
            else []
        )
        if isinstance(value, str) and value.strip()
    }
    return item_capabilities | model_capabilities


def item_has_capability(item: ContentItemRecord, capability: str) -> bool:
    return capability.strip() in _item_capabilities(item)


def read_summary_field(fields_snapshot: dict[str, Any] | None) -> str | None:
    if not isinstance(fields_snapshot, dict):
        return None

    value = fields_snapshot.get("summary")
    if not isinstance(value, str):
        return None

    normalized = value.strip()
    return normalized or None


def read_title_field(fields_snapshot: dict[str, Any] | None) -> str | None:
    if not isinstance(fields_snapshot, dict):
        return None

    value = fields_snapshot.get("title")
    if not isinstance(value, str):
        return None

    normalized = value.strip()
    return normalized or None


def read_slug_field(fields_snapshot: dict[str, Any] | None) -> str | None:
    if not isinstance(fields_snapshot, dict):
        return None

    value = fields_snapshot.get("slug")
    if not isinstance(value, str):
        return None

    normalized = value.strip()
    return normalized or None


def read_visibility_field(fields_snapshot: dict[str, Any] | None) -> str | None:
    if not isinstance(fields_snapshot, dict):
        return None

    value = fields_snapshot.get("visibility")
    if value == "private":
        return "private"
    if value == "public":
        return "public"
    return None


def _model_capabilities(model: ContentModelDefinitionRecord | None) -> set[str]:
    if model is None or not isinstance(model.capabilities, list):
        return set()
    return {str(value).strip() for value in model.capabilities if isinstance(value, str)}


def _normalized_model_tokens(model: ContentModelDefinitionRecord | None) -> list[str]:
    if model is None:
        return []
    return [
        token
        for token in [str(model.singular_key or "").strip().lower(), str(model.name or "").strip().lower()]
        if token
    ]


def _model_matches_any_token(model: ContentModelDefinitionRecord | None, candidates: list[str]) -> bool:
    tokens = _normalized_model_tokens(model)
    return any(candidate in token for token in tokens for candidate in candidates)


def _is_site_content_model(model: ContentModelDefinitionRecord | None) -> bool:
    if model is None:
        return False
    capabilities = _model_capabilities(model)
    if str(model.category) == "site_builder":
        return True
    if str(model.default_editor or "") == "visual":
        return True
    return any(capability in capabilities for capability in {"visual_editable", "routable", "has_slots"})


def _is_structured_model(model: ContentModelDefinitionRecord | None) -> bool:
    if model is None:
        return False
    capabilities = _model_capabilities(model)
    if str(model.default_editor or "") in {"form", "table"}:
        return True
    return any(capability in capabilities for capability in {"queryable", "has_relations"})


def derive_item_workbench_status(item: ContentItemRecord) -> str:
    if item.status == ContentItemStatus.ARCHIVED:
        return "archived"
    if item.published_version is not None and item.draft_version > item.published_version:
        return "changed"
    if item.status == ContentItemStatus.PUBLISHED:
        return "published"
    return "draft"


def derive_item_workbench_runtime(
    item: ContentItemRecord,
    model: ContentModelDefinitionRecord | None,
) -> str:
    surface = str(item.resolved_surface) if item.resolved_surface is not None else None
    if surface == "canvas":
        return "visual"
    if surface == "writing":
        return "text"
    if surface == "structured":
        return "data"

    capabilities = _model_capabilities(model)
    default_editor = str(model.default_editor or "") if model is not None else ""
    if default_editor == "visual":
        return "visual"
    if default_editor == "rich_text":
        return "text"
    if default_editor in {"form", "table"}:
        return "data"
    if "visual_editable" in capabilities:
        return "visual"
    if "rich_text_editable" in capabilities:
        return "text"
    if "queryable" in capabilities or "has_relations" in capabilities:
        return "data"
    return "unknown"


def derive_item_workbench_context(model: ContentModelDefinitionRecord | None) -> str:
    if model is None:
        return "standalone"
    return str(model.category)


def derive_item_workbench_library_group(
    item: ContentItemRecord,
    model: ContentModelDefinitionRecord | None,
) -> str:
    role = str(item.resolved_role) if item.resolved_role is not None else None
    surface = str(item.resolved_surface) if item.resolved_surface is not None else None
    if role in {"page", "reusable-section"}:
        return "site-content"
    if role in {"taxonomy", "person", "settings", "data"}:
        return "structured-content"
    if surface == "canvas":
        return "site-content"
    if surface == "structured":
        return "structured-content"
    if model is not None and str(model.category) == "site_builder":
        return "site-content"
    if model is not None and str(model.default_editor or "") in {"form", "table"}:
        return "structured-content"
    return "general-content"


def derive_item_workbench_edit_with(
    item: ContentItemRecord,
    model: ContentModelDefinitionRecord | None,
) -> str:
    if item.resolved_surface is not None:
        return str(item.resolved_surface)

    capabilities = _model_capabilities(model)
    default_editor = str(model.default_editor or "") if model is not None else ""
    if default_editor == "visual" or "visual_editable" in capabilities:
        return "canvas"
    if default_editor == "rich_text" or "rich_text_editable" in capabilities:
        return "writing"
    return "structured"


def derive_item_workbench_role(
    item: ContentItemRecord,
    model: ContentModelDefinitionRecord | None,
) -> str:
    if item.resolved_role is not None:
        return str(item.resolved_role)

    preset_role = WORKBENCH_ROLE_PRESET_MAP.get(str(item.bootstrap_preset_key or "").strip())
    if preset_role is not None:
        return preset_role

    if _model_matches_any_token(model, ["section", "block", "component", "reusable"]):
        return "reusable-section"
    if _model_matches_any_token(model, ["taxonomy", "tag", "category", "topic"]):
        return "taxonomy"
    if _model_matches_any_token(model, ["person", "people", "author", "profile", "member", "team"]):
        return "person"
    if _model_matches_any_token(model, ["setting", "settings", "config", "configuration", "preference"]):
        return "settings"
    if _model_matches_any_token(model, ["article", "post", "story", "blog", "news"]):
        return "article"
    capability_pack_ids = {str(value).strip() for value in item.capability_pack_ids or [] if isinstance(value, str)}
    if (
        _model_matches_any_token(model, ["page", "landing", "screen"])
        or (model is not None and str(model.category) == "site_builder")
        or "layout_bound" in capability_pack_ids
    ):
        return "page"
    if _is_structured_model(model):
        return "data"
    if derive_item_workbench_runtime(item, model) == "text":
        return "article"
    return "general"


def to_item_out(
    item: ContentItemRecord,
    model: ContentModelDefinitionRecord | None,
    *,
    title: str | None = None,
    slug: str | None = None,
    summary: str | None = None,
    visibility: str | None = None,
) -> ContentItemOut:
    route = f"/w/{encode_uuid(item.workspace_id)}/content/library/{encode_uuid(item.id)}"
    shape_reason_code = item.shape_reason_code or None
    shape_reason_meta = item.shape_reason_meta if isinstance(item.shape_reason_meta, dict) else None
    blocked = str(item.shape_state or "unshaped") != "ready"
    workflow_stage = getattr(item, "workflow_stage", None)
    workflow_assignee_user_id = getattr(item, "workflow_assignee_user_id", None)
    workflow_summary = getattr(item, "workflow_summary", None)
    open_intent = ContentOpenIntentOut(
        surface=cast(
            ContentContinuationSurface | None,
            str(item.resolved_surface) if item.resolved_surface is not None else None,
        ),
        route=route,
        blocked=blocked,
        reason_code=(shape_reason_code or CONTINUATION_TRUTH_MISSING_REASON_CODE) if blocked else None,
        reason_meta=shape_reason_meta if blocked else None,
        recovery_actions=(
            [
                ContentRecoveryActionOut(
                    kind="open-recovery",
                    label="Open recovery surface",
                    route=route,
                )
            ]
            if blocked
            else []
        ),
    )
    workflow_notes_value = getattr(item, "workflow_notes", None)
    workflow_notes_payload = workflow_notes_value if isinstance(workflow_notes_value, list) else []
    workflow_notes = [
        ContentItemWorkflowNoteOut(
            body=str(note.get("body", "")).strip(),
            created_at=note.get("createdAt") or item.updated_at,
            actor_user_id=note.get("actorUserId"),
        )
        for note in workflow_notes_payload
        if isinstance(note, dict) and str(note.get("body", "")).strip()
    ]
    readiness_blocker_codes = derive_item_publish_blocker_codes(item)
    return ContentItemOut(
        id=item.id,
        workspace_id=item.workspace_id,
        site_id=item.site_id,
        model_id=model.id if model is not None else None,
        model_key=model.singular_key if model is not None else None,
        slug=slug or item.slug,
        title=title or item.title,
        summary=summary,
        status=cast(ContentItemStatusLiteral, str(item.status)),
        visibility=cast(ContentItemVisibilityLiteral, visibility or str(item.visibility)),
        locale=item.locale,
        bootstrap_preset_key=item.bootstrap_preset_key,
        bootstrap_preset_state=cast(ContentBootstrapPresetState, str(item.bootstrap_preset_state)),
        capability_pack_ids=normalize_capability_pack_ids(item.capability_pack_ids or []),
        resolved_role=cast(
            ContentContinuationRole | None,
            str(item.resolved_role) if item.resolved_role is not None else None,
        ),
        resolved_posture=cast(
            ContentContinuationPosture | None,
            str(item.resolved_posture) if item.resolved_posture is not None else None,
        ),
        resolved_surface=cast(
            ContentContinuationSurface | None,
            str(item.resolved_surface) if item.resolved_surface is not None else None,
        ),
        derived_status=cast(Any, derive_item_workbench_status(item)),
        runtime=cast(Any, derive_item_workbench_runtime(item, model)),
        context=cast(Any, derive_item_workbench_context(model)),
        library_group=cast(Any, derive_item_workbench_library_group(item, model)),
        edit_with=cast(Any, derive_item_workbench_edit_with(item, model)),
        role=cast(Any, derive_item_workbench_role(item, model)),
        shape_state=cast(ContentShapeState, str(item.shape_state or "unshaped")),
        shape_reason_code=shape_reason_code,
        shape_reason_meta=shape_reason_meta,
        workflow_stage=cast(Any, str(workflow_stage or ContentWorkflowStage.DRAFTING)),
        workflow_assignee_user_id=workflow_assignee_user_id,
        workflow_summary=workflow_summary,
        workflow_notes=workflow_notes,
        publish_readiness=ContentItemPublishReadinessOut(
            ready=not readiness_blocker_codes,
            blocker_codes=readiness_blocker_codes,
        ),
        created_by_user_id=item.created_by_user_id,
        updated_by_user_id=item.updated_by_user_id,
        open_intent=open_intent,
        continuation_target=open_intent,
        draft_version=item.draft_version,
        published_version=item.published_version,
        updated_at=item.updated_at,
    )


def normalize_presentations(payloads: list[ContentPresentationIn]) -> PresentationPayload:
    normalized: PresentationPayload = []
    seen_kinds: set[ContentPresentationKind] = set()
    for payload in payloads:
        if payload.kind in seen_kinds:
            raise Conflict(
                "Duplicate presentation kind",
                error="CONTENT_PRESENTATION_DUPLICATE_KIND",
                meta={"kind": str(payload.kind)},
            )
        seen_kinds.add(payload.kind)
        normalized.append((payload.kind, payload.payload))
    return normalized


def extract_seo_payload(payloads: PresentationPayload) -> dict[str, Any] | None:
    for kind, payload in payloads:
        if kind == SEO_PRESENTATION_KIND and isinstance(payload, dict):
            return payload
    return None


def extract_component_bindings(payloads: PresentationPayload) -> list[dict[str, Any]]:
    for kind, payload in payloads:
        if kind != SLOT_MAPPING_PRESENTATION_KIND or not isinstance(payload, dict):
            continue
        bindings = payload.get("bindings")
        if not isinstance(bindings, list):
            return []
        out: list[dict[str, Any]] = []
        for item in bindings:
            if not isinstance(item, dict):
                continue
            component_key = item.get("componentKey")
            binding_key = item.get("bindingKey")
            if not isinstance(component_key, str) or not component_key.strip():
                continue
            if not isinstance(binding_key, str) or not binding_key.strip():
                continue
            out.append({
                "component_key": component_key.strip(),
                "binding_key": binding_key.strip(),
                "binding_payload": item.get("payload"),
            })
        return out
    return []


def validate_version_publish_contract(
    *,
    model: ContentModelDefinitionRecord | None,
    version: ContentVersionRecord,
    presentations: PresentationPayload,
) -> list[dict[str, Any]]:
    if model is None:
        return []

    protocol = get_official_model_protocol(str(model.protocol_key or model.singular_key))
    if protocol is None:
        return []

    reasons: list[dict[str, Any]] = []
    fields_snapshot = version.fields_snapshot if isinstance(version.fields_snapshot, dict) else {}
    seen_reasons: set[tuple[str, str]] = set()

    for field in protocol.system_fields:
        if not field.required:
            continue
        value = fields_snapshot.get(field.key)
        if value is None:
            reason_key = ("REQUIRED_SYSTEM_FIELD_MISSING", field.key)
            if reason_key not in seen_reasons:
                seen_reasons.add(reason_key)
                reasons.append({"code": "REQUIRED_SYSTEM_FIELD_MISSING", "fieldKey": field.key})
            continue
        if isinstance(value, str) and not value.strip():
            reason_key = ("REQUIRED_SYSTEM_FIELD_MISSING", field.key)
            if reason_key not in seen_reasons:
                seen_reasons.add(reason_key)
                reasons.append({"code": "REQUIRED_SYSTEM_FIELD_MISSING", "fieldKey": field.key})

    allowed_kinds = {
        str(kind).strip()
        for kind in (
            (protocol.presentation_policy or {}).get("allowedKinds", []) if protocol.presentation_policy else []
        )
        if isinstance(kind, str) and kind.strip()
    }
    if allowed_kinds:
        for kind, _payload in presentations:
            normalized_kind = str(kind).strip()
            if normalized_kind in allowed_kinds:
                continue
            reason_key = ("PRESENTATION_KIND_NOT_ALLOWED", normalized_kind)
            if reason_key in seen_reasons:
                continue
            seen_reasons.add(reason_key)
            reasons.append({"code": "PRESENTATION_KIND_NOT_ALLOWED", "kind": normalized_kind})

    if protocol.key == "page":
        path_value = fields_snapshot.get("path")
        if isinstance(path_value, str):
            normalized_path = path_value.strip()
            if normalized_path and not normalized_path.startswith("/"):
                reasons.append({"code": "ROUTE_FIELD_INVALID", "fieldKey": "path"})

    return reasons


def to_version_out(version: ContentVersionRecord, payloads: PresentationPayload) -> ContentVersionOut:
    password_keys = password_field_keys(getattr(getattr(version, "item", None), "model_definition", None))
    sanitized_presentations = sanitize_password_presentations(payloads, password_keys=password_keys)
    return ContentVersionOut(
        item_id=version.item_id,
        version_number=version.version,
        state=cast(ContentVersionStateLiteral, str(version.state)),
        created_at=version.created_at,
        created_by_user_id=version.created_by_user_id,
        last_transition_by_user_id=version.last_transition_by_user_id,
        fields_snapshot=sanitize_password_field_values(version.fields_snapshot, password_keys=password_keys),
        presentations=[ContentPresentationOut(kind=kind, payload=payload) for kind, payload in sanitized_presentations],
        change_summary=version.change_summary,
    )


def status_by_published_version(*, published_version: int | None, fallback: ContentItemStatus) -> str:
    if published_version is not None:
        return str(ContentItemStatus.PUBLISHED)
    return str(fallback)


def derive_item_publish_blocker_codes(item: ContentItemRecord, *, publish_stage: str | None = None) -> list[str]:
    blockers: list[str] = []
    shape_state = getattr(item, "shape_state", None)
    if str(shape_state or "unshaped") != "ready":
        blockers.append(str(getattr(item, "shape_reason_code", None) or CONTINUATION_TRUTH_MISSING_REASON_CODE))
    workflow_stage = getattr(item, "workflow_stage", None)
    resolved_publish_stage = (
        publish_stage or resolve_workflow_policy(getattr(item, "model_definition", None)).publish_stage
    )
    if str(workflow_stage or ContentWorkflowStage.DRAFTING) != resolved_publish_stage:
        blockers.append(WORKFLOW_PUBLISH_BLOCKER_CODE)
    return blockers


def build_workflow_patch_fields(
    *,
    current_item: ContentItemRecord,
    stage: str | None,
    assignee_user_id: str | None,
    summary: str | None,
    note_body: str | None,
    actor_user_id: UUID | None,
) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    if stage is not None:
        fields["workflow_stage"] = stage
    if assignee_user_id is not None:
        fields["workflow_assignee_user_id"] = decode_public_id(assignee_user_id)
    if summary is not None:
        fields["workflow_summary"] = summary.strip() or None
    if note_body is not None:
        workflow_notes_value = getattr(current_item, "workflow_notes", None)
        existing_notes = workflow_notes_value if isinstance(workflow_notes_value, list) else []
        fields["workflow_notes"] = [
            *existing_notes,
            {
                "body": note_body.strip(),
                "createdAt": datetime.now(tz=UTC),
                "actorUserId": str(actor_user_id) if actor_user_id is not None else None,
            },
        ]
    if fields:
        fields["updated_by_user_id"] = actor_user_id
    return fields


def item_fields_for_transition(
    *,
    item: ContentItemRecord,
    version: ContentVersionRecord,
    target_state: ContentVersionState,
    actor_user_id: UUID | None,
) -> dict[str, Any]:
    fields: dict[str, Any] = {"updated_by_user_id": actor_user_id}
    next_published_version = item.published_version
    if target_state == ContentVersionState.PUBLISHED:
        next_published_version = version.version
    elif target_state == ContentVersionState.ARCHIVED and item.published_version == version.version:
        next_published_version = None

    fallback = ContentItemStatus.ARCHIVED if target_state == ContentVersionState.ARCHIVED else ContentItemStatus.DRAFT
    fields["published_version"] = next_published_version
    fields["status"] = status_by_published_version(
        published_version=next_published_version,
        fallback=fallback,
    )
    return fields


def ensure_expected_version(*, expected_version: int | None, current_version: int) -> None:
    if expected_version is not None and expected_version != current_version:
        raise Conflict("Draft version conflict", error="CONTENT_ITEM_DRAFT_VERSION_CONFLICT")


def build_patch_version_fields(
    *,
    payload: ContentVersionPatchIn,
    actor_user_id: UUID | None,
) -> dict[str, Any]:
    fields_to_update: dict[str, Any] = {}
    fields_set = payload.model_fields_set
    if "change_summary" in fields_set:
        fields_to_update["change_summary"] = payload.change_summary
    if "fields_snapshot" in fields_set:
        fields_to_update["fields_snapshot"] = payload.fields_snapshot or {}
    if fields_to_update:
        fields_to_update["last_transition_by_user_id"] = actor_user_id
    return fields_to_update


def build_patch_item_fields(
    *,
    payload: ContentVersionPatchIn,
    actor_user_id: UUID | None,
    has_version_changes: bool,
    has_presentation_changes: bool,
) -> dict[str, Any]:
    item_fields_to_update: dict[str, Any] = {}
    if has_version_changes or has_presentation_changes:
        item_fields_to_update["updated_by_user_id"] = actor_user_id
    return item_fields_to_update
