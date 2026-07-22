from __future__ import annotations

from typing import NoReturn
from uuid import UUID

from pydantic import ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.content.content_version import ContentVersionRecord
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.revision_presentations import presentation_pins_match_manifest
from src.modules.projects.builder.schema import ContentStructureSnapshotV1, SiteRevisionManifestV1
from src.modules.projects.builder.visual_blueprint_schema import VisualBlueprintDocumentV1


async def load_manifest_visual_blueprints(
    *,
    repository: SiteBuilderRepository,
    manifest: SiteRevisionManifestV1,
    structure: ContentStructureSnapshotV1,
    conn: BaseDBAsyncClient,
) -> dict[UUID, VisualBlueprintDocumentV1 | None]:
    item_ids = [UUID(str(host.item_id)) for host in (*structure.pages, *structure.global_references)]
    versions = await repository.list_content_versions(item_ids=item_ids, conn=conn)
    version_by_item = _select_manifest_versions(manifest=manifest, item_ids=set(item_ids), versions=versions)
    presentations, bindings = await repository.list_presentations_and_bindings(
        version_ids=[version.id for version in version_by_item.values()],
        conn=conn,
    )
    if not presentation_pins_match_manifest(
        manifest=manifest,
        version_by_item=version_by_item,
        presentations=presentations,
        bindings=bindings,
    ):
        _raise_conflict("BUILDER_PRESENTATION_SET_INVALID")
    version_to_item = {UUID(str(version.id)): item_id for item_id, version in version_by_item.items()}
    result: dict[UUID, VisualBlueprintDocumentV1 | None] = dict.fromkeys(item_ids)
    for record in presentations:
        if str(record.kind) != "visual_blueprint":
            continue
        item_id = version_to_item.get(UUID(str(record.version_id)))
        if item_id is None or result[item_id] is not None:
            _raise_conflict("BUILDER_VISUAL_BLUEPRINT_INVALID")
        try:
            document = VisualBlueprintDocumentV1.model_validate(record.payload)
        except ValidationError:
            _raise_conflict("BUILDER_VISUAL_BLUEPRINT_INVALID")
        if UUID(str(document.item_id)) != item_id:
            _raise_conflict("BUILDER_VISUAL_BLUEPRINT_INVALID")
        result[item_id] = document
    return result


def _select_manifest_versions(
    *,
    manifest: SiteRevisionManifestV1,
    item_ids: set[UUID],
    versions: list[ContentVersionRecord],
) -> dict[UUID, ContentVersionRecord]:
    pins = {UUID(str(pin.item_id)): pin for pin in (*manifest.page_versions, *manifest.global_section_versions)}
    versions_by_id = {UUID(str(version.id)): version for version in versions}
    if set(pins) != item_ids:
        _raise_conflict("BUILDER_CONTENT_VERSION_REQUIRED")
    selected: dict[UUID, ContentVersionRecord] = {}
    for item_id, pin in pins.items():
        version = versions_by_id.get(UUID(str(pin.content_version_id)))
        if version is None or UUID(str(version.item_id)) != item_id or int(version.version) != pin.version_number:
            _raise_conflict("BUILDER_CONTENT_VERSION_REQUIRED")
        selected[item_id] = version
    return selected


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))


__all__ = ["load_manifest_visual_blueprints"]
