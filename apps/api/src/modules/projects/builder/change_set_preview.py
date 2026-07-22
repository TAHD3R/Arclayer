from __future__ import annotations

from collections import defaultdict
from typing import Literal, cast
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.builder._enums import BuilderApprovalClass, BuilderProvenanceSource
from src.modules.projects.builder.change_set_analysis import BuilderChangeSetAnalysis
from src.modules.projects.builder.change_set_schema import (
    BuilderChangeSetAffectedTargetV1,
    BuilderChangeSetIssueV1,
    BuilderGlobalSectionCreateOperationV1,
    BuilderGlobalSectionDeleteOperationV1,
    BuilderGlobalSectionIntentReplaceOperationV1,
    BuilderPageCreateOperationV1,
    BuilderPageDeleteOperationV1,
    BuilderPageIntentReplaceOperationV1,
    BuilderPageMoveOperationV1,
    BuilderPageRenameOperationV1,
    BuilderPageReorderOperationV1,
    BuilderRouteDisableOperationV1,
    BuilderRouteSetOperationV1,
    BuilderSitemapOperationV1,
)
from src.modules.projects.builder.global_section_graph import analyze_global_section_dependencies
from src.modules.projects.builder.schema import ContentStructureSnapshotV1, SiteRevisionManifestV1
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1
from src.modules.projects.content.routing.schema import RouteBindingUpsertIn
from src.modules.projects.content.routing.service import build_route_contract, parse_route_pattern

BuilderAffectedTargetKind = Literal[
    "content_item",
    "route",
    "hierarchy",
    "content_model",
    "planning",
    "global_section",
]

_GLOBAL_SECTION_MODEL_KEY = "reusable-section"


