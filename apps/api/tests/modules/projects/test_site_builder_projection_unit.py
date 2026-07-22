from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Literal, cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject, JsonValue
from src.core.exceptions import Conflict, NotFound
from src.models.builder._enums import BuilderProvenanceSource, SiteRevisionLifecycleStatus
from src.models.builder.content_structure import ContentStructureRevisionRecord
from src.models.builder.site_revision import SiteRevisionManifestRecord, SiteRevisionStatusRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.modules.projects.builder.manifest import RootSiteRevisionManifestInput, build_root_site_revision_manifest
from src.modules.projects.builder.projection import _wireframe_traceability, get_project_builder_revision
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import (
    BuilderGlobalSectionNodeSnapshotV1,
    BuilderGlobalSectionVersionPinV1,
    BuilderPageNodeSnapshotV1,
    BuilderPageVersionPinV1,
    BuilderRouteSnapshotV1,
    BuilderSectionIntentV1,
    ContentStructureSnapshotV1,
)
from src.modules.projects.builder.snapshot import aggregate_presentation_hash, canonical_hash
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1


def _wireframe_payload(*, item_id: UUID, design_system_version_id: UUID) -> JsonObject:
    return {
        "schemaVersion": 1,
        "pageItemId": str(item_id),
        "designSystemVersionId": str(design_system_version_id),
        "componentCatalogVersion": "arclayer-wireframe-v1",
        "sections": [
            {
                "id": "hero",
                "intentId": "intent.hero",
                "componentKey": "landing.hero",
                "variantKey": "default",
                "label": "Hero",
                "bindings": [
                    {"kind": "field", "slotKey": "headline", "fieldKey": "heroHeadline"},
                    {"kind": "missing", "slotKey": "media", "reason": "media"},
                ],
                "responsiveRules": [
                    {"breakpoint": "desktop", "layout": "split", "columns": 2, "visible": True},
                    {"breakpoint": "mobile", "layout": "stack", "columns": 1, "visible": True},
                ],
            }
        ],
    }


