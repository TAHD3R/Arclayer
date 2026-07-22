from __future__ import annotations

from collections import defaultdict
from typing import NoReturn
from uuid import UUID

from pydantic import ValidationError

from src.common.types.json_types import JsonObject
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.builder._enums import BuilderApprovalClass, BuilderProvenanceSource
from src.modules.projects.builder.change_set_analysis import BuilderChangeSetAnalysis
from src.modules.projects.builder.change_set_schema import (
    BuilderChangeSetAffectedTargetV1,
    BuilderChangeSetIssueV1,
    BuilderWireframeCandidateV1,
)
from src.modules.projects.builder.global_section_graph import analyze_global_section_dependencies
from src.modules.projects.builder.global_section_schema import BuilderGlobalSectionDependencyGraphOut
from src.modules.projects.builder.schema import ContentStructureSnapshotV1, SiteRevisionManifestV1
from src.modules.projects.builder.wireframe_change_set_schema import (
    BuilderWireframeClearBindingOperationV1,
    BuilderWireframeClearGlobalReferenceOperationV1,
    BuilderWireframeClearResponsiveRuleOperationV1,
    BuilderWireframeInitializeOperationV1,
    BuilderWireframeOperationV1,
    BuilderWireframeSectionAddOperationV1,
    BuilderWireframeSectionConfigureOperationV1,
    BuilderWireframeSectionDuplicateOperationV1,
    BuilderWireframeSectionRemoveOperationV1,
    BuilderWireframeSectionReorderOperationV1,
    BuilderWireframeSetBindingOperationV1,
    BuilderWireframeSetComponentOperationV1,
    BuilderWireframeSetGlobalReferenceOperationV1,
    BuilderWireframeSetInteractionsOperationV1,
    BuilderWireframeSetResponsiveRuleOperationV1,
    BuilderWireframeSetVariantOperationV1,
)
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1, WireframeSectionV1
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1
from src.modules.sites.component_catalogs.wireframe_validation import validate_wireframe_component_compatibility


