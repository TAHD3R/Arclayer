from __future__ import annotations

from collections import defaultdict
from typing import NoReturn, cast
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.builder._enums import BuilderApprovalClass, BuilderProvenanceSource
from src.modules.projects.builder.change_set_analysis import BuilderChangeSetAnalysis
from src.modules.projects.builder.change_set_schema import BuilderChangeSetAffectedTargetV1
from src.modules.projects.builder.design_change_set_schema import (
    BuilderDesignCandidateV1,
    BuilderDesignInitializeOperationV1,
    BuilderDesignOperationV1,
    BuilderDesignResponsiveStyleClearOperationV1,
    BuilderDesignResponsiveStyleSetOperationV1,
    BuilderDesignStyleClearOperationV1,
    BuilderDesignStyleSetOperationV1,
)
from src.modules.projects.builder.design_contract_context import ResolvedBuilderDesignContract
from src.modules.projects.builder.schema import ContentStructureSnapshotV1, SiteRevisionManifestV1
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.projects.builder.visual_blueprint_schema import (
    VisualBlueprintDocumentV1,
    VisualBlueprintResponsiveV1,
    VisualBlueprintSectionV1,
    VisualBlueprintStateV1,
)
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1
from src.modules.workspaces.design_systems.manifest import all_design_tokens