def _revision_fixture(
    *,
    wireframe_state: Literal["valid", "missing", "wrong_design", "duplicate_sections"] = "valid",
    include_global_section: bool = False,
) -> tuple[UUID, UUID, UUID, SiteBuilderRepository]:
    now = datetime(2026, 7, 21, tzinfo=UTC)
    workspace_id, project_id, site_id, environment_id = (uuid4() for _ in range(4))
    structure_id, version_id, item_id = uuid4(), uuid4(), uuid4()
    global_item_id, global_version_id = uuid4(), uuid4()
    design_system_id, design_system_version_id = uuid4(), uuid4()
    structure = ContentStructureSnapshotV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        locales=("en-US",),
        pages=(
            BuilderPageNodeSnapshotV1(
                item_id=item_id,
                sort_order=0,
                routes=(BuilderRouteSnapshotV1(locale="en-US", path="/about", is_active=True),),
                purpose="Explain the product story",
                section_intents=(
                    BuilderSectionIntentV1(
                        id="intent.hero",
                        label="Hero",
                        goal="Establish the primary value proposition",
                    ),
                ),
            ),
        ),
        global_references=(
            BuilderGlobalSectionNodeSnapshotV1(
                item_id=global_item_id,
                locale="en-US",
                slug="site-header",
                purpose="Provide shared navigation",
                section_intents=(
                    BuilderSectionIntentV1(
                        id="intent.navigation",
                        label="Navigation",
                        goal="Help visitors reach primary destinations",
                    ),
                ),
            ),
        )
        if include_global_section
        else (),
    )
    structure_hash = canonical_hash(structure.model_dump(mode="json", by_alias=True))
    presentations: list[PresentationDocumentRecord] = []
    if wireframe_state != "missing":
        payload = _wireframe_payload(
            item_id=item_id,
            design_system_version_id=(uuid4() if wireframe_state == "wrong_design" else design_system_version_id),
        )
        if wireframe_state == "duplicate_sections":
            payload = {**payload, "sections": [*cast(list[JsonObject], payload["sections"])] * 2}
        presentations.append(
            cast(
                PresentationDocumentRecord,
                SimpleNamespace(version_id=version_id, kind="wireframe", payload=payload),
            )
        )
        if include_global_section:
            cast(list[JsonObject], payload["sections"])[0]["globalReferenceId"] = str(global_item_id)
            presentations.append(
                cast(
                    PresentationDocumentRecord,
                    SimpleNamespace(
                        version_id=global_version_id,
                        kind="wireframe",
                        payload={
                            **_wireframe_payload(
                                item_id=global_item_id,
                                design_system_version_id=design_system_version_id,
                            ),
                            "sections": [
                                {
                                    "id": "navigation",
                                    "intentId": "intent.navigation",
                                    "componentKey": "site.navigation",
                                    "variantKey": "default",
                                    "label": "Navigation",
                                }
                            ],
                        },
                    ),
                )
            )
    presentation_payloads: list[JsonObject] = [
        {"kind": str(record.kind), "payload": cast(JsonValue, record.payload)} for record in presentations
    ]
    pin = BuilderPageVersionPinV1(
        item_id=item_id,
        content_version_id=version_id,
        version_number=2,
        presentation_set_hash=canonical_hash(cast(JsonValue, presentation_payloads[:1])),
        component_binding_set_hash=canonical_hash([]),
    )
    global_pin = BuilderGlobalSectionVersionPinV1(
        item_id=global_item_id,
        content_version_id=global_version_id,
        version_number=1,
        presentation_set_hash=canonical_hash(cast(JsonValue, presentation_payloads[1:2])),
        component_binding_set_hash=canonical_hash([]),
    )
    manifest = build_root_site_revision_manifest(
        RootSiteRevisionManifestInput(
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            content_structure_revision_id=structure_id,
            content_structure_hash=structure_hash,
            page_versions=(pin,),
            global_section_versions=(global_pin,) if include_global_section else (),
            presentation_set_hash=aggregate_presentation_hash((pin, global_pin) if include_global_section else (pin,)),
            design_system_id=design_system_id,
            design_system_version_id=design_system_version_id,
            design_system_manifest_checksum=canonical_hash({"tokens": {}}),
            provenance_source=BuilderProvenanceSource.HUMAN,
            actor_user_id=uuid4(),
            agent_run_id=None,
            correlation_id="builder-revision-unit",
            created_at=now,
        )
    )
    site_revision = cast(
        SiteRevisionManifestRecord,
        SimpleNamespace(
            id=manifest.id,
            workspace_id=workspace_id,
            manifest_hash=manifest.manifest_hash,
            manifest_snapshot=manifest.model_dump(mode="json", by_alias=True),
        ),
    )
    structure_record = cast(
        ContentStructureRevisionRecord,
        SimpleNamespace(
            id=structure_id,
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            revision_number=1,
            parent_revision_id=None,
            structure_hash=structure_hash,
            structure_snapshot=structure.model_dump(mode="json", by_alias=True),
            created_at=now,
        ),
    )
    status = cast(
        SiteRevisionStatusRecord,
        SimpleNamespace(
            site_revision_id=manifest.id,
            status=SiteRevisionLifecycleStatus.DRAFT,
            status_revision=1,
            readiness_findings=[],
            validator_version="builder-v1",
            etag=canonical_hash({"revisionId": str(manifest.id)}),
            calculated_at=now,
        ),
    )
    version = cast(
        ContentVersionRecord,
        SimpleNamespace(
            id=version_id,
            item_id=item_id,
            version=2,
            fields_snapshot={"title": "About", "summary": "Our product story"},
        ),
    )
    global_version = cast(
        ContentVersionRecord,
        SimpleNamespace(
            id=global_version_id,
            item_id=global_item_id,
            version=1,
            fields_snapshot={"title": "Site header", "summary": "Shared primary navigation"},
        ),
    )
    repository = cast(
        SiteBuilderRepository,
        SimpleNamespace(
            get_site_revision=AsyncMock(return_value=site_revision),
            get_structure_revision=AsyncMock(return_value=structure_record),
            get_status=AsyncMock(return_value=status),
            list_content_versions=AsyncMock(
                return_value=[version, global_version] if include_global_section else [version]
            ),
            list_presentations_and_bindings=AsyncMock(return_value=(presentations, [])),
        ),
    )
    return workspace_id, project_id, UUID(str(manifest.id)), repository