def analyze_wireframe_change_set(
    *,
    structure: ContentStructureSnapshotV1,
    manifest: SiteRevisionManifestV1,
    wireframes_by_item: dict[UUID, WireframeDocumentV1 | None],
    component_catalog: ComponentCatalogV1,
    operations: tuple[BuilderWireframeOperationV1, ...],
    provenance_source: BuilderProvenanceSource,
) -> BuilderChangeSetAnalysis:
    host_by_item = {UUID(str(host.item_id)): host for host in (*structure.pages, *structure.global_references)}
    page_ids = {UUID(str(page.item_id)) for page in structure.pages}
    pins = {UUID(str(pin.item_id)): pin for pin in (*manifest.page_versions, *manifest.global_section_versions)}
    documents = dict(wireframes_by_item)
    affected: dict[UUID, list[str]] = defaultdict(list)
    issues: list[BuilderChangeSetIssueV1] = []
    normalized: list[BuilderWireframeOperationV1] = []
    approval_class = (
        BuilderApprovalClass.REVIEW if provenance_source is BuilderProvenanceSource.AGENT else BuilderApprovalClass.NONE
    )

    for operation in operations:
        item_id = UUID(str(operation.item_id))
        pin = pins.get(item_id)
        if item_id not in host_by_item or pin is None:
            _raise_conflict(
                "BUILDER_OPERATION_TARGET_NOT_FOUND",
                meta={"operationId": operation.operation_id, "itemId": str(item_id)},
            )
        if pin.version_number != operation.expected_draft_version:
            _raise_conflict(
                "SITE_REVISION_STALE",
                meta={
                    "itemId": str(item_id),
                    "expectedVersion": operation.expected_draft_version,
                    "baseVersion": pin.version_number,
                },
            )
        document, normalized_operation = _apply_operation(
            document=documents.get(item_id),
            operation=operation,
            item_id=item_id,
            design_system_version_id=UUID(str(manifest.design_system_version_id)),
        )
        documents[item_id] = document
        normalized.append(normalized_operation)
        affected[item_id].append(operation.operation_id)
        if isinstance(operation, BuilderWireframeSectionRemoveOperationV1):
            approval_class = BuilderApprovalClass.DESTRUCTIVE
            issues.append(
                BuilderChangeSetIssueV1(
                    severity="warning",
                    code="BUILDER_WIREFRAME_SECTION_REMOVE_REQUIRES_APPROVAL",
                    message_key="BUILDER_WIREFRAME_SECTION_REMOVE_REQUIRES_APPROVAL",
                    operation_id=operation.operation_id,
                    meta={"itemId": str(item_id), "sectionId": operation.section_id},
                )
            )

    candidates = tuple(
        BuilderWireframeCandidateV1(
            item_id=item_id,
            host_kind="page" if item_id in page_ids else "global_section",
            base_content_version_id=pins[item_id].content_version_id,
            base_version_number=pins[item_id].version_number,
            wireframe=_require_document(documents[item_id]),
        )
        for item_id in sorted(affected, key=lambda value: str(value))
    )
    compatibility_findings = tuple(
        finding
        for candidate in candidates
        for finding in validate_wireframe_component_compatibility(
            document=candidate.wireframe,
            catalog=component_catalog,
        )
    )
    issues.extend(
        BuilderChangeSetIssueV1(
            severity="blocker",
            code=finding.code,
            message_key=finding.code,
            meta=finding.meta,
        )
        for finding in compatibility_findings
    )
    traceability_issues = tuple(
        issue
        for candidate in candidates
        for issue in _intent_traceability_issues(
            item_id=UUID(str(candidate.item_id)),
            canonical_intent_ids=tuple(
                intent.id for intent in host_by_item[UUID(str(candidate.item_id))].section_intents
            ),
            document=candidate.wireframe,
        )
    )
    issues.extend(traceability_issues)
    global_section_graph = analyze_global_section_dependencies(
        structure=structure,
        wireframes_by_item=documents,
    )
    issues.extend(_global_dependency_issues(global_section_graph))
    targets = tuple(
        target
        for item_id in sorted(affected, key=lambda value: str(value))
        for target in (
            BuilderChangeSetAffectedTargetV1(
                kind="content_item",
                target_id=item_id,
                operation_ids=tuple(affected[item_id]),
            ),
            BuilderChangeSetAffectedTargetV1(
                kind="presentation",
                target_id=item_id,
                operation_ids=tuple(affected[item_id]),
            ),
        )
    )
    referenced_targets = tuple(
        BuilderChangeSetAffectedTargetV1(
            kind="global_section",
            target_id=target_id,
            operation_ids=tuple(
                operation_id
                for host_id, operation_ids in affected.items()
                if any(
                    UUID(str(reference.host_item_id)) == host_id and UUID(str(reference.target_item_id)) == target_id
                    for reference in global_section_graph.references
                )
                for operation_id in operation_ids
            ),
        )
        for target_id in sorted(
            {
                UUID(str(reference.target_item_id))
                for reference in global_section_graph.references
                if UUID(str(reference.host_item_id)) in affected
            },
            key=lambda item_id: str(item_id),
        )
    )
    return BuilderChangeSetAnalysis(
        operations=tuple(normalized),
        affected_targets=(*targets, *referenced_targets),
        issues=tuple(issues),
        required_permissions=("project:content:items:write", "project:content:site-builder:write"),
        approval_class=approval_class,
        summary_params={
            "operationCount": len(normalized),
            "affectedTargetCount": len(targets) + len(referenced_targets),
            "affectedPageCount": sum(candidate.host_kind == "page" for candidate in candidates),
            "affectedGlobalSectionCount": sum(candidate.host_kind == "global_section" for candidate in candidates),
            "warningCount": sum(issue.severity == "warning" for issue in issues),
            "blockerCount": sum(issue.severity == "blocker" for issue in issues),
        },
        wireframe_candidates=candidates,
        global_section_graph=global_section_graph,
    )


def _global_dependency_issues(
    graph: BuilderGlobalSectionDependencyGraphOut,
) -> tuple[BuilderChangeSetIssueV1, ...]:
    issues = [
        BuilderChangeSetIssueV1(
            severity="blocker",
            code="BUILDER_GLOBAL_SECTION_REFERENCE_UNKNOWN",
            message_key="BUILDER_GLOBAL_SECTION_REFERENCE_UNKNOWN",
            meta=reference.model_dump(mode="json", by_alias=True),
        )
        for reference in graph.unknown_references
    ]
    issues.extend(
        BuilderChangeSetIssueV1(
            severity="blocker",
            code="BUILDER_GLOBAL_SECTION_WIREFRAME_REQUIRED",
            message_key="BUILDER_GLOBAL_SECTION_WIREFRAME_REQUIRED",
            meta=reference.model_dump(mode="json", by_alias=True),
        )
        for reference in graph.missing_wireframe_references
    )
    issues.extend(
        BuilderChangeSetIssueV1(
            severity="blocker",
            code="BUILDER_GLOBAL_SECTION_REFERENCE_CYCLE",
            message_key="BUILDER_GLOBAL_SECTION_REFERENCE_CYCLE",
            meta=cycle.model_dump(mode="json", by_alias=True),
        )
        for cycle in graph.cycles
    )
    return tuple(issues)


