from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Any, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject, JsonValue
from src.core.exceptions import Conflict, NotFound
from src.models.content.component_binding import ComponentBindingRecord
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_item_deletion import ContentItemDeletionRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.hierarchy_node import HierarchyNodeRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.content.route_binding import RouteBindingRecord
from src.models.content.seo_profile import SEOProfileRecord

RETENTION_SNAPSHOT_VERSION = 1


async def retain_content_item_aggregate(
    *,
    item: ContentItemRecord,
    actor_user_id: UUID | None,
    conn: BaseDBAsyncClient,
) -> ContentItemDeletionRecord:
    previous = await (
        ContentItemDeletionRecord
        .filter(
            workspace_id=item.workspace_id,
            site_id=item.site_id,
            environment_id=item.environment_id,
            item_id=item.id,
        )
        .using_db(conn)
        .order_by("-deletion_sequence")
        .first()
    )
    snapshot = await _build_snapshot(item=item, conn=conn)
    return await ContentItemDeletionRecord.create(
        using_db=conn,
        workspace_id=item.workspace_id,
        site_id=item.site_id,
        environment_id=item.environment_id,
        item_id=item.id,
        deletion_sequence=(int(previous.deletion_sequence) + 1 if previous else 1),
        snapshot=snapshot,
        deleted_by_user_id=actor_user_id,
        deleted_at=datetime.now(UTC),
    )


async def get_retained_content_item_ids(
    *,
    workspace_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    item_ids: set[UUID],
    conn: BaseDBAsyncClient,
) -> frozenset[UUID]:
    if not item_ids:
        return frozenset()
    records = await (
        ContentItemDeletionRecord
        .filter(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id__in=item_ids,
            restored_at=None,
        )
        .using_db(conn)
        .order_by("item_id", "-deletion_sequence")
    )
    return frozenset(UUID(str(record.item_id)) for record in records)


async def get_retained_content_version_ids(
    *,
    workspace_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    item_ids: set[UUID],
    conn: BaseDBAsyncClient,
) -> frozenset[UUID]:
    if not item_ids:
        return frozenset()
    records = await (
        ContentItemDeletionRecord
        .filter(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id__in=item_ids,
            restored_at=None,
        )
        .using_db(conn)
        .order_by("item_id", "-deletion_sequence")
    )
    version_ids: set[UUID] = set()
    seen_items: set[UUID] = set()
    for record in records:
        item_id = UUID(str(record.item_id))
        if item_id in seen_items:
            continue
        seen_items.add(item_id)
        for version in cast(list[JsonObject], record.snapshot.get("versions", [])):
            version_ids.add(UUID(str(version["id"])))
    return frozenset(version_ids)


async def get_retained_content_model_definition_ids(
    *,
    workspace_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    item_ids: set[UUID],
    conn: BaseDBAsyncClient,
) -> dict[UUID, UUID | None]:
    if not item_ids:
        return {}
    records = await (
        ContentItemDeletionRecord
        .filter(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id__in=item_ids,
            restored_at=None,
        )
        .using_db(conn)
        .order_by("item_id", "-deletion_sequence")
    )
    model_ids: dict[UUID, UUID | None] = {}
    for record in records:
        retained_item_id = UUID(str(record.item_id))
        if retained_item_id in model_ids:
            continue
        raw_item = cast(JsonObject, record.snapshot.get("item", {}))
        raw_model_id = raw_item.get("model_definition_id")
        model_ids[retained_item_id] = UUID(str(raw_model_id)) if raw_model_id else None
    return model_ids


async def restore_retained_content_item(
    *,
    workspace_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    item_id: UUID,
    actor_user_id: UUID,
    conn: BaseDBAsyncClient,
) -> ContentItemRecord:
    record = await (
        ContentItemDeletionRecord
        .filter(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
            restored_at=None,
        )
        .using_db(conn)
        .select_for_update()
        .order_by("-deletion_sequence")
        .first()
    )
    if record is None:
        raise NotFound("Retained content item not found", error="CONTENT_ITEM_RETENTION_NOT_FOUND")
    existing = await (
        ContentItemRecord
        .filter(
            id=item_id,
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
        )
        .using_db(conn)
        .select_for_update()
        .first()
    )
    if existing is not None:
        raise Conflict(
            "A retained content item conflicts with an existing item",
            error="CONTENT_ITEM_RETENTION_RESTORE_CONFLICT",
            meta={"itemId": str(item_id), "deletionSequence": int(record.deletion_sequence)},
        )
    snapshot = cast(JsonObject, record.snapshot)
    if snapshot.get("snapshotVersion") != RETENTION_SNAPSHOT_VERSION:
        raise Conflict("Unsupported content retention snapshot", error="CONTENT_ITEM_RETENTION_VERSION_UNSUPPORTED")
    item = await _restore_item(snapshot=cast(JsonObject, snapshot["item"]), conn=conn)
    await _restore_versions(snapshot=snapshot, item_id=item.id, conn=conn)
    await _restore_routes_and_hierarchy(snapshot=snapshot, item_id=item.id, conn=conn)
    record.restored_at = datetime.now(UTC)
    record.restored_by_user_id = actor_user_id
    await record.save(using_db=conn, update_fields=["restored_at", "restored_by_user_id", "updated_at"])
    return item


