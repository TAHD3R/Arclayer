from __future__ import annotations

from collections.abc import Mapping, Sequence
from uuid import UUID

from pydantic import ValidationError

from src.models.content.component_binding import ComponentBindingRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.modules.projects.builder.schema import SiteRevisionManifestV1
from src.modules.projects.builder.snapshot import (
    aggregate_presentation_hash,
    build_global_section_version_pins,
    build_page_version_pins,
)
from src.modules.projects.builder.visual_blueprint_schema import VisualBlueprintDocumentV1
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1


def presentation_pins_match_manifest(
    *,
    manifest: SiteRevisionManifestV1,
    version_by_item: Mapping[UUID, ContentVersionRecord],
    presentations: Sequence[PresentationDocumentRecord],
    bindings: Sequence[ComponentBindingRecord],
) -> bool:
    page_ids = {UUID(str(pin.item_id)) for pin in manifest.page_versions}
    global_ids = {UUID(str(pin.item_id)) for pin in manifest.global_section_versions}
    if set(version_by_item) != page_ids | global_ids:
        return False
    computed_pages = build_page_version_pins(
        selected_versions={item_id: version_by_item[item_id] for item_id in page_ids},
        presentations=presentations,
        bindings=bindings,
    )
    computed_globals = build_global_section_version_pins(
        selected_versions={item_id: version_by_item[item_id] for item_id in global_ids},
        presentations=presentations,
        bindings=bindings,
    )
    return (
        computed_pages == manifest.page_versions
        and computed_globals == manifest.global_section_versions
        and aggregate_presentation_hash((*computed_pages, *computed_globals)) == manifest.presentation_set_hash
    )


def project_wireframes_by_version(
    *,
    manifest: SiteRevisionManifestV1,
    presentations: Sequence[PresentationDocumentRecord],
) -> dict[UUID, WireframeDocumentV1] | None:
    result: dict[UUID, WireframeDocumentV1] = {}
    item_by_version = {
        UUID(str(pin.content_version_id)): UUID(str(pin.item_id))
        for pin in (*manifest.page_versions, *manifest.global_section_versions)
    }
    for record in presentations:
        if str(record.kind) != "wireframe":
            continue
        version_id = UUID(str(record.version_id))
        try:
            wireframe = WireframeDocumentV1.model_validate(record.payload)
        except ValidationError:
            return None
        if (
            version_id in result
            or item_by_version.get(version_id) != UUID(str(wireframe.page_item_id))
            or UUID(str(wireframe.design_system_version_id)) != UUID(str(manifest.design_system_version_id))
        ):
            return None
        result[version_id] = wireframe
    return result


def project_visual_blueprints_by_version(
    *,
    manifest: SiteRevisionManifestV1,
    presentations: Sequence[PresentationDocumentRecord],
) -> dict[UUID, VisualBlueprintDocumentV1] | None:
    result: dict[UUID, VisualBlueprintDocumentV1] = {}
    item_by_version = {
        UUID(str(pin.content_version_id)): UUID(str(pin.item_id))
        for pin in (*manifest.page_versions, *manifest.global_section_versions)
    }
    for record in presentations:
        if str(record.kind) != "visual_blueprint":
            continue
        version_id = UUID(str(record.version_id))
        try:
            blueprint = VisualBlueprintDocumentV1.model_validate(record.payload)
        except ValidationError:
            return None
        if version_id in result or item_by_version.get(version_id) != UUID(str(blueprint.item_id)):
            return None
        result[version_id] = blueprint
    return result


__all__ = [
    "presentation_pins_match_manifest",
    "project_visual_blueprints_by_version",
    "project_wireframes_by_version",
]