def _intent_traceability_issues(
    *,
    item_id: UUID,
    canonical_intent_ids: tuple[str, ...],
    document: WireframeDocumentV1,
) -> tuple[BuilderChangeSetIssueV1, ...]:
    canonical_intent_id_set = set(canonical_intent_ids)
    sections_by_intent: dict[str, list[str]] = defaultdict(list)
    for section in document.sections:
        sections_by_intent[section.intent_id].append(section.id)

    issues = [
        BuilderChangeSetIssueV1(
            severity="blocker",
            code="BUILDER_WIREFRAME_INTENT_UNKNOWN",
            message_key="BUILDER_WIREFRAME_INTENT_UNKNOWN",
            meta={
                "itemId": str(item_id),
                "intentId": intent_id,
                "sectionIds": section_ids,
            },
        )
        for intent_id, section_ids in sections_by_intent.items()
        if intent_id not in canonical_intent_id_set
    ]
    issues.extend(
        BuilderChangeSetIssueV1(
            severity="warning",
            code="BUILDER_WIREFRAME_INTENT_UNMAPPED",
            message_key="BUILDER_WIREFRAME_INTENT_UNMAPPED",
            meta={"itemId": str(item_id), "intentId": intent_id},
        )
        for intent_id in canonical_intent_ids
        if intent_id not in sections_by_intent
    )
    return tuple(issues)


def _apply_operation(
    *,
    document: WireframeDocumentV1 | None,
    operation: BuilderWireframeOperationV1,
    item_id: UUID,
    design_system_version_id: UUID,
) -> tuple[WireframeDocumentV1, BuilderWireframeOperationV1]:
    if isinstance(operation, BuilderWireframeInitializeOperationV1):
        if document is not None:
            _raise_conflict("BUILDER_WIREFRAME_ALREADY_EXISTS")
        normalized = operation.model_copy(
            update={"component_catalog_version": _nonblank(operation.component_catalog_version)}
        )
        return (
            _validate_document({
                "schemaVersion": 1,
                "pageItemId": item_id,
                "designSystemVersionId": design_system_version_id,
                "componentCatalogVersion": normalized.component_catalog_version,
                "sections": [section.model_dump(mode="json", by_alias=True) for section in normalized.sections],
            }),
            normalized,
        )

    current = _require_document(document)
    sections = list(current.sections)
    if isinstance(operation, BuilderWireframeSectionAddOperationV1):
        _require_insert_index(operation.index, len(sections))
        sections.insert(operation.index, operation.section)
    elif isinstance(operation, BuilderWireframeSectionDuplicateOperationV1):
        source = _require_section(sections, operation.section_id)
        _require_insert_index(operation.index, len(sections))
        sections.insert(
            operation.index,
            source.model_copy(
                update={"id": _nonblank(operation.new_section_id), "intent_id": _nonblank(operation.new_intent_id)}
            ),
        )
    elif isinstance(operation, BuilderWireframeSectionRemoveOperationV1):
        sections.remove(_require_section(sections, operation.section_id))
    elif isinstance(operation, BuilderWireframeSectionReorderOperationV1):
        section = _require_section(sections, operation.section_id)
        sections.remove(section)
        _require_insert_index(operation.index, len(sections))
        sections.insert(operation.index, section)
    else:
        index, section = _section_index(sections, operation.section_id)
        sections[index] = _update_section(section=section, operation=operation)

    return _replace_sections(current, sections), operation


