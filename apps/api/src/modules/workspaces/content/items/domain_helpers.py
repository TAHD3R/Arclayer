from __future__ import annotations

from typing import Any
from uuid import UUID

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


def to_item_out(item: ContentItemRecord, model: ContentModelDefinitionRecord) -> ContentItemOut:
    return ContentItemOut(
        id=item.id,
        workspace_id=item.workspace_id,
        site_id=item.site_id,
        model_id=model.id,
        model_key=model.key,
        slug=item.slug,
        title=item.title,
        status=str(item.status),
        visibility=str(item.visibility),
        locale=item.locale,
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
        fields["field_values"] = version.fields_snapshot or {}
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
    if "fields_snapshot" in payload.model_fields_set:
        item_fields_to_update["field_values"] = payload.fields_snapshot or {}
    return item_fields_to_update