async def _build_snapshot(*, item: ContentItemRecord, conn: BaseDBAsyncClient) -> JsonObject:
    versions = list(await ContentVersionRecord.filter(item_id=item.id).using_db(conn).order_by("version"))
    version_ids = [version.id for version in versions]
    presentations = list(
        await PresentationDocumentRecord
        .filter(version_id__in=version_ids)
        .using_db(conn)
        .order_by("version_id", "kind")
    )
    bindings = list(
        await ComponentBindingRecord
        .filter(version_id__in=version_ids)
        .using_db(conn)
        .order_by("version_id", "sort_order", "component_key", "binding_key")
    )
    seo_profiles = list(await SEOProfileRecord.filter(version_id__in=version_ids).using_db(conn).order_by("version_id"))
    routes = list(await RouteBindingRecord.filter(item_id=item.id).using_db(conn).order_by("locale", "path"))
    hierarchy = await HierarchyNodeRecord.filter(item_id=item.id).using_db(conn).first()
    return cast(
        JsonObject,
        _json({
            "snapshotVersion": RETENTION_SNAPSHOT_VERSION,
            "item": _item_snapshot(item),
            "versions": [_version_snapshot(version) for version in versions],
            "presentations": [_presentation_snapshot(record) for record in presentations],
            "componentBindings": [_binding_snapshot(record) for record in bindings],
            "seoProfiles": [_seo_snapshot(record) for record in seo_profiles],
            "routes": [_route_snapshot(record) for record in routes],
            "hierarchy": _hierarchy_snapshot(hierarchy) if hierarchy else None,
        }),
    )


def _item_snapshot(item: ContentItemRecord) -> dict[str, Any]:
    fields = (
        "id",
        "workspace_id",
        "site_id",
        "environment_id",
        "model_definition_id",
        "translation_group_id",
        "slug",
        "title",
        "status",
        "visibility",
        "locale",
        "bootstrap_preset_key",
        "bootstrap_preset_state",
        "capability_pack_ids",
        "resolved_role",
        "resolved_posture",
        "resolved_surface",
        "shape_state",
        "shape_reason_code",
        "shape_reason_meta",
        "workflow_stage",
        "workflow_assignee_user_id",
        "workflow_summary",
        "workflow_notes",
        "draft_version",
        "published_version",
        "created_by_user_id",
        "updated_by_user_id",
        "created_at",
        "updated_at",
    )
    return {field: getattr(item, field) for field in fields}


def _version_snapshot(record: ContentVersionRecord) -> dict[str, Any]:
    return _record_snapshot(
        record,
        (
            "id",
            "version",
            "state",
            "fields_snapshot",
            "change_summary",
            "created_by_user_id",
            "last_transition_by_user_id",
            "created_at",
            "updated_at",
        ),
    )


def _presentation_snapshot(record: PresentationDocumentRecord) -> dict[str, Any]:
    return _record_snapshot(record, ("id", "version_id", "kind", "payload", "created_at", "updated_at"))


def _binding_snapshot(record: ComponentBindingRecord) -> dict[str, Any]:
    return _record_snapshot(
        record,
        (
            "id",
            "version_id",
            "component_key",
            "binding_key",
            "binding_payload",
            "sort_order",
            "created_at",
            "updated_at",
        ),
    )


def _seo_snapshot(record: SEOProfileRecord) -> dict[str, Any]:
    return _record_snapshot(
        record,
        (
            "id",
            "version_id",
            "meta_title",
            "meta_description",
            "canonical_url",
            "robots_directive",
            "payload",
            "created_at",
            "updated_at",
        ),
    )