def analyze_sitemap_change_set(
    *,
    structure: ContentStructureSnapshotV1,
    manifest: SiteRevisionManifestV1,
    operations: tuple[BuilderSitemapOperationV1, ...],
    provenance_source: BuilderProvenanceSource,
    wireframes_by_item: dict[UUID, WireframeDocumentV1 | None] | None = None,
) -> BuilderChangeSetAnalysis:
    page_ids = {UUID(str(page.item_id)) for page in structure.pages}
    page_by_item = {UUID(str(page.item_id)): page for page in structure.pages}
    global_ids = {UUID(str(section.item_id)) for section in structure.global_references}
    global_by_item = {UUID(str(section.item_id)): section for section in structure.global_references}
    version_by_item = {UUID(str(pin.item_id)): int(pin.version_number) for pin in manifest.page_versions}
    global_version_by_item = {
        UUID(str(pin.item_id)): int(pin.version_number) for pin in manifest.global_section_versions
    }
    parent_by_item = {
        UUID(str(page.item_id)): (UUID(str(page.parent_item_id)) if page.parent_item_id is not None else None)
        for page in structure.pages
    }
    route_owner_by_locale_path = {
        (route.locale, route.path): str(page.item_id)
        for page in structure.pages
        for route in page.routes
        if route.is_active
    }
    active_route_path_by_item_locale = {
        (UUID(str(page.item_id)), route.locale): route.path
        for page in structure.pages
        for route in page.routes
        if route.is_active
    }
    deleted_page_ids = {
        UUID(str(operation.item_id)) for operation in operations if isinstance(operation, BuilderPageDeleteOperationV1)
    }
    deleted_global_ids = {
        UUID(str(operation.item_id))
        for operation in operations
        if isinstance(operation, BuilderGlobalSectionDeleteOperationV1)
    }
    deleted_item_ids = deleted_page_ids | deleted_global_ids
    _validate_deleted_target_usage(
        operations=operations,
        deleted_page_ids=deleted_page_ids,
        deleted_global_ids=deleted_global_ids,
    )
    if deleted_global_ids and wireframes_by_item is None:
        raise RuntimeError("Global-section delete analysis requires manifest Wireframes")
    global_section_graph = analyze_global_section_dependencies(
        structure=structure,
        wireframes_by_item=wireframes_by_item or {},
    )
    normalized: list[BuilderSitemapOperationV1] = []
    issues: list[BuilderChangeSetIssueV1] = []
    affected: dict[tuple[str, str], list[str]] = defaultdict(list)
    required_permissions = {"project:content:site-builder:write"}
    approval_class = (
        BuilderApprovalClass.REVIEW if provenance_source is BuilderProvenanceSource.AGENT else BuilderApprovalClass.NONE
    )

    for operation in operations:
        if isinstance(operation, BuilderPageCreateOperationV1):
            _require_parent(
                page_ids=page_ids,
                item_id=None,
                parent_item_id=operation.parent_item_id,
                deleted_item_ids=deleted_item_ids,
                operation_id=operation.operation_id,
            )
            path = parse_route_pattern(operation.path, route_mode="static").path
            _claim_route(
                route_owner_by_locale_path=route_owner_by_locale_path,
                locale=operation.locale,
                path=path,
                owner_key=f"client:{operation.client_page_id}",
                operation_id=operation.operation_id,
            )
            normalized_operation = operation.model_copy(
                update={
                    "model_key": operation.model_key.strip(),
                    "title": operation.title.strip(),
                    "slug": operation.slug.strip(),
                    "path": path,
                    "purpose": _normalize_optional_purpose(operation.purpose),
                    "fields_snapshot": {
                        **operation.fields_snapshot,
                        "title": operation.title.strip(),
                        "path": path,
                    },
                }
            )
            normalized.append(normalized_operation)
            affected[("content_model", operation.model_key.strip())].append(operation.operation_id)
            affected[("content_item", f"client:{operation.client_page_id}")].append(operation.operation_id)
            affected[("route", f"client:{operation.client_page_id}")].append(operation.operation_id)
            affected[("hierarchy", f"client:{operation.client_page_id}")].append(operation.operation_id)
            if normalized_operation.purpose is not None or normalized_operation.section_intents:
                affected[("planning", f"client:{operation.client_page_id}")].append(operation.operation_id)
            required_permissions.add("project:content:items:write")
            continue

        if isinstance(operation, BuilderGlobalSectionCreateOperationV1):
            title = operation.title.strip()
            slug = operation.slug.strip()
            normalized_operation = operation.model_copy(
                update={
                    "title": title,
                    "slug": slug,
                    "purpose": _normalize_optional_purpose(operation.purpose),
                    "fields_snapshot": {
                        **operation.fields_snapshot,
                        "title": title,
                        "section_key": slug,
                    },
                }
            )
            normalized.append(normalized_operation)
            client_key = f"client:{operation.client_global_section_id}"
            affected[("content_item", client_key)].append(operation.operation_id)
            affected[("content_model", _GLOBAL_SECTION_MODEL_KEY)].append(operation.operation_id)
            affected[("global_section", client_key)].append(operation.operation_id)
            if normalized_operation.purpose is not None or normalized_operation.section_intents:
                affected[("planning", client_key)].append(operation.operation_id)
            required_permissions.add("project:content:items:write")
            continue

        item_id = _operation_item_id(operation)
        if isinstance(operation, BuilderGlobalSectionDeleteOperationV1):
            _require_global_section(
                global_ids=global_ids,
                item_id=item_id,
                operation_id=operation.operation_id,
            )
            _require_expected_version(
                version_by_item=global_version_by_item,
                item_id=item_id,
                expected=operation.expected_draft_version,
            )
            incoming = tuple(
                reference
                for reference in global_section_graph.references
                if UUID(str(reference.target_item_id)) == item_id
            )
            if incoming:
                issues.append(
                    BuilderChangeSetIssueV1(
                        severity="blocker",
                        code="BUILDER_GLOBAL_SECTION_IN_USE",
                        message_key="BUILDER_GLOBAL_SECTION_IN_USE",
                        operation_id=operation.operation_id,
                        meta={
                            "itemId": str(item_id),
                            "incomingReferences": [
                                reference.model_dump(mode="json", by_alias=True) for reference in incoming
                            ],
                        },
                    )
                )
            else:
                issues.append(
                    BuilderChangeSetIssueV1(
                        severity="warning",
                        code="BUILDER_GLOBAL_SECTION_DELETE_REQUIRES_APPROVAL",
                        message_key="BUILDER_GLOBAL_SECTION_DELETE_REQUIRES_APPROVAL",
                        operation_id=operation.operation_id,
                        meta={"itemId": str(item_id), "incomingReferenceCount": 0},
                    )
                )
            normalized.append(operation)
            affected[("content_item", str(item_id))].append(operation.operation_id)
            affected[("global_section", str(item_id))].append(operation.operation_id)
            required_permissions.add("project:content:items:write")
            approval_class = BuilderApprovalClass.DESTRUCTIVE
            continue
        if isinstance(operation, BuilderGlobalSectionIntentReplaceOperationV1):
            _require_global_section(
                global_ids=global_ids,
                item_id=item_id,
                operation_id=operation.operation_id,
            )
            normalized_operation = operation.model_copy(update={"purpose": _normalize_purpose(operation.purpose)})
            current_intent_ids = {intent.id for intent in global_by_item[item_id].section_intents}
            next_intent_ids = {intent.id for intent in normalized_operation.section_intents}
            approval_class = _append_intent_removal_issues(
                issues=issues,
                operation=normalized_operation,
                removed_intent_ids=current_intent_ids - next_intent_ids,
                wireframe=(wireframes_by_item or {}).get(item_id),
                approval_class=approval_class,
            )
            global_by_item[item_id] = global_by_item[item_id].model_copy(
                update={
                    "purpose": normalized_operation.purpose,
                    "section_intents": normalized_operation.section_intents,
                }
            )
            normalized.append(normalized_operation)
            affected[("global_section", str(item_id))].append(operation.operation_id)
            affected[("planning", str(item_id))].append(operation.operation_id)
            continue
        _require_page(page_ids=page_ids, item_id=item_id, operation_id=operation.operation_id)
        if isinstance(operation, BuilderPageIntentReplaceOperationV1):
            normalized_operation = operation.model_copy(update={"purpose": _normalize_purpose(operation.purpose)})
            current_intent_ids = {intent.id for intent in page_by_item[item_id].section_intents}
            next_intent_ids = {intent.id for intent in normalized_operation.section_intents}
            removed_intent_ids = current_intent_ids - next_intent_ids
            approval_class = _append_intent_removal_issues(
                issues=issues,
                operation=normalized_operation,
                removed_intent_ids=removed_intent_ids,
                wireframe=(wireframes_by_item or {}).get(item_id),
                approval_class=approval_class,
            )
            page_by_item[item_id] = page_by_item[item_id].model_copy(
                update={
                    "purpose": normalized_operation.purpose,
                    "section_intents": normalized_operation.section_intents,
                }
            )
            normalized.append(normalized_operation)
            affected[("planning", str(item_id))].append(operation.operation_id)
            continue
        affected[("content_item", str(item_id))].append(operation.operation_id)

        if isinstance(operation, BuilderPageRenameOperationV1):
            _require_expected_version(
                version_by_item=version_by_item,
                item_id=item_id,
                expected=operation.expected_draft_version,
            )
            normalized.append(operation.model_copy(update={"title": operation.title.strip()}))
            required_permissions.add("project:content:items:write")
            continue

        if isinstance(operation, BuilderPageMoveOperationV1):
            _require_parent(
                page_ids=page_ids,
                item_id=item_id,
                parent_item_id=operation.parent_item_id,
                deleted_item_ids=deleted_item_ids,
                operation_id=operation.operation_id,
            )
            parent_by_item[item_id] = UUID(str(operation.parent_item_id)) if operation.parent_item_id else None
            _require_acyclic(parent_by_item=parent_by_item, item_id=item_id)
            normalized.append(operation)
            affected[("hierarchy", str(item_id))].append(operation.operation_id)
            continue

        if isinstance(operation, BuilderPageReorderOperationV1):
            normalized.append(operation)
            affected[("hierarchy", str(item_id))].append(operation.operation_id)
            continue

        if isinstance(operation, BuilderPageDeleteOperationV1):
            _require_expected_version(
                version_by_item=version_by_item,
                item_id=item_id,
                expected=operation.expected_draft_version,
            )
            child_count = sum(parent_id == item_id for parent_id in parent_by_item.values())
            issues.append(
                BuilderChangeSetIssueV1(
                    severity="warning",
                    code="BUILDER_PAGE_DELETE_REQUIRES_APPROVAL",
                    message_key="BUILDER_PAGE_DELETE_REQUIRES_APPROVAL",
                    operation_id=operation.operation_id,
                    meta={"childCount": child_count},
                )
            )
            normalized.append(operation)
            affected[("hierarchy", str(item_id))].append(operation.operation_id)
            affected[("route", str(item_id))].append(operation.operation_id)
            for route_key, path in tuple(active_route_path_by_item_locale.items()):
                if route_key[0] != item_id:
                    continue
                route_owner_by_locale_path.pop((route_key[1], path), None)
                active_route_path_by_item_locale.pop(route_key)
            required_permissions.add("project:content:items:write")
            approval_class = BuilderApprovalClass.DESTRUCTIVE
            continue

        if isinstance(operation, BuilderRouteSetOperationV1):
            payload = RouteBindingUpsertIn(
                locale=operation.locale,
                path=operation.path,
                route_mode=operation.route_mode,
                route_priority=operation.route_priority,
                primary_source=operation.primary_source,
            )
            build_route_contract(payload)
            pattern = parse_route_pattern(payload.path, route_mode=payload.route_mode)
            route_key = (item_id, operation.locale)
            existing_path = active_route_path_by_item_locale.get(route_key)
            if existing_path is not None:
                route_owner_by_locale_path.pop((operation.locale, existing_path), None)
            _claim_route(
                route_owner_by_locale_path=route_owner_by_locale_path,
                locale=operation.locale,
                path=pattern.path,
                owner_key=str(item_id),
                operation_id=operation.operation_id,
            )
            normalized.append(operation.model_copy(update={"path": pattern.path, "route_mode": pattern.mode}))
            active_route_path_by_item_locale[route_key] = pattern.path
            affected[("route", str(item_id))].append(operation.operation_id)
            continue

        if isinstance(operation, BuilderRouteDisableOperationV1):
            route_key = (item_id, operation.locale)
            existing_path = active_route_path_by_item_locale.get(route_key)
            if existing_path is None:
                issues.append(
                    BuilderChangeSetIssueV1(
                        severity="warning",
                        code="BUILDER_ROUTE_ALREADY_DISABLED",
                        message_key="BUILDER_ROUTE_ALREADY_DISABLED",
                        operation_id=operation.operation_id,
                    )
                )
            else:
                route_owner_by_locale_path.pop((operation.locale, existing_path), None)
                active_route_path_by_item_locale.pop(route_key)
            normalized.append(operation)
            affected[("route", str(item_id))].append(operation.operation_id)
            continue

        _raise_conflict("BUILDER_OPERATION_INVALID")

    targets = tuple(_affected_target(key=key, operation_ids=value) for key, value in sorted(affected.items()))
    return BuilderChangeSetAnalysis(
        operations=tuple(normalized),
        affected_targets=targets,
        issues=tuple(issues),
        required_permissions=tuple(sorted(required_permissions)),
        approval_class=approval_class,
        summary_params={
            "operationCount": len(normalized),
            "affectedTargetCount": len(targets),
            "warningCount": len(issues),
        },
        global_section_graph=global_section_graph,
    )


