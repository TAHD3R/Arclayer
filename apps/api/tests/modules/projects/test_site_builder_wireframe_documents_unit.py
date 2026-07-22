from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.builder._enums import BuilderProvenanceSource
from src.modules.projects.builder.schema import (
    BuilderGlobalSectionNodeSnapshotV1,
    BuilderPageNodeSnapshotV1,
    ContentStructureSnapshotV1,
    SiteRevisionManifestV1,
)
from src.modules.projects.builder.snapshot import (
    aggregate_presentation_hash,
    build_global_section_version_pins,
    build_page_version_pins,
    canonical_hash,
)
from src.modules.projects.builder.wireframe_documents import load_manifest_wireframes
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1


async def test_load_manifest_wireframes_returns_exact_page_and_global_documents() -> None:
    workspace_id, project_id, site_id, environment_id = (uuid4() for _ in range(4))
    page_id, global_id = uuid4(), uuid4()
    page_version = SimpleNamespace(id=uuid4(), item_id=page_id, version=2)
    global_version = SimpleNamespace(id=uuid4(), item_id=global_id, version=1)
    design_system_id, design_system_version_id = uuid4(), uuid4()
    structure = ContentStructureSnapshotV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        locales=("zh-CN",),
        pages=(BuilderPageNodeSnapshotV1(item_id=page_id, sort_order=0),),
        global_references=(
            BuilderGlobalSectionNodeSnapshotV1(
                item_id=global_id,
                locale="zh-CN",
                slug="site-header",
            ),
        ),
    )
    page_wireframe = _wireframe(page_id, design_system_version_id)
    global_wireframe = _wireframe(global_id, design_system_version_id)
    presentations = [
        SimpleNamespace(
            version_id=page_version.id,
            kind="wireframe",
            payload=page_wireframe.model_dump(mode="json", by_alias=True),
        ),
        SimpleNamespace(
            version_id=global_version.id,
            kind="wireframe",
            payload=global_wireframe.model_dump(mode="json", by_alias=True),
        ),
    ]
    page_pins = build_page_version_pins(
        selected_versions={page_id: cast(Any, page_version)},
        presentations=cast(Any, presentations),
        bindings=[],
    )
    global_pins = build_global_section_version_pins(
        selected_versions={global_id: cast(Any, global_version)},
        presentations=cast(Any, presentations),
        bindings=[],
    )
    manifest = SiteRevisionManifestV1(
        id=uuid4(),
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        revision_number=1,
        project_authoring_mode="builder_managed",
        content_structure_revision_id=uuid4(),
        content_structure_hash=canonical_hash(structure.model_dump(mode="json", by_alias=True)),
        page_versions=page_pins,
        global_section_versions=global_pins,
        presentation_set_hash=aggregate_presentation_hash((*page_pins, *global_pins)),
        design_system_id=design_system_id,
        design_system_version_id=design_system_version_id,
        design_system_manifest_checksum=canonical_hash({"tokens": {}}),
        provenance_source=BuilderProvenanceSource.HUMAN,
        actor_user_id=uuid4(),
        created_at=datetime(2026, 7, 22, tzinfo=UTC),
        manifest_hash=canonical_hash({"revision": 1}),
    )
    repository = SimpleNamespace(
        list_content_versions=AsyncMock(return_value=[page_version, global_version]),
        list_presentations_and_bindings=AsyncMock(return_value=(presentations, [])),
    )
    conn = cast(BaseDBAsyncClient, object())

    result = await load_manifest_wireframes(
        repository=cast(Any, repository),
        manifest=manifest,
        structure=structure,
        conn=conn,
    )

    assert result == {page_id: page_wireframe, global_id: global_wireframe}
    repository.list_content_versions.assert_awaited_once_with(
        item_ids=[page_id, global_id],
        conn=conn,
    )


def _wireframe(item_id: UUID, design_system_version_id: UUID) -> WireframeDocumentV1:
    return WireframeDocumentV1(
        page_item_id=item_id,
        design_system_version_id=design_system_version_id,
        component_catalog_version="arclayer-wireframe-v1",
    )
