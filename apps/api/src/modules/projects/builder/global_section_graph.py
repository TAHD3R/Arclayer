from __future__ import annotations

from collections.abc import Mapping
from uuid import UUID

from src.modules.projects.builder.global_section_schema import (
    BuilderGlobalSectionCycleOut,
    BuilderGlobalSectionDependencyGraphOut,
    BuilderGlobalSectionReferenceOut,
)
from src.modules.projects.builder.schema import ContentStructureSnapshotV1
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1


def analyze_global_section_dependencies(
    *,
    structure: ContentStructureSnapshotV1,
    wireframes_by_item: Mapping[UUID, WireframeDocumentV1 | None],
) -> BuilderGlobalSectionDependencyGraphOut:
    page_ids = {UUID(str(page.item_id)) for page in structure.pages}
    global_ids = {UUID(str(section.item_id)) for section in structure.global_references}
    references = tuple(
        reference
        for host_id in sorted((*page_ids, *global_ids), key=lambda item_id: str(item_id))
        if (document := wireframes_by_item.get(host_id)) is not None
        for section in document.sections
        if section.global_reference_id is not None
        for reference in (
            BuilderGlobalSectionReferenceOut(
                host_kind="page" if host_id in page_ids else "global_section",
                host_item_id=host_id,
                host_section_id=section.id,
                target_item_id=UUID(str(section.global_reference_id)),
            ),
        )
    )
    unknown = tuple(reference for reference in references if UUID(str(reference.target_item_id)) not in global_ids)
    missing_wireframes = tuple(
        reference
        for reference in references
        if UUID(str(reference.target_item_id)) in global_ids
        and wireframes_by_item.get(UUID(str(reference.target_item_id))) is None
    )
    return BuilderGlobalSectionDependencyGraphOut(
        references=references,
        unknown_references=unknown,
        missing_wireframe_references=missing_wireframes,
        cycles=_global_cycle_paths(global_ids=global_ids, references=references),
    )


def _global_cycle_paths(
    *,
    global_ids: set[UUID],
    references: tuple[BuilderGlobalSectionReferenceOut, ...],
) -> tuple[BuilderGlobalSectionCycleOut, ...]:
    adjacency = {item_id: set[UUID]() for item_id in global_ids}
    for reference in references:
        source_id = UUID(str(reference.host_item_id))
        target_id = UUID(str(reference.target_item_id))
        if reference.host_kind == "global_section" and target_id in global_ids:
            adjacency[source_id].add(target_id)
    components = _strongly_connected_components(adjacency)
    cyclic = (
        component
        for component in components
        if len(component) > 1 or next(iter(component)) in adjacency[next(iter(component))]
    )
    return tuple(BuilderGlobalSectionCycleOut(item_path=_find_cycle_path(component, adjacency)) for component in cyclic)


def _strongly_connected_components(adjacency: Mapping[UUID, set[UUID]]) -> tuple[frozenset[UUID], ...]:
    index = 0
    indices: dict[UUID, int] = {}
    lowlinks: dict[UUID, int] = {}
    stack: list[UUID] = []
    on_stack: set[UUID] = set()
    components: list[frozenset[UUID]] = []

    def visit(node: UUID) -> None:
        nonlocal index
        indices[node] = index
        lowlinks[node] = index
        index += 1
        stack.append(node)
        on_stack.add(node)
        for target in sorted(adjacency[node], key=lambda item_id: str(item_id)):
            if target not in indices:
                visit(target)
                lowlinks[node] = min(lowlinks[node], lowlinks[target])
            elif target in on_stack:
                lowlinks[node] = min(lowlinks[node], indices[target])
        if lowlinks[node] != indices[node]:
            return
        component: set[UUID] = set()
        while stack:
            member = stack.pop()
            on_stack.remove(member)
            component.add(member)
            if member == node:
                break
        components.append(frozenset(component))

    for node in sorted(adjacency, key=lambda item_id: str(item_id)):
        if node not in indices:
            visit(node)
    return tuple(
        sorted(
            components,
            key=lambda component: str(min(component, key=lambda item_id: str(item_id))),
        )
    )


def _find_cycle_path(
    component: frozenset[UUID],
    adjacency: Mapping[UUID, set[UUID]],
) -> tuple[UUID, ...]:
    start = min(component, key=lambda item_id: str(item_id))

    def search(node: UUID, path: tuple[UUID, ...], visited: frozenset[UUID]) -> tuple[UUID, ...] | None:
        for target in sorted(adjacency[node], key=lambda item_id: str(item_id)):
            if target == start:
                return (*path, start)
            if target in component and target not in visited:
                result = search(target, (*path, target), visited | {target})
                if result is not None:
                    return result
        return None

    result = search(start, (start,), frozenset({start}))
    if result is None:
        raise RuntimeError("Cyclic global-section component did not yield a cycle path")
    return result


__all__ = ["analyze_global_section_dependencies"]
