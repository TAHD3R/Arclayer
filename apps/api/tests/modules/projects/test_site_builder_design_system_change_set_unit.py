from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.models.builder._enums import BuilderProvenanceSource
from src.modules.projects.builder.change_set_revision import create_design_system_refresh_revision
from src.modules.projects.builder.change_set_schema import BuilderChangeSetPreviewRequest
from src.modules.projects.builder.design_system_change_set import analyze_design_system_change_set
from src.modules.projects.builder.design_system_change_set_schema import (
    BuilderDesignSystemRefreshOperationV1,
)
from src.modules.projects.builder.design_system_context import (
    ResolvedBuilderDesignSystem,
    resolve_builder_design_system_refresh,
)
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import (
    BuilderPageNodeSnapshotV1,
    BuilderPageVersionPinV1,
    ContentStructureSnapshotV1,
    SiteRevisionManifestV1,
)
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver


def _refresh_operation(*, operation_id: str = "refresh-design-system") -> dict[str, object]:
    return {
        "type": "design-system.refresh",
        "operationId": operation_id,
        "expectedAssignmentRevision": 3,
        "designSystemId": str(uuid4()),
        "versionId": str(uuid4()),
        "expectedManifestChecksum": canonical_hash({"tokens": {}}),
        "validationFindingHash": canonical_hash({"findings": []}),
    }


def _manifest(*, design_system_id: UUID, version_id: UUID, checksum: str) -> SiteRevisionManifestV1:
    workspace_id, project_id, site_id, environment_id = (uuid4() for _ in range(4))
    return SiteRevisionManifestV1(
        id=uuid4(),
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        revision_number=3,
        project_authoring_mode="builder_managed",
        content_structure_revision_id=uuid4(),
        content_structure_hash=canonical_hash({"pages": []}),
        page_versions=(),
        presentation_set_hash=canonical_hash([]),
        design_system_id=design_system_id,
        design_system_version_id=version_id,
        design_system_manifest_checksum=checksum,
        provenance_source=BuilderProvenanceSource.HUMAN,
        actor_user_id=uuid4(),
        created_at=datetime(2026, 7, 21, tzinfo=UTC),
        manifest_hash=canonical_hash({"siteRevision": 3}),
    )


def test_preview_request_rejects_mixed_sitemap_and_design_system_families() -> None:
    with pytest.raises(ValidationError, match="cannot mix Sitemap, Wireframe, Design, and Design System"):
        BuilderChangeSetPreviewRequest.model_validate({
            "baseRevisionId": uuid4(),
            "baseEtag": canonical_hash({}),
            "operations": [
                {
                    "type": "page.reorder",
                    "operationId": "reorder-page",
                    "itemId": str(uuid4()),
                    "sortOrder": 1,
                },
                _refresh_operation(),
            ],
        })


def test_preview_request_requires_exactly_one_design_system_refresh() -> None:
    with pytest.raises(ValidationError, match="requires exactly one operation"):
        BuilderChangeSetPreviewRequest.model_validate({
            "baseRevisionId": uuid4(),
            "baseEtag": canonical_hash({}),
            "operations": [
                _refresh_operation(operation_id="refresh-first"),
                _refresh_operation(operation_id="refresh-second"),
            ],
        })


def test_analysis_rejects_refresh_to_the_exact_pinned_design_system_version() -> None:
    design_system_id, version_id = uuid4(), uuid4()
    checksum = canonical_hash({"tokens": {}})
    manifest = _manifest(
        design_system_id=design_system_id,
        version_id=version_id,
        checksum=checksum,
    )
    resolved = cast(
        ResolvedBuilderDesignSystem,
        SimpleNamespace(
            assignment=SimpleNamespace(design_system_id=design_system_id),
            version=SimpleNamespace(id=version_id, manifest_checksum=checksum),
        ),
    )
    operation = BuilderDesignSystemRefreshOperationV1.model_validate(_refresh_operation())

    with pytest.raises(Conflict) as exc_info:
        analyze_design_system_change_set(
            manifest=manifest,
            resolved=resolved,
            operations=(operation,),
            provenance_source=BuilderProvenanceSource.HUMAN,
        )

    assert exc_info.value.error == "BUILDER_OPERATION_INVALID"
    assert exc_info.value.meta == {
        "operationId": "refresh-design-system",
        "reason": "design_system_already_pinned",
    }


