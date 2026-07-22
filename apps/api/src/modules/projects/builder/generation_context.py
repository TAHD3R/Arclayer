from __future__ import annotations

from typing import NoReturn
from uuid import UUID

from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.projects.builder.component_catalog_context import resolve_builder_component_catalog
from src.modules.projects.builder.design_contract_context import resolve_builder_design_contract
from src.modules.projects.builder.generation_provider import (
    BuilderDesignGenerationContextV1,
    BuilderDesignGenerationTargetContextV1,
    BuilderWireframeGenerationContextV1,
    BuilderWireframeGenerationTargetContextV1,
)
from src.modules.projects.builder.generation_schema import BuilderGenerationTargetV1
from src.modules.projects.builder.global_section_graph import analyze_global_section_dependencies
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import BuilderPagePlanningV1
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.projects.builder.visual_blueprint_documents import load_manifest_visual_blueprints
from src.modules.projects.builder.visual_blueprint_schema import VisualBlueprintDocumentV1
from src.modules.projects.builder.wireframe_documents import load_manifest_wireframes
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1


class BuilderGenerationPlanningPartition(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    planned: tuple[BuilderGenerationTargetV1, ...]
    unplanned: tuple[BuilderGenerationTargetV1, ...]
    expected_draft_versions: tuple[tuple[UUID, int], ...]


def partition_generation_targets_by_planning(
    *,
    builder_context: AgentRunBuilderContextV1,
    targets: tuple[BuilderGenerationTargetV1, ...],
) -> BuilderGenerationPlanningPartition:
    planned: list[BuilderGenerationTargetV1] = []
    unplanned: list[BuilderGenerationTargetV1] = []
    versions: list[tuple[UUID, int]] = []
    for target in targets:
        item_id = UUID(str(target.item_id))
        nodes = (
            builder_context.content_structure.pages
            if target.kind == "page"
            else builder_context.content_structure.global_references
        )
        pins = (
            builder_context.manifest.page_versions
            if target.kind == "page"
            else builder_context.manifest.global_section_versions
        )
        node = next((item for item in nodes if UUID(str(item.item_id)) == item_id), None)
        if node is None:
            _raise_conflict("BUILDER_OPERATION_TARGET_NOT_FOUND")
        version_pin = next((pin for pin in pins if UUID(str(pin.item_id)) == item_id), None)
        if version_pin is None:
            _raise_conflict("BUILDER_CONTENT_VERSION_REQUIRED")
        versions.append((item_id, version_pin.version_number))
        destination = planned if node.purpose is not None and node.section_intents else unplanned
        destination.append(target)
    return BuilderGenerationPlanningPartition(
        planned=tuple(planned),
        unplanned=tuple(unplanned),
        expected_draft_versions=tuple(versions),
    )


def build_wireframe_generation_context(
    *,
    builder_context: AgentRunBuilderContextV1,
    targets: tuple[BuilderGenerationTargetV1, ...],
    wireframes_by_item: dict[UUID, WireframeDocumentV1 | None],
    component_catalog: ComponentCatalogV1,
) -> BuilderWireframeGenerationContextV1:
    design_system_version_id = UUID(str(builder_context.manifest.design_system_version_id))
    return BuilderWireframeGenerationContextV1(
        targets=tuple(
            _build_target_context(
                builder_context=builder_context,
                target=target,
                wireframes_by_item=wireframes_by_item,
                component_catalog=component_catalog,
                design_system_version_id=design_system_version_id,
            )
            for target in targets
        ),
        design_system_version_id=design_system_version_id,
        component_catalog=component_catalog,
        global_section_graph=analyze_global_section_dependencies(
            structure=builder_context.content_structure,
            wireframes_by_item=wireframes_by_item,
        ),
    )


def _build_target_context(
    *,
    builder_context: AgentRunBuilderContextV1,
    target: BuilderGenerationTargetV1,
    wireframes_by_item: dict[UUID, WireframeDocumentV1 | None],
    component_catalog: ComponentCatalogV1,
    design_system_version_id: UUID,
) -> BuilderWireframeGenerationTargetContextV1:
    item_id = UUID(str(target.item_id))
    nodes = (
        builder_context.content_structure.pages
        if target.kind == "page"
        else builder_context.content_structure.global_references
    )
    pins = (
        builder_context.manifest.page_versions
        if target.kind == "page"
        else builder_context.manifest.global_section_versions
    )
    node = next((item for item in nodes if UUID(str(item.item_id)) == item_id), None)
    if node is None:
        _raise_conflict("BUILDER_OPERATION_TARGET_NOT_FOUND")
    purpose = _require_planned_target(node)
    version_pin = next((pin for pin in pins if UUID(str(pin.item_id)) == item_id), None)
    if version_pin is None or item_id not in wireframes_by_item:
        _raise_conflict("BUILDER_CONTENT_VERSION_REQUIRED")
    current_wireframe = wireframes_by_item[item_id]
    if current_wireframe is not None and (
        UUID(str(current_wireframe.design_system_version_id)) != design_system_version_id
        or current_wireframe.component_catalog_version != component_catalog.catalog_version
    ):
        _raise_conflict("DESIGN_SYSTEM_COMPONENT_INCOMPATIBLE")
    return BuilderWireframeGenerationTargetContextV1(
        kind=target.kind,
        item_id=item_id,
        expected_draft_version=version_pin.version_number,
        purpose=purpose,
        section_intents=node.section_intents,
        current_wireframe=current_wireframe,
    )


def _require_planned_target(target: BuilderPagePlanningV1) -> str:
    if target.purpose is None or not target.section_intents:
        _raise_conflict("BUILDER_WIREFRAME_PLAN_REQUIRED")
    return target.purpose


async def resolve_wireframe_generation_context(
    *,
    builder_repository: SiteBuilderRepository,
    design_system_repository: ProjectDesignSystemsRepository,
    component_catalog_resolver: ComponentCatalogResolver,
    workspace_id: UUID,
    project_id: UUID,
    builder_context: AgentRunBuilderContextV1,
    targets: tuple[BuilderGenerationTargetV1, ...],
    conn: BaseDBAsyncClient,
) -> BuilderWireframeGenerationContextV1:
    if UUID(str(builder_context.workspace_id)) != workspace_id or UUID(str(builder_context.project_id)) != project_id:
        _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
    wireframes = await load_manifest_wireframes(
        repository=builder_repository,
        manifest=builder_context.manifest,
        structure=builder_context.content_structure,
        conn=conn,
    )
    component_catalog = await resolve_builder_component_catalog(
        repository=design_system_repository,
        resolver=component_catalog_resolver,
        workspace_id=workspace_id,
        manifest=builder_context.manifest,
        conn=conn,
    )
    return build_wireframe_generation_context(
        builder_context=builder_context,
        targets=targets,
        wireframes_by_item=wireframes,
        component_catalog=component_catalog,
    )


def build_design_generation_context(
    *,
    builder_context: AgentRunBuilderContextV1,
    targets: tuple[BuilderGenerationTargetV1, ...],
    wireframes_by_item: dict[UUID, WireframeDocumentV1 | None],
    blueprints_by_item: dict[UUID, VisualBlueprintDocumentV1 | None],
    design_system_manifest,
    component_catalog: ComponentCatalogV1,
) -> BuilderDesignGenerationContextV1:
    target_contexts: list[BuilderDesignGenerationTargetContextV1] = []
    for target in targets:
        item_id = UUID(str(target.item_id))
        nodes = (
            builder_context.content_structure.pages
            if target.kind == "page"
            else builder_context.content_structure.global_references
        )
        pins = (
            builder_context.manifest.page_versions
            if target.kind == "page"
            else builder_context.manifest.global_section_versions
        )
        if not any(UUID(str(node.item_id)) == item_id for node in nodes):
            _raise_conflict("BUILDER_OPERATION_TARGET_NOT_FOUND")
        pin = next((candidate for candidate in pins if UUID(str(candidate.item_id)) == item_id), None)
        wireframe = wireframes_by_item.get(item_id)
        if pin is None:
            _raise_conflict("BUILDER_CONTENT_VERSION_REQUIRED")
        if wireframe is None:
            _raise_conflict("BUILDER_WIREFRAME_REQUIRED")
        target_contexts.append(
            BuilderDesignGenerationTargetContextV1(
                kind=target.kind,
                item_id=item_id,
                expected_draft_version=pin.version_number,
                source_wireframe_checksum=canonical_hash(wireframe.model_dump(mode="json", by_alias=True)),
                wireframe=wireframe,
                current_visual_blueprint=blueprints_by_item.get(item_id),
            )
        )
    return BuilderDesignGenerationContextV1(
        targets=tuple(target_contexts),
        design_system_manifest=design_system_manifest,
        component_catalog=component_catalog,
    )


async def resolve_design_generation_context(
    *,
    builder_repository: SiteBuilderRepository,
    design_system_repository: ProjectDesignSystemsRepository,
    component_catalog_resolver: ComponentCatalogResolver,
    workspace_id: UUID,
    project_id: UUID,
    builder_context: AgentRunBuilderContextV1,
    targets: tuple[BuilderGenerationTargetV1, ...],
    conn: BaseDBAsyncClient,
) -> BuilderDesignGenerationContextV1:
    if UUID(str(builder_context.workspace_id)) != workspace_id or UUID(str(builder_context.project_id)) != project_id:
        _raise_conflict("AGENT_BUILDER_CONTEXT_REQUIRED")
    wireframes = await load_manifest_wireframes(
        repository=builder_repository,
        manifest=builder_context.manifest,
        structure=builder_context.content_structure,
        conn=conn,
    )
    blueprints = await load_manifest_visual_blueprints(
        repository=builder_repository,
        manifest=builder_context.manifest,
        structure=builder_context.content_structure,
        conn=conn,
    )
    design_contract = await resolve_builder_design_contract(
        repository=design_system_repository,
        resolver=component_catalog_resolver,
        workspace_id=workspace_id,
        manifest=builder_context.manifest,
        conn=conn,
    )
    return build_design_generation_context(
        builder_context=builder_context,
        targets=targets,
        wireframes_by_item=wireframes,
        blueprints_by_item=blueprints,
        design_system_manifest=design_contract.manifest,
        component_catalog=design_contract.catalog,
    )


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))


__all__ = [
    "BuilderGenerationPlanningPartition",
    "build_design_generation_context",
    "build_wireframe_generation_context",
    "partition_generation_targets_by_planning",
    "resolve_design_generation_context",
    "resolve_wireframe_generation_context",
]