def _route_snapshot(record: RouteBindingRecord) -> dict[str, Any]:
    return _record_snapshot(
        record,
        (
            "id",
            "workspace_id",
            "site_id",
            "environment_id",
            "item_id",
            "locale",
            "path",
            "route_contract",
            "is_active",
            "created_at",
            "updated_at",
        ),
    )


def _hierarchy_snapshot(record: HierarchyNodeRecord) -> dict[str, Any]:
    return _record_snapshot(
        record, ("id", "workspace_id", "site_id", "item_id", "parent_item_id", "sort_order", "created_at", "updated_at")
    )


def _record_snapshot(record: Any, fields: tuple[str, ...]) -> dict[str, Any]:
    return {field: getattr(record, field) for field in fields}


async def _restore_item(*, snapshot: JsonObject, conn: BaseDBAsyncClient) -> ContentItemRecord:
    values = _restore_values(
        snapshot,
        uuid_fields={
            "id",
            "workspace_id",
            "site_id",
            "environment_id",
            "model_definition_id",
            "translation_group_id",
            "workflow_assignee_user_id",
            "created_by_user_id",
            "updated_by_user_id",
        },
        datetime_fields={"created_at", "updated_at"},
    )
    return await ContentItemRecord.create(using_db=conn, **values)


async def _restore_versions(*, snapshot: JsonObject, item_id: UUID, conn: BaseDBAsyncClient) -> None:
    for raw in cast(list[JsonObject], snapshot.get("versions", [])):
        values = _restore_values(
            raw,
            uuid_fields={"id", "created_by_user_id", "last_transition_by_user_id"},
            datetime_fields={"created_at", "updated_at"},
        )
        values["item_id"] = item_id
        await ContentVersionRecord.create(using_db=conn, **values)
    for key, model, uuid_fields in (
        ("presentations", PresentationDocumentRecord, {"id", "version_id"}),
        ("componentBindings", ComponentBindingRecord, {"id", "version_id"}),
        ("seoProfiles", SEOProfileRecord, {"id", "version_id"}),
    ):
        for raw in cast(list[JsonObject], snapshot.get(key, [])):
            values = _restore_values(raw, uuid_fields=uuid_fields, datetime_fields={"created_at", "updated_at"})
            await model.create(using_db=conn, **values)


async def _restore_routes_and_hierarchy(*, snapshot: JsonObject, item_id: UUID, conn: BaseDBAsyncClient) -> None:
    for raw in cast(list[JsonObject], snapshot.get("routes", [])):
        values = _restore_values(
            raw,
            uuid_fields={"id", "workspace_id", "site_id", "environment_id", "item_id"},
            datetime_fields={"created_at", "updated_at"},
        )
        values["item_id"] = item_id
        await RouteBindingRecord.create(using_db=conn, **values)
    raw_hierarchy = snapshot.get("hierarchy")
    if not isinstance(raw_hierarchy, dict):
        return
    values = _restore_values(
        cast(JsonObject, raw_hierarchy),
        uuid_fields={"id", "workspace_id", "site_id", "item_id", "parent_item_id"},
        datetime_fields={"created_at", "updated_at"},
    )
    values["item_id"] = item_id
    parent_item_id = values.get("parent_item_id")
    if parent_item_id is not None and not await ContentItemRecord.filter(id=parent_item_id).using_db(conn).exists():
        raise Conflict("Retained hierarchy parent is unavailable", error="BUILDER_RESTORE_HIERARCHY_INVALID")
    await HierarchyNodeRecord.create(using_db=conn, **values)


def _restore_values(
    raw: JsonObject,
    *,
    uuid_fields: set[str],
    datetime_fields: set[str],
) -> dict[str, Any]:
    values: dict[str, Any] = {}
    for key, value in raw.items():
        if key in uuid_fields and value is not None:
            values[key] = UUID(str(value))
        elif key in datetime_fields and value is not None:
            values[key] = datetime.fromisoformat(str(value))
        else:
            values[key] = value
    return values


def _json(value: Any) -> JsonValue:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Enum):
        return str(value.value)
    if isinstance(value, dict):
        return {str(key): _json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json(item) for item in value]
    return cast(JsonValue, value)


__all__ = [
    "get_retained_content_item_ids",
    "get_retained_content_model_definition_ids",
    "get_retained_content_version_ids",
    "restore_retained_content_item",
    "retain_content_item_aggregate",
]