def _operation_item_id(operation: BuilderSitemapOperationV1) -> UUID:
    item_id = getattr(operation, "item_id", None)
    if item_id is None:
        _raise_conflict("BUILDER_OPERATION_INVALID")
    return UUID(str(item_id))


def _append_intent_removal_issues(
    *,
    issues: list[BuilderChangeSetIssueV1],
    operation: BuilderPageIntentReplaceOperationV1 | BuilderGlobalSectionIntentReplaceOperationV1,
    removed_intent_ids: set[str],
    wireframe: WireframeDocumentV1 | None,
    approval_class: BuilderApprovalClass,
) -> BuilderApprovalClass:
    if not removed_intent_ids:
        return approval_class
    sections_by_intent: dict[str, list[str]] = defaultdict(list)
    if wireframe is not None:
        for section in wireframe.sections:
            sections_by_intent[section.intent_id].append(section.id)
    for intent_id in sorted(removed_intent_ids):
        section_ids = sections_by_intent.get(intent_id, [])
        if section_ids:
            issues.append(
                BuilderChangeSetIssueV1(
                    severity="blocker",
                    code="BUILDER_SECTION_INTENT_IN_USE",
                    message_key="BUILDER_SECTION_INTENT_IN_USE",
                    operation_id=operation.operation_id,
                    meta={
                        "itemId": str(operation.item_id),
                        "intentId": intent_id,
                        "sectionIds": section_ids,
                    },
                )
            )
            continue
        issues.append(
            BuilderChangeSetIssueV1(
                severity="warning",
                code="BUILDER_SECTION_INTENT_REMOVE_REQUIRES_APPROVAL",
                message_key="BUILDER_SECTION_INTENT_REMOVE_REQUIRES_APPROVAL",
                operation_id=operation.operation_id,
                meta={"itemId": str(operation.item_id), "intentId": intent_id},
            )
        )
    return BuilderApprovalClass.DESTRUCTIVE