@pytest.mark.asyncio
async def test_builder_revision_returns_exact_pinned_page_projection() -> None:
    workspace_id, project_id, revision_id, repository = _revision_fixture()

    result = await get_project_builder_revision(
        repository=repository,
        workspace_id=workspace_id,
        project_id=project_id,
        revision_id=revision_id,
        conn=cast(BaseDBAsyncClient, SimpleNamespace()),
    )

    assert result.site_revision.id == revision_id
    assert result.content_structure_revision.snapshot.pages[0].routes[0].path == "/about"
    assert result.pages[0].title == "About"
    assert result.pages[0].summary == "Our product story"
    assert result.pages[0].version_number == 2
    assert result.pages[0].purpose == "Explain the product story"
    assert result.pages[0].section_intents[0].id == "intent.hero"
    assert result.pages[0].wireframe_traceability.status == "aligned"
    assert result.pages[0].wireframe_traceability.missing_intent_ids == ()
    assert result.pages[0].wireframe_traceability.orphaned_section_ids == ()
    assert result.pages[0].wireframe is not None
    assert result.pages[0].wireframe_checksum == canonical_hash(
        cast(JsonValue, result.pages[0].wireframe.model_dump(mode="json", by_alias=True))
    )
    assert result.pages[0].wireframe.sections[0].component_key == "landing.hero"


@pytest.mark.asyncio
async def test_builder_revision_projects_exact_global_section_dependency_graph() -> None:
    workspace_id, project_id, revision_id, repository = _revision_fixture(include_global_section=True)

    result = await get_project_builder_revision(
        repository=repository,
        workspace_id=workspace_id,
        project_id=project_id,
        revision_id=revision_id,
        conn=cast(BaseDBAsyncClient, SimpleNamespace()),
    )

    assert result.global_sections[0].title == "Site header"
    assert result.global_sections[0].version_number == 1
    assert result.global_sections[0].wireframe_traceability.status == "aligned"
    assert result.global_sections[0].wireframe_checksum is not None
    assert result.global_section_graph.references[0].host_kind == "page"
    assert result.global_section_graph.references[0].host_section_id == "hero"
    assert result.global_section_graph.unknown_references == ()
    assert result.global_section_graph.missing_wireframe_references == ()
    assert result.global_section_graph.cycles == ()


@pytest.mark.parametrize(
    ("intent_ids", "wireframe_intents", "expected_status", "missing", "orphaned"),
    [
        ((), (), "unplanned", (), ()),
        (("intent.hero",), (), "not_started", ("intent.hero",), ()),
        (("intent.hero", "intent.proof"), ("intent.hero",), "partial", ("intent.proof",), ()),
        (("intent.hero",), ("intent.hero",), "aligned", (), ()),
        ((), ("intent.legacy",), "orphaned", (), ("section-0",)),
        (("intent.hero",), ("intent.legacy",), "orphaned", ("intent.hero",), ("section-0",)),
    ],
)
def test_wireframe_traceability_is_projected_by_the_server(
    intent_ids: tuple[str, ...],
    wireframe_intents: tuple[str, ...],
    expected_status: str,
    missing: tuple[str, ...],
    orphaned: tuple[str, ...],
) -> None:
    item_id, design_system_version_id = uuid4(), uuid4()
    intents = tuple(
        BuilderSectionIntentV1(id=intent_id, label=intent_id, goal=f"Goal for {intent_id}") for intent_id in intent_ids
    )
    wireframe = (
        WireframeDocumentV1.model_validate({
            **_wireframe_payload(item_id=item_id, design_system_version_id=design_system_version_id),
            "sections": [
                {
                    "id": f"section-{index}",
                    "intentId": intent_id,
                    "componentKey": "landing.hero",
                    "variantKey": "default",
                    "label": "Section",
                }
                for index, intent_id in enumerate(wireframe_intents)
            ],
        })
        if wireframe_intents
        else None
    )

    result = _wireframe_traceability(section_intents=intents, wireframe=wireframe)

    assert result.status == expected_status
    assert result.missing_intent_ids == missing
    assert result.orphaned_section_ids == orphaned


