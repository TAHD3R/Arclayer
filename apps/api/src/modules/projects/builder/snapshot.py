from __future__ import annotations

import hashlib
from collections import defaultdict
from collections.abc import Mapping, Sequence
from typing import TypedDict, cast
from uuid import UUID

import orjson

from src.common.types.json_types import JsonObject, JsonValue
from src.models.content.component_binding import ComponentBindingRecord
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.hierarchy_node import HierarchyNodeRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.content.route_binding import RouteBindingRecord
from src.modules.projects.builder.schema import (
    BuilderGlobalSectionNodeSnapshotV1,
    BuilderGlobalSectionVersionPinV1,
    BuilderPageNodeSnapshotV1,
    BuilderPagePlanningV1,
    BuilderPageVersionPinV1,
    BuilderRouteSnapshotV1,
    ContentStructureSnapshotV1,
)


class BuilderSnapshotError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class _VersionPinPayload(TypedDict):
    item_id: UUID
    content_version_id: UUID
    version_number: int
    presentation_set_hash: str
    component_binding_set_hash: str


def canonical_hash(value: JsonValue) -> str:
    payload = orjson.dumps(value, option=orjson.OPT_SORT_KEYS)
    return f"sha256:{hashlib.sha256(payload).hexdigest()}"


def build_structure_snapshot(
    *,
    workspace_id: UUID,
    project_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    default_locale: str,
    fallback_locale: str,
    routes: Sequence[RouteBindingRecord],
    hierarchy: Sequence[HierarchyNodeRecord],
    items: Sequence[ContentItemRecord],
    global_items: Sequence[ContentItemRecord] = (),
    base_structure: ContentStructureSnapshotV1 | None = None,
    planning_overrides: Mapping[UUID, BuilderPagePlanningV1] | None = None,
) -> ContentStructureSnapshotV1:
    routes_by_item: dict[UUID, list[BuilderRouteSnapshotV1]] = defaultdict(list)
    for route in routes:
        route_contract = route.route_contract if isinstance(route.route_contract, dict) else None
        routes_by_item[UUID(str(route.item_id))].append(
            BuilderRouteSnapshotV1(
                locale=str(route.locale),
                path=str(route.path),
                is_active=bool(route.is_active),
                route_contract=cast(JsonObject | None, route_contract),
            )
        )

    hierarchy_by_item = {UUID(str(node.item_id)): node for node in hierarchy}
    planning_by_item: dict[UUID, BuilderPagePlanningV1] = (
        {
            UUID(str(page.item_id)): BuilderPagePlanningV1(
                purpose=page.purpose,
                section_intents=page.section_intents,
            )
            for page in (*base_structure.pages, *base_structure.global_references)
        }
        if base_structure is not None
        else {}
    )
    planning_by_item.update(planning_overrides or {})
    pages = tuple(
        _build_page_snapshot(
            item=item,
            hierarchy_by_item=hierarchy_by_item,
            routes_by_item=routes_by_item,
            planning=planning_by_item.get(UUID(str(item.id))),
        )
        for item in sorted(items, key=lambda record: _page_sort_key(record, hierarchy_by_item))
    )
    global_references = tuple(
        _build_global_section_snapshot(
            item=item,
            planning=planning_by_item.get(UUID(str(item.id))),
        )
        for item in sorted(
            global_items,
            key=lambda record: (str(record.locale), str(record.slug), str(record.id)),
        )
    )
    locales = tuple(sorted({default_locale, fallback_locale, *(str(route.locale) for route in routes)}))
    return ContentStructureSnapshotV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        locales=locales,
        pages=pages,
        global_references=global_references,
    )


def _build_page_snapshot(
    *,
    item: ContentItemRecord,
    hierarchy_by_item: Mapping[UUID, HierarchyNodeRecord],
    routes_by_item: Mapping[UUID, list[BuilderRouteSnapshotV1]],
    planning: BuilderPagePlanningV1 | None,
) -> BuilderPageNodeSnapshotV1:
    item_id = UUID(str(item.id))
    node = hierarchy_by_item.get(item_id)
    return BuilderPageNodeSnapshotV1(
        item_id=item_id,
        parent_item_id=(
            UUID(str(node.parent_item_id)) if node is not None and node.parent_item_id is not None else None
        ),
        sort_order=int(node.sort_order) if node is not None else 0,
        routes=tuple(routes_by_item.get(item_id, ())),
        purpose=planning.purpose if planning is not None else None,
        section_intents=planning.section_intents if planning is not None else (),
    )