async def test_refresh_resolution_rejects_assignment_revision_drift() -> None:
    operation = BuilderDesignSystemRefreshOperationV1.model_validate(_refresh_operation())
    repository = SimpleNamespace(
        get_assignment=AsyncMock(
            return_value=SimpleNamespace(
                metadata_revision=2,
                design_system_id=UUID(str(operation.design_system_id)),
                design_system_version_id=UUID(str(operation.version_id)),
                manifest_checksum=operation.expected_manifest_checksum,
                validation_finding_hash=operation.validation_finding_hash,
            )
        )
    )

    with pytest.raises(Conflict) as exc_info:
        await resolve_builder_design_system_refresh(
            repository=cast(ProjectDesignSystemsRepository, repository),
            component_catalog_resolver=cast(ComponentCatalogResolver, object()),
            workspace_id=uuid4(),
            project_id=uuid4(),
            operation=operation,
            conn=cast(BaseDBAsyncClient, object()),
        )

    assert exc_info.value.error == "DESIGN_SYSTEM_REVISION_CONFLICT"


async def test_refresh_revision_reuses_content_structure_and_page_versions() -> None:
    old_system_id, old_version_id = uuid4(), uuid4()
    base = _manifest(
        design_system_id=old_system_id,
        version_id=old_version_id,
        checksum=canonical_hash({"tokens": {"old": True}}),
    )
    page_id = uuid4()
    structure = ContentStructureSnapshotV1(
        workspace_id=UUID(str(base.workspace_id)),
        project_id=UUID(str(base.project_id)),
        site_id=UUID(str(base.site_id)),
        environment_id=UUID(str(base.environment_id)),
        locales=("zh-CN",),
        pages=(BuilderPageNodeSnapshotV1(item_id=page_id, sort_order=0),),
    )
    page_pin = BuilderPageVersionPinV1(
        item_id=page_id,
        content_version_id=uuid4(),
        version_number=2,
        presentation_set_hash=canonical_hash(["presentation"]),
        component_binding_set_hash=canonical_hash(["binding"]),
    )
    structure_hash = canonical_hash(structure.model_dump(mode="json", by_alias=True))
    base = base.model_copy(
        update={
            "content_structure_hash": structure_hash,
            "page_versions": (page_pin,),
            "presentation_set_hash": canonical_hash(["presentation-set"]),
        }
    )
    structure_record = SimpleNamespace(
        id=UUID(str(base.content_structure_revision_id)),
        revision_number=2,
        parent_revision_id=uuid4(),
        structure_hash=structure_hash,
        created_at=datetime(2026, 7, 20, tzinfo=UTC),
    )
    repository = SimpleNamespace(
        get_structure_revision=AsyncMock(return_value=structure_record),
        create_site_revision=AsyncMock(),
        get_status=AsyncMock(
            return_value=SimpleNamespace(
                status_revision=1,
                readiness_findings=[],
                validator_version="builder-foundation-v1",
            )
        ),
        update_status=AsyncMock(),
        create_status=AsyncMock(),
    )
    next_system_id, next_version_id = uuid4(), uuid4()
    next_checksum = canonical_hash({"tokens": {"next": True}})

    applied = await create_design_system_refresh_revision(
        repository=cast(SiteBuilderRepository, repository),
        base_manifest=base,
        base_structure=structure,
        design_system_id=next_system_id,
        design_system_version_id=next_version_id,
        design_system_manifest_checksum=next_checksum,
        provenance_source=BuilderProvenanceSource.HUMAN,
        actor_user_id=uuid4(),
        agent_run_id=None,
        agent_id=None,
        agent_version_id=None,
        agent_assignment_id=None,
        conn=cast(BaseDBAsyncClient, object()),
    )

    assert not hasattr(repository, "create_structure_revision")
    assert applied.content_structure_revision.id == base.content_structure_revision_id
    assert applied.content_structure_revision.snapshot == structure
    assert applied.site_revision.revision_number == 4
    assert applied.site_revision.content_structure_revision_id == base.content_structure_revision_id
    assert applied.site_revision.content_structure_hash == base.content_structure_hash
    assert applied.site_revision.page_versions == base.page_versions
    assert applied.site_revision.presentation_set_hash == base.presentation_set_hash
    assert applied.site_revision.design_system_id == next_system_id
    assert applied.site_revision.design_system_version_id == next_version_id
    assert applied.site_revision.design_system_manifest_checksum == next_checksum
