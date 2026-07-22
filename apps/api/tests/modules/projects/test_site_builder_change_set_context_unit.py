from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.builder._enums import BuilderProvenanceSource
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.projects.builder import change_set_context as context_module
from src.modules.projects.builder.change_set_context import resolve_builder_change_set_preview_context
from src.modules.projects.builder.change_set_schema import (
    BuilderChangeSetPreviewRequest,
    BuilderGlobalSectionDeleteOperationV1,
)
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import ContentStructureSnapshotV1, SiteRevisionManifestV1
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver


@pytest.mark.asyncio
async def test_delete_preview_loads_manifest_page_and_global_section_wireframes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id, project_id, site_id, environment_id = (uuid4() for _ in range(4))
    actor_user_id, runtime_id, revision_id, global_section_id = (uuid4() for _ in range(4))
    manifest = SiteRevisionManifestV1(
        id=revision_id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        revision_number=1,
        project_authoring_mode="builder_managed",
        content_structure_revision_id=uuid4(),
        content_structure_hash=canonical_hash({"pages": []}),
        page_versions=(),
        presentation_set_hash=canonical_hash([]),
        design_system_id=uuid4(),
        design_system_version_id=uuid4(),
        design_system_manifest_checksum=canonical_hash({"tokens": {}}),
        provenance_source=BuilderProvenanceSource.HUMAN,
        actor_user_id=actor_user_id,
        created_at=datetime(2026, 7, 22, tzinfo=UTC),
        manifest_hash=canonical_hash({"revision": 1}),
    )
    structure = ContentStructureSnapshotV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        locales=("en-US",),
        pages=(),
    )
    operation = BuilderGlobalSectionDeleteOperationV1(
        type="global_section.delete",
        operation_id="delete-site-header",
        item_id=global_section_id,
        expected_draft_version=4,
    )
    payload = BuilderChangeSetPreviewRequest(
        base_revision_id=revision_id,
        base_etag=manifest.manifest_hash,
        operations=(operation,),
    )
    repository = SimpleNamespace(
        get_site=AsyncMock(return_value=SimpleNamespace(id=site_id)),
        get_default_preview_environment=AsyncMock(return_value=SimpleNamespace(id=environment_id)),
    )
    require_manifest = AsyncMock(return_value=manifest)
    require_structure = AsyncMock(return_value=structure)
    load_wireframes = AsyncMock(return_value={global_section_id: None})
    monkeypatch.setattr(context_module, "_require_current_manifest", require_manifest)
    monkeypatch.setattr(
        context_module,
        "require_builder_structure_revision",
        require_structure,
    )
    monkeypatch.setattr(context_module, "load_manifest_wireframes", load_wireframes)
    conn = cast(BaseDBAsyncClient, object())

    result = await resolve_builder_change_set_preview_context(
        repository=cast(SiteBuilderRepository, repository),
        agent_catalog_service=cast(AgentCatalogService, object()),
        design_system_repository=cast(ProjectDesignSystemsRepository, object()),
        component_catalog_resolver=cast(ComponentCatalogResolver, object()),
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
        actor_user_id=actor_user_id,
        payload=payload,
        conn=conn,
    )

    load_wireframes.assert_awaited_once_with(
        repository=repository,
        manifest=manifest,
        structure=structure,
        conn=conn,
    )
    assert result.wireframes_by_item == {global_section_id: None}
    assert result.component_catalog is None
    assert result.design_system_refresh is None
