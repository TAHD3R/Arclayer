from __future__ import annotations

from uuid import UUID

from src.modules.projects.builder.global_section_graph import analyze_global_section_dependencies
from src.modules.projects.builder.schema import (
    BuilderGlobalSectionNodeSnapshotV1,
    BuilderPageNodeSnapshotV1,
    ContentStructureSnapshotV1,
)
from src.modules.projects.builder.wireframe_schema import (
    WireframeDocumentV1,
    WireframeSectionV1,
)


def _id(value: int) -> UUID:
    return UUID(int=value)


def _wireframe(host_id: UUID, *references: tuple[str, UUID]) -> WireframeDocumentV1:
    return WireframeDocumentV1(
        page_item_id=host_id,
        design_system_version_id=_id(100),
        component_catalog_version="catalog-v1",
        sections=tuple(
            WireframeSectionV1(
                id=section_id,
                intent_id=f"intent.{section_id}",
                component_key="layout.section",
                variant_key="default",
                label=section_id,
                global_reference_id=target_id,
            )
            for section_id, target_id in references
        ),
    )


def test_dependency_graph_reports_exact_unknown_missing_and_cycle_evidence() -> None:
    page_id, header_id, navigation_id, footer_id, unknown_id = (_id(value) for value in range(1, 6))
    structure = ContentStructureSnapshotV1(
        workspace_id=_id(10),
        project_id=_id(11),
        site_id=_id(12),
        environment_id=_id(13),
        locales=("en-US",),
        pages=(BuilderPageNodeSnapshotV1(item_id=page_id, sort_order=0),),
        global_references=(
            BuilderGlobalSectionNodeSnapshotV1(item_id=header_id, locale="en-US", slug="header"),
            BuilderGlobalSectionNodeSnapshotV1(
                item_id=navigation_id,
                locale="en-US",
                slug="navigation",
            ),
            BuilderGlobalSectionNodeSnapshotV1(item_id=footer_id, locale="en-US", slug="footer"),
        ),
    )

    graph = analyze_global_section_dependencies(
        structure=structure,
        wireframes_by_item={
            page_id: _wireframe(
                page_id,
                ("header-reference", header_id),
                ("footer-reference", footer_id),
                ("unknown-reference", unknown_id),
            ),
            header_id: _wireframe(header_id, ("navigation-reference", navigation_id)),
            navigation_id: _wireframe(navigation_id, ("header-reference", header_id)),
            footer_id: None,
        },
    )

    assert [reference.host_kind for reference in graph.references] == [
        "page",
        "page",
        "page",
        "global_section",
        "global_section",
    ]
    assert graph.unknown_references == (graph.references[2],)
    assert graph.missing_wireframe_references == (graph.references[1],)
    assert graph.cycles[0].item_path == (header_id, navigation_id, header_id)
