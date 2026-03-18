from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from apps.api.src.common.text.slug.service import slugify
from apps.api.src.core.exceptions import Conflict
from apps.api.src.models.content._enums import ContentItemStatus, ContentItemVisibility, ContentVersionState
from apps.api.src.models.content.content_item import ContentItemRecord
from apps.api.src.models.content.content_version import ContentVersionRecord
from apps.api.src.models.content.model_definition import ContentModelDefinitionRecord
from apps.api.src.modules.workspaces.content.contracts.schema import (
    ContentItemOut,
    ContentPresentationKind,
    ContentPresentationOut,
    ContentVersionOut,
)
from apps.api.src.modules.workspaces.content.items.input_schema import (
    ContentPresentationIn,
    ContentVersionPatchIn,
)

PresentationPayload = list[tuple[ContentPresentationKind, dict[str, Any] | None]]
SEO_PRESENTATION_KIND: ContentPresentationKind = "seo"
SLOT_MAPPING_PRESENTATION_KIND: ContentPresentationKind = "slot_mapping"
DEFAULT_FORMLESS_SLUG = "draft"
MAX_SLUG_LENGTH = 256
SLUG_SUFFIX_LENGTH = 8

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


def item_has_capability(item: ContentItemRecord, capability: str) -> bool:
    raw = item.capability_pack_ids if isinstance(item.capability_pack_ids, list) else []
    return capability in {str(value).strip() for value in raw if isinstance(value, str)}


def to_item_out(item: ContentItemRecord, model: ContentModelDefinitionRecord | None) -> ContentItemOut:
    return ContentItemOut(
        id=item.id,
        workspace_id=item.workspace_id,
        site_id=item.site_id,
        model_id=model.id if model is not None else None,
        model_key=model.key if model is not None else None,
        slug=item.slug,
        title=item.title,
        status=str(item.status),
        visibility=str(item.visibility),
        locale=item.locale,
        bootstrap_preset_key=item.bootstrap_preset_key,
        bootstrap_preset_state=str(item.bootstrap_preset_state),
        capability_pack_ids=normalize_capability_pack_ids(item.capability_pack_ids or []),
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


def to_version_out(version: ContentVersionRecord, payloads: PresentationPayload) -> ContentVersionOut:
    return ContentVersionOut(
        item_id=version.item_id,
        version_number=version.version,
        state=str(version.state),
        created_at=version.created_at,
        created_by_user_id=version.created_by_user_id,
        last_transition_by_user_id=version.last_transition_by_user_id,
        fields_snapshot=version.fields_snapshot or {},
        presentations=[ContentPresentationOut(kind=kind, payload=payload) for kind, payload in payloads],
        change_summary=version.change_summary,
    )


def status_by_published_version(*, published_version: int | None, fallback: ContentItemStatus) -> str:
    if published_version is not None:
        return str(ContentItemStatus.PUBLISHED)
    return str(fallback)


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