def analyze_design_change_set(
    *,
    structure: ContentStructureSnapshotV1,
    manifest: SiteRevisionManifestV1,
    wireframes_by_item: dict[UUID, WireframeDocumentV1 | None],
    blueprints_by_item: dict[UUID, VisualBlueprintDocumentV1 | None],
    design_contract: ResolvedBuilderDesignContract,
    operations: tuple[BuilderDesignOperationV1, ...],
    provenance_source: BuilderProvenanceSource,
) -> BuilderChangeSetAnalysis:
    host_by_item = {UUID(str(host.item_id)): host for host in (*structure.pages, *structure.global_references)}
    page_ids = {UUID(str(page.item_id)) for page in structure.pages}
    pins = {UUID(str(pin.item_id)): pin for pin in (*manifest.page_versions, *manifest.global_section_versions)}
    documents = dict(blueprints_by_item)
    affected: dict[UUID, list[str]] = defaultdict(list)
    semantic_keys: set[tuple[str, ...]] = set()

    for operation in operations:
        item_id = UUID(str(operation.item_id))
        pin = pins.get(item_id)
        wireframe = wireframes_by_item.get(item_id)
        if item_id not in host_by_item or pin is None:
            _raise_conflict("BUILDER_OPERATION_TARGET_NOT_FOUND", operationId=operation.operation_id)
        if pin.version_number != operation.expected_draft_version:
            _raise_conflict("SITE_REVISION_STALE", itemId=str(item_id))
        if wireframe is None:
            _raise_conflict("BUILDER_WIREFRAME_REQUIRED", itemId=str(item_id))
        wireframe_checksum = _wireframe_checksum(wireframe)
        if wireframe_checksum != operation.source_wireframe_checksum:
            _raise_conflict("BUILDER_DESIGN_WIREFRAME_STALE", itemId=str(item_id))
        semantic_key = _semantic_operation_key(operation)
        if semantic_key in semantic_keys:
            _raise_conflict("BUILDER_DESIGN_OPERATION_DUPLICATE", operationId=operation.operation_id)
        semantic_keys.add(semantic_key)
        documents[item_id] = _apply_operation(
            document=documents.get(item_id),
            wireframe=wireframe,
            operation=operation,
            manifest=manifest,
            design_contract=design_contract,
        )
        affected[item_id].append(operation.operation_id)

    candidates = tuple(
        BuilderDesignCandidateV1(
            item_id=item_id,
            host_kind="page" if item_id in page_ids else "global_section",
            base_content_version_id=pins[item_id].content_version_id,
            base_version_number=pins[item_id].version_number,
            visual_blueprint=_require_document(documents[item_id]),
        )
        for item_id in sorted(affected.keys(), key=lambda value: str(value))
    )
    targets = tuple(
        target
        for item_id in sorted(affected.keys(), key=lambda value: str(value))
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
    return BuilderChangeSetAnalysis(
        operations=operations,
        affected_targets=targets,
        issues=(),
        required_permissions=("project:content:items:write", "project:content:site-builder:write"),
        approval_class=(
            BuilderApprovalClass.REVIEW
            if provenance_source is BuilderProvenanceSource.AGENT
            else BuilderApprovalClass.NONE
        ),
        summary_params={
            "operationCount": len(operations),
            "affectedTargetCount": len(targets),
            "affectedPageCount": sum(candidate.host_kind == "page" for candidate in candidates),
            "affectedGlobalSectionCount": sum(candidate.host_kind == "global_section" for candidate in candidates),
            "warningCount": 0,
            "blockerCount": 0,
        },
        design_candidates=candidates,
    )


def _apply_operation(
    *,
    document: VisualBlueprintDocumentV1 | None,
    wireframe: WireframeDocumentV1,
    operation: BuilderDesignOperationV1,
    manifest: SiteRevisionManifestV1,
    design_contract: ResolvedBuilderDesignContract,
) -> VisualBlueprintDocumentV1:
    if isinstance(operation, BuilderDesignInitializeOperationV1):
        if document is not None:
            _raise_conflict("BUILDER_VISUAL_BLUEPRINT_EXISTS", itemId=str(operation.item_id))
        return VisualBlueprintDocumentV1(
            item_id=operation.item_id,
            source_wireframe_checksum=operation.source_wireframe_checksum,
            design_system_version_id=manifest.design_system_version_id,
            design_system_manifest_checksum=manifest.design_system_manifest_checksum,
            component_catalog_version=design_contract.catalog.catalog_version,
            component_catalog_checksum=design_contract.catalog.checksum,
        )
    current = _require_document(document)
    _validate_document_pins(
        document=current,
        wireframe=wireframe,
        manifest=manifest,
        design_contract=design_contract,
    )
    section = _require_wireframe_section(wireframe, operation.section_id)
    _validate_style_contract(operation=operation, section=section, design_contract=design_contract)
    sections = list(current.sections)
    index = next((index for index, item in enumerate(sections) if item.section_id == section.id), None)
    visual_section = (
        sections[index]
        if index is not None
        else VisualBlueprintSectionV1(
            section_id=section.id,
            component_key=section.component_key,
            variant_key=section.variant_key,
        )
    )
    updated = _apply_style_operation(visual_section, operation)
    if updated.states or updated.responsive_overrides:
        if index is None:
            sections.append(updated)
        else:
            sections[index] = updated
    elif index is not None:
        sections.pop(index)
    return current.model_copy(update={"sections": tuple(sections)})


def _apply_style_operation(
    section: VisualBlueprintSectionV1,
    operation: BuilderDesignStyleOperation,
) -> VisualBlueprintSectionV1:
    if isinstance(
        operation, (BuilderDesignResponsiveStyleSetOperationV1, BuilderDesignResponsiveStyleClearOperationV1)
    ):
        responsive = list(section.responsive_overrides)
        index = next((i for i, item in enumerate(responsive) if item.breakpoint == operation.breakpoint), None)
        current = (
            responsive[index] if index is not None else VisualBlueprintResponsiveV1(breakpoint=operation.breakpoint)
        )
        states = _update_states(current.states, operation)
        if states:
            replacement = current.model_copy(update={"states": states})
            if index is None:
                responsive.append(replacement)
            else:
                responsive[index] = replacement
        elif index is not None:
            responsive.pop(index)
        return section.model_copy(update={"responsive_overrides": tuple(responsive)})
    return section.model_copy(update={"states": _update_states(section.states, operation)})


def _update_states(
    states: tuple[VisualBlueprintStateV1, ...],
    operation: BuilderDesignStyleOperation,
) -> tuple[VisualBlueprintStateV1, ...]:
    result = list(states)
    index = next((i for i, state in enumerate(result) if state.state_key == operation.state_key), None)
    current = result[index] if index is not None else VisualBlueprintStateV1(state_key=operation.state_key)
    tokens = dict(current.style_tokens)
    if isinstance(operation, (BuilderDesignStyleSetOperationV1, BuilderDesignResponsiveStyleSetOperationV1)):
        tokens[operation.style_slot_key] = operation.token_path
    else:
        tokens.pop(operation.style_slot_key, None)
    if tokens:
        replacement = current.model_copy(update={"style_tokens": tokens})
        if index is None:
            result.append(replacement)
        else:
            result[index] = replacement
    elif index is not None:
        result.pop(index)
    return tuple(result)


def _validate_style_contract(
    *,
    operation: BuilderDesignStyleOperation,
    section,
    design_contract: ResolvedBuilderDesignContract,
) -> None:
    component = next(
        (item for item in design_contract.catalog.components if item.key == section.component_key),
        None,
    )
    if component is None or not any(item.key == section.variant_key for item in component.variants):
        _raise_conflict("BUILDER_COMPONENT_NOT_REGISTERED", sectionId=section.id)
    style_slot = next((item for item in component.style_slots if item.key == operation.style_slot_key), None)
    if style_slot is None or operation.state_key not in style_slot.required_states:
        _raise_conflict("BUILDER_DESIGN_STYLE_SLOT_INVALID", sectionId=section.id)
    if isinstance(
        operation, (BuilderDesignResponsiveStyleSetOperationV1, BuilderDesignResponsiveStyleClearOperationV1)
    ):
        if operation.breakpoint not in design_contract.manifest.breakpoints:
            _raise_conflict("BUILDER_DESIGN_BREAKPOINT_INVALID", breakpoint=operation.breakpoint)
    if isinstance(operation, (BuilderDesignStyleSetOperationV1, BuilderDesignResponsiveStyleSetOperationV1)):
        token = all_design_tokens(design_contract.manifest).get(operation.token_path)
        if token is None or token.type != style_slot.value_type:
            _raise_conflict("BUILDER_DESIGN_TOKEN_TYPE_INVALID", tokenPath=operation.token_path)


def _validate_document_pins(*, document, wireframe, manifest, design_contract) -> None:
    if (
        UUID(str(document.item_id)) != UUID(str(wireframe.page_item_id))
        or document.source_wireframe_checksum != _wireframe_checksum(wireframe)
        or UUID(str(document.design_system_version_id)) != UUID(str(manifest.design_system_version_id))
        or document.design_system_manifest_checksum != manifest.design_system_manifest_checksum
        or document.component_catalog_version != design_contract.catalog.catalog_version
        or document.component_catalog_checksum != design_contract.catalog.checksum
    ):
        _raise_conflict("BUILDER_VISUAL_BLUEPRINT_STALE", itemId=str(document.item_id))


def _semantic_operation_key(operation: BuilderDesignOperationV1) -> tuple[str, ...]:
    if isinstance(operation, BuilderDesignInitializeOperationV1):
        return (str(operation.item_id), "initialize")
    breakpoint = getattr(operation, "breakpoint", "base")
    return (
        str(operation.item_id),
        breakpoint,
        operation.section_id,
        operation.state_key,
        operation.style_slot_key,
    )


def _require_wireframe_section(wireframe: WireframeDocumentV1, section_id: str):
    section = next((section for section in wireframe.sections if section.id == section_id), None)
    if section is None:
        _raise_conflict("BUILDER_WIREFRAME_SECTION_NOT_FOUND", sectionId=section_id)
    return section


def _wireframe_checksum(wireframe: WireframeDocumentV1) -> str:
    return canonical_hash(wireframe.model_dump(mode="json", by_alias=True))


def _require_document(document: VisualBlueprintDocumentV1 | None) -> VisualBlueprintDocumentV1:
    if document is None:
        _raise_conflict("BUILDER_VISUAL_BLUEPRINT_REQUIRED")
    return document


def _raise_conflict(code: str, **meta: object) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code), meta=cast(JsonObject, meta))


__all__ = ["analyze_design_change_set"]
BuilderDesignStyleOperation = (
    BuilderDesignStyleSetOperationV1
    | BuilderDesignStyleClearOperationV1
    | BuilderDesignResponsiveStyleSetOperationV1
    | BuilderDesignResponsiveStyleClearOperationV1
)