def _build_global_section_snapshot(
    *,
    item: ContentItemRecord,
    planning: BuilderPagePlanningV1 | None,
) -> BuilderGlobalSectionNodeSnapshotV1:
    return BuilderGlobalSectionNodeSnapshotV1(
        item_id=UUID(str(item.id)),
        locale=str(item.locale),
        slug=str(item.slug),
        purpose=planning.purpose if planning is not None else None,
        section_intents=planning.section_intents if planning is not None else (),
    )


def select_page_versions(
    *,
    items: Sequence[ContentItemRecord],
    versions: Sequence[ContentVersionRecord],
) -> dict[UUID, ContentVersionRecord]:
    version_by_item_and_number = {(UUID(str(version.item_id)), int(version.version)): version for version in versions}
    selected: dict[UUID, ContentVersionRecord] = {}
    for item in items:
        item_id = UUID(str(item.id))
        version_number = int(item.draft_version or item.published_version or 0)
        if version_number < 1:
            raise BuilderSnapshotError("BUILDER_CONTENT_VERSION_REQUIRED")
        version = version_by_item_and_number.get((item_id, version_number))
        if version is None:
            raise BuilderSnapshotError("BUILDER_CONTENT_VERSION_REQUIRED")
        selected[item_id] = version
    return selected


def build_page_version_pins(
    *,
    selected_versions: Mapping[UUID, ContentVersionRecord],
    presentations: Sequence[PresentationDocumentRecord],
    bindings: Sequence[ComponentBindingRecord],
) -> tuple[BuilderPageVersionPinV1, ...]:
    return tuple(
        BuilderPageVersionPinV1(**payload)
        for payload in _build_version_pin_payloads(
            selected_versions=selected_versions,
            presentations=presentations,
            bindings=bindings,
        )
    )


def build_global_section_version_pins(
    *,
    selected_versions: Mapping[UUID, ContentVersionRecord],
    presentations: Sequence[PresentationDocumentRecord],
    bindings: Sequence[ComponentBindingRecord],
) -> tuple[BuilderGlobalSectionVersionPinV1, ...]:
    return tuple(
        BuilderGlobalSectionVersionPinV1(**payload)
        for payload in _build_version_pin_payloads(
            selected_versions=selected_versions,
            presentations=presentations,
            bindings=bindings,
        )
    )


def _build_version_pin_payloads(
    *,
    selected_versions: Mapping[UUID, ContentVersionRecord],
    presentations: Sequence[PresentationDocumentRecord],
    bindings: Sequence[ComponentBindingRecord],
) -> tuple[_VersionPinPayload, ...]:
    presentations_by_version: dict[UUID, list[JsonObject]] = defaultdict(list)
    for record in presentations:
        presentations_by_version[UUID(str(record.version_id))].append({
            "kind": str(record.kind),
            "payload": cast(JsonValue, record.payload),
        })
    bindings_by_version: dict[UUID, list[JsonObject]] = defaultdict(list)
    for record in bindings:
        bindings_by_version[UUID(str(record.version_id))].append({
            "componentKey": str(record.component_key),
            "bindingKey": str(record.binding_key),
            "bindingPayload": cast(JsonValue, record.binding_payload),
            "sortOrder": int(record.sort_order),
        })
    payloads: list[_VersionPinPayload] = []
    for item_id, version in sorted(selected_versions.items(), key=lambda item: str(item[0])):
        version_id = UUID(str(version.id))
        payloads.append({
            "item_id": item_id,
            "content_version_id": version_id,
            "version_number": int(version.version),
            "presentation_set_hash": canonical_hash(cast(JsonValue, presentations_by_version.get(version_id, []))),
            "component_binding_set_hash": canonical_hash(cast(JsonValue, bindings_by_version.get(version_id, []))),
        })
    return tuple(payloads)


def aggregate_presentation_hash(
    pins: Sequence[BuilderPageVersionPinV1 | BuilderGlobalSectionVersionPinV1],
) -> str:
    return canonical_hash(
        cast(
            JsonValue,
            [
                {
                    "itemId": str(pin.item_id),
                    "contentVersionId": str(pin.content_version_id),
                    "presentationSetHash": pin.presentation_set_hash,
                    "componentBindingSetHash": pin.component_binding_set_hash,
                }
                for pin in pins
            ],
        )
    )


def _page_sort_key(
    item: ContentItemRecord,
    hierarchy_by_item: Mapping[UUID, HierarchyNodeRecord],
) -> tuple[int, str]:
    item_id = UUID(str(item.id))
    node = hierarchy_by_item.get(item_id)
    return (int(node.sort_order) if node is not None else 0, str(item_id))