@pytest.mark.asyncio
async def test_builder_revision_hides_cross_workspace_revision() -> None:
    _, project_id, revision_id, repository = _revision_fixture()

    with pytest.raises(NotFound) as exc_info:
        await get_project_builder_revision(
            repository=repository,
            workspace_id=uuid4(),
            project_id=project_id,
            revision_id=revision_id,
            conn=cast(BaseDBAsyncClient, SimpleNamespace()),
        )

    assert getattr(exc_info.value, "error", None) == "SITE_REVISION_NOT_FOUND"


@pytest.mark.asyncio
async def test_builder_revision_rejects_missing_pinned_page_title() -> None:
    workspace_id, project_id, revision_id, repository = _revision_fixture()
    list_content_versions = cast(AsyncMock, repository.list_content_versions)
    list_content_versions.return_value = []

    with pytest.raises(Conflict) as exc_info:
        await get_project_builder_revision(
            repository=repository,
            workspace_id=workspace_id,
            project_id=project_id,
            revision_id=revision_id,
            conn=cast(BaseDBAsyncClient, SimpleNamespace()),
        )

    assert getattr(exc_info.value, "error", None) == "BUILDER_CONTENT_VERSION_REQUIRED"


@pytest.mark.asyncio
async def test_builder_revision_rejects_wireframe_with_wrong_design_system_pin() -> None:
    workspace_id, project_id, revision_id, repository = _revision_fixture(wireframe_state="wrong_design")

    with pytest.raises(Conflict) as exc_info:
        await get_project_builder_revision(
            repository=repository,
            workspace_id=workspace_id,
            project_id=project_id,
            revision_id=revision_id,
            conn=cast(BaseDBAsyncClient, SimpleNamespace()),
        )

    assert getattr(exc_info.value, "error", None) == "BUILDER_WIREFRAME_INVALID"


@pytest.mark.asyncio
async def test_builder_revision_rejects_structurally_invalid_wireframe() -> None:
    workspace_id, project_id, revision_id, repository = _revision_fixture(wireframe_state="duplicate_sections")

    with pytest.raises(Conflict) as exc_info:
        await get_project_builder_revision(
            repository=repository,
            workspace_id=workspace_id,
            project_id=project_id,
            revision_id=revision_id,
            conn=cast(BaseDBAsyncClient, SimpleNamespace()),
        )

    assert getattr(exc_info.value, "error", None) == "BUILDER_WIREFRAME_INVALID"


@pytest.mark.asyncio
async def test_builder_revision_rejects_presentation_hash_drift() -> None:
    workspace_id, project_id, revision_id, repository = _revision_fixture()
    list_presentations = cast(AsyncMock, repository.list_presentations_and_bindings)
    presentations, bindings = list_presentations.return_value
    presentations[0].payload = {**presentations[0].payload, "sections": []}

    with pytest.raises(Conflict) as exc_info:
        await get_project_builder_revision(
            repository=repository,
            workspace_id=workspace_id,
            project_id=project_id,
            revision_id=revision_id,
            conn=cast(BaseDBAsyncClient, SimpleNamespace()),
        )

    assert getattr(exc_info.value, "error", None) == "BUILDER_PRESENTATION_SET_INVALID"