def _update_section(*, section: WireframeSectionV1, operation: BuilderWireframeOperationV1) -> WireframeSectionV1:
    if isinstance(operation, BuilderWireframeSectionConfigureOperationV1):
        return _replace_section(
            section,
            component_key=_nonblank(operation.component_key),
            variant_key=_nonblank(operation.variant_key),
            bindings=list(operation.bindings),
            responsive_rules=list(operation.responsive_rules),
            interaction_rules=list(operation.interaction_rules),
        )
    if isinstance(operation, BuilderWireframeSetComponentOperationV1):
        return _replace_section(section, component_key=_nonblank(operation.component_key))
    if isinstance(operation, BuilderWireframeSetVariantOperationV1):
        return _replace_section(section, variant_key=_nonblank(operation.variant_key))
    if isinstance(operation, BuilderWireframeSetBindingOperationV1):
        bindings = list(section.bindings)
        existing = next(
            (index for index, item in enumerate(bindings) if item.slot_key == operation.binding.slot_key), None
        )
        if existing is None:
            bindings.append(operation.binding)
        else:
            bindings[existing] = operation.binding
        return _replace_section(section, bindings=bindings)
    if isinstance(operation, BuilderWireframeClearBindingOperationV1):
        bindings = [item for item in section.bindings if item.slot_key != operation.slot_key]
        if len(bindings) == len(section.bindings):
            _raise_conflict("BUILDER_BINDING_INVALID")
        return _replace_section(section, bindings=bindings)
    if isinstance(operation, BuilderWireframeSetResponsiveRuleOperationV1):
        rules = list(section.responsive_rules)
        existing = next(
            (index for index, item in enumerate(rules) if item.breakpoint == operation.rule.breakpoint), None
        )
        if existing is None:
            rules.append(operation.rule)
        else:
            rules[existing] = operation.rule
        return _replace_section(section, responsive_rules=rules)
    if isinstance(operation, BuilderWireframeClearResponsiveRuleOperationV1):
        rules = [item for item in section.responsive_rules if item.breakpoint != operation.breakpoint]
        if len(rules) == len(section.responsive_rules):
            _raise_conflict("BUILDER_OPERATION_INVALID")
        return _replace_section(section, responsive_rules=rules)
    if isinstance(operation, BuilderWireframeSetInteractionsOperationV1):
        return _replace_section(section, interaction_rules=list(operation.rules))
    if isinstance(operation, BuilderWireframeSetGlobalReferenceOperationV1):
        return _replace_section(
            section,
            global_reference_id=operation.global_section_item_id,
        )
    if isinstance(operation, BuilderWireframeClearGlobalReferenceOperationV1):
        if section.global_reference_id is None:
            _raise_conflict("BUILDER_GLOBAL_SECTION_REFERENCE_NOT_SET")
        return _replace_section(section, global_reference_id=None)
    _raise_conflict("BUILDER_OPERATION_INVALID")


def _replace_sections(document: WireframeDocumentV1, sections: list[WireframeSectionV1]) -> WireframeDocumentV1:
    payload = document.model_dump(mode="json", by_alias=True)
    payload["sections"] = [section.model_dump(mode="json", by_alias=True) for section in sections]
    return _validate_document(payload)


def _replace_section(section: WireframeSectionV1, **updates: object) -> WireframeSectionV1:
    payload = section.model_dump(mode="json", by_alias=True)
    for key, value in updates.items():
        alias = {
            "component_key": "componentKey",
            "variant_key": "variantKey",
            "responsive_rules": "responsiveRules",
            "interaction_rules": "interactionRules",
            "global_reference_id": "globalReferenceId",
        }.get(key, key)
        payload[alias] = value
    try:
        return WireframeSectionV1.model_validate(payload)
    except ValidationError:
        _raise_conflict("BUILDER_OPERATION_INVALID")


def _validate_document(payload: object) -> WireframeDocumentV1:
    try:
        return WireframeDocumentV1.model_validate(payload)
    except ValidationError:
        _raise_conflict("BUILDER_OPERATION_INVALID")


def _section_index(sections: list[WireframeSectionV1], section_id: str) -> tuple[int, WireframeSectionV1]:
    normalized = _nonblank(section_id)
    for index, section in enumerate(sections):
        if section.id == normalized:
            return index, section
    _raise_conflict("BUILDER_WIREFRAME_SECTION_NOT_FOUND", meta={"sectionId": normalized})


def _require_section(sections: list[WireframeSectionV1], section_id: str) -> WireframeSectionV1:
    return _section_index(sections, section_id)[1]


def _require_insert_index(index: int, length: int) -> None:
    if index > length:
        _raise_conflict("BUILDER_WIREFRAME_INDEX_INVALID", meta={"index": index, "sectionCount": length})


def _require_document(document: WireframeDocumentV1 | None) -> WireframeDocumentV1:
    if document is None:
        _raise_conflict("BUILDER_WIREFRAME_REQUIRED")
    return document


def _nonblank(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        _raise_conflict("BUILDER_OPERATION_INVALID")
    return normalized


def _raise_conflict(code: str, *, meta: JsonObject | None = None) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code), meta=meta)


__all__ = ["analyze_wireframe_change_set"]
