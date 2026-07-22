from __future__ import annotations

from typing import NoReturn
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.content.content_version import ContentVersionRecord
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.revision_presentations import (
    presentation_pins_match_manifest,
    project_wireframes_by_version,
)
from src.modules.projects.builder.schema import ContentStructureSnapshotV1, SiteRevisionManifestV1
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1


async def load_manifest_wireframes(
    *,
    repository: SiteBuilderRepository,
    manifest: SiteRevisionManifestV1,
    structure: ContentStructureSnapshotV1,
    conn: BaseDBAsyncClient,
) -> dict[UUID, WireframeDocumentV1 | None]:
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
    by_version = project_wireframes_by_version(manifest=manifest, presentations=presentations)
    if by_version is None:
        _raise_conflict("BUILDER_WIREFRAME_INVALID")
    return {item_id: by_version.get(UUID(str(version.id))) for item_id, version in version_by_item.items()}


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


__all__ = ["load_manifest_wireframes"]