def _normalize_optional_purpose(value: str | None) -> str | None:
    return _normalize_purpose(value) if value is not None else None


def _normalize_purpose(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        _raise_conflict("BUILDER_OPERATION_INVALID")
    return normalized


def _require_page(*, page_ids: set[UUID], item_id: UUID, operation_id: str) -> None:
    if item_id not in page_ids:
        _raise_conflict(
            "BUILDER_OPERATION_TARGET_NOT_FOUND",
            meta={"operationId": operation_id, "itemId": str(item_id)},
        )


def _require_global_section(
    *,
    global_ids: set[UUID],
    item_id: UUID,
    operation_id: str,
) -> None:
    if item_id not in global_ids:
        _raise_conflict(
            "BUILDER_OPERATION_TARGET_NOT_FOUND",
            meta={"operationId": operation_id, "itemId": str(item_id)},
        )


def _require_parent(
    *,
    page_ids: set[UUID],
    item_id: UUID | None,
    parent_item_id,
    deleted_item_ids: set[UUID],
    operation_id: str,
) -> None:
    if parent_item_id is None:
        return
    parent_id = UUID(str(parent_item_id))
    if parent_id == item_id or parent_id not in page_ids or parent_id in deleted_item_ids:
        _raise_conflict(
            "BUILDER_OPERATION_INVALID",
            meta={"operationId": operation_id, "parentItemId": str(parent_id)},
        )


def _require_acyclic(*, parent_by_item: dict[UUID, UUID | None], item_id: UUID) -> None:
    seen = {item_id}
    cursor = parent_by_item.get(item_id)
    while cursor is not None:
        if cursor in seen:
            _raise_conflict("CONTENT_HIERARCHY_CYCLE")
        seen.add(cursor)
        cursor = parent_by_item.get(cursor)


def _require_expected_version(*, version_by_item: dict[UUID, int], item_id: UUID, expected: int) -> None:
    current = version_by_item.get(item_id)
    if current != expected:
        _raise_conflict(
            "SITE_REVISION_STALE",
            meta={"itemId": str(item_id), "expectedVersion": expected, "baseVersion": current},
        )


def _claim_route(
    *,
    route_owner_by_locale_path: dict[tuple[str, str], str],
    locale: str,
    path: str,
    owner_key: str,
    operation_id: str,
) -> None:
    owner = route_owner_by_locale_path.get((locale, path))
    if owner is not None and owner != owner_key:
        _raise_conflict(
            "CONTENT_ROUTE_CONFLICT",
            meta={"operationId": operation_id, "locale": locale, "path": path},
        )
    route_owner_by_locale_path[(locale, path)] = owner_key


def _affected_target(
    *,
    key: tuple[str, str],
    operation_ids: list[str],
) -> BuilderChangeSetAffectedTargetV1:
    kind, raw_id = key
    if raw_id.startswith("client:"):
        return BuilderChangeSetAffectedTargetV1(
            kind=cast(BuilderAffectedTargetKind, kind),
            client_target_id=raw_id.removeprefix("client:"),
            operation_ids=tuple(operation_ids),
        )
    if kind == "content_model":
        return BuilderChangeSetAffectedTargetV1(
            kind="content_model",
            target_key=raw_id,
            operation_ids=tuple(operation_ids),
        )
    return BuilderChangeSetAffectedTargetV1(
        kind=cast(BuilderAffectedTargetKind, kind),
        target_id=UUID(raw_id),
        operation_ids=tuple(operation_ids),
    )


def _validate_deleted_target_usage(
    *,
    operations: tuple[BuilderSitemapOperationV1, ...],
    deleted_page_ids: set[UUID],
    deleted_global_ids: set[UUID],
) -> None:
    page_delete_counts: dict[UUID, int] = defaultdict(int)
    global_delete_counts: dict[UUID, int] = defaultdict(int)
    for operation in operations:
        if isinstance(operation, BuilderPageDeleteOperationV1):
            page_delete_counts[UUID(str(operation.item_id))] += 1
        if isinstance(operation, BuilderGlobalSectionDeleteOperationV1):
            global_delete_counts[UUID(str(operation.item_id))] += 1
    duplicate_page_delete = next((item_id for item_id, count in page_delete_counts.items() if count > 1), None)
    if duplicate_page_delete is not None:
        _raise_conflict(
            "BUILDER_OPERATION_INVALID",
            meta={"itemId": str(duplicate_page_delete), "reason": "duplicate_page_delete"},
        )
    duplicate_global_delete = next((item_id for item_id, count in global_delete_counts.items() if count > 1), None)
    if duplicate_global_delete is not None:
        _raise_conflict(
            "BUILDER_OPERATION_INVALID",
            meta={"itemId": str(duplicate_global_delete), "reason": "duplicate_global_section_delete"},
        )
    deleted_item_ids = deleted_page_ids | deleted_global_ids
    for operation in operations:
        if isinstance(
            operation,
            (
                BuilderPageCreateOperationV1,
                BuilderPageDeleteOperationV1,
                BuilderGlobalSectionCreateOperationV1,
                BuilderGlobalSectionDeleteOperationV1,
            ),
        ):
            continue
        item_id = _operation_item_id(operation)
        if item_id in deleted_item_ids:
            _raise_conflict(
                "BUILDER_OPERATION_INVALID",
                meta={
                    "operationId": operation.operation_id,
                    "itemId": str(item_id),
                    "reason": "target_deleted_in_change_set",
                },
            )


def _raise_conflict(code: str, *, meta: JsonObject | None = None) -> None:
    raise Conflict(error=code, message=t("errors", code), meta=meta)
