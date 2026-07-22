from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonValue
from src.core.exceptions import Conflict
from src.models.builder._enums import BuilderProvenanceSource
from src.models.content._enums import ContentPresentationKind, ContentVersionState
from src.models.content.component_binding import ComponentBindingRecord
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.hierarchy_node import HierarchyNodeRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.content.route_binding import RouteBindingRecord
from src.models.sites.site import SiteRecord
from src.modules.projects.builder.change_set_apply_context import _require_live_inputs_match_base
from src.modules.projects.builder.change_set_revision import create_next_builder_revision
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import (
    BuilderPagePlanningV1,
    BuilderSectionIntentV1,
    ContentStructureSnapshotV1,
    SiteRevisionManifestV1,
)
from src.modules.projects.builder.snapshot import (
    aggregate_presentation_hash,
    build_global_section_version_pins,
    build_page_version_pins,
    build_structure_snapshot,
    canonical_hash,
)


@dataclass(frozen=True, slots=True)
class _LiveMutationState:
    workspace_id: UUID
    project_id: UUID
    environment_id: UUID
    item: ContentItemRecord
    version: ContentVersionRecord
    route: RouteBindingRecord
    presentation: PresentationDocumentRecord
    binding: ComponentBindingRecord
    base_structure: ContentStructureSnapshotV1
    global_item: ContentItemRecord | None = None
    global_version: ContentVersionRecord | None = None
    global_presentation: PresentationDocumentRecord | None = None


def _live_state(
    *,
    include_global_section: bool = False,
    include_planning: bool = False,
) -> tuple[SiteBuilderRepository, SiteRecord, SiteRevisionManifestV1, _LiveMutationState]:
    workspace_id, project_id, site_id, environment_id = (uuid4() for _ in range(4))
    item_id, version_id = uuid4(), uuid4()
    item = cast(
        ContentItemRecord,
        SimpleNamespace(
            id=item_id,
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            slug="about",
            draft_version=1,
            published_version=None,
        ),
    )
    route = cast(
        RouteBindingRecord,
        SimpleNamespace(
            id=uuid4(),
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
            environment_id=environment_id,
            locale="en-US",
            path="/about",
            route_contract={"kind": "page"},
            is_active=True,
        ),
    )
    hierarchy = cast(
        HierarchyNodeRecord,
        SimpleNamespace(
            id=uuid4(),
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
            parent_item_id=None,
            sort_order=0,
        ),
    )
    version = cast(
        ContentVersionRecord,
        SimpleNamespace(
            id=version_id,
            item_id=item_id,
            version=1,
            state=ContentVersionState.DRAFT,
        ),
    )
    presentation = cast(
        PresentationDocumentRecord,
        SimpleNamespace(
            id=uuid4(),
            version_id=version_id,
            kind=ContentPresentationKind.VISUAL_BLUEPRINT,
            payload={"sections": [{"type": "hero"}]},
        ),
    )
    binding = cast(
        ComponentBindingRecord,
        SimpleNamespace(
            id=uuid4(),
            version_id=version_id,
            component_key="hero",
            binding_key="headline",
            binding_payload={"path": "title"},
            sort_order=0,
        ),
    )
    global_item_id, global_version_id = uuid4(), uuid4()
    global_item = cast(
        ContentItemRecord,
        SimpleNamespace(
            id=global_item_id,
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            slug="site-header",
            locale="en-US",
            draft_version=1,
            published_version=None,
        ),
    )
    global_version = cast(
        ContentVersionRecord,
        SimpleNamespace(
            id=global_version_id,
            item_id=global_item_id,
            version=1,
            state=ContentVersionState.DRAFT,
        ),
    )
    global_presentation = cast(
        PresentationDocumentRecord,
        SimpleNamespace(
            id=uuid4(),
            version_id=global_version_id,
            kind=ContentPresentationKind.WIREFRAME,
            payload={"schemaVersion": 1, "pageItemId": str(global_item_id), "sections": []},
        ),
    )
    site = cast(
        SiteRecord,
        SimpleNamespace(id=site_id, default_locale="en-US", fallback_locale="en-US"),
    )
    structure = build_structure_snapshot(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        default_locale="en-US",
        fallback_locale="en-US",
        routes=[route],
        hierarchy=[hierarchy],
        items=[item],
        global_items=[global_item] if include_global_section else [],
    )
    if include_planning:
        planning = BuilderPagePlanningV1(
            purpose="Explain why teams should use Arclayer",
            section_intents=(
                BuilderSectionIntentV1(
                    id="hero-intent",
                    label="Hero",
                    goal="Establish the primary value proposition",
                ),
            ),
        )
        structure = structure.model_copy(
            update={
                "pages": (
                    structure.pages[0].model_copy(
                        update={
                            "purpose": planning.purpose,
                            "section_intents": planning.section_intents,
                        }
                    ),
                ),
            }
        )
    pins = build_page_version_pins(
        selected_versions={item_id: version},
        presentations=[presentation],
        bindings=[binding],
    )
    global_pins = build_global_section_version_pins(
        selected_versions={global_item_id: global_version} if include_global_section else {},
        presentations=[global_presentation] if include_global_section else [],
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
        content_structure_hash=canonical_hash(cast(JsonValue, structure.model_dump(mode="json", by_alias=True))),
        page_versions=pins,
        global_section_versions=global_pins,
        presentation_set_hash=aggregate_presentation_hash((*pins, *global_pins)),
        design_system_id=uuid4(),
        design_system_version_id=uuid4(),
        design_system_manifest_checksum=canonical_hash({"tokens": {}}),
        provenance_source=BuilderProvenanceSource.HUMAN,
        actor_user_id=uuid4(),
        created_at=datetime(2026, 7, 21, tzinfo=UTC),
        manifest_hash=canonical_hash({"siteRevision": 1}),
    )
    repository = cast(
        SiteBuilderRepository,
        SimpleNamespace(
            list_structure_records=AsyncMock(return_value=([route], [hierarchy], [item])),
            list_global_section_records=AsyncMock(return_value=[global_item] if include_global_section else []),
            list_content_versions=AsyncMock(
                return_value=[version, global_version] if include_global_section else [version]
            ),
            list_presentations_and_bindings=AsyncMock(
                return_value=(
                    [presentation, global_presentation] if include_global_section else [presentation],
                    [binding],
                )
            ),
        ),
    )
    mutable = _LiveMutationState(
        workspace_id=workspace_id,
        project_id=project_id,
        environment_id=environment_id,
        item=item,
        version=version,
        route=route,
        presentation=presentation,
        binding=binding,
        base_structure=structure,
        global_item=global_item if include_global_section else None,
        global_version=global_version if include_global_section else None,
        global_presentation=global_presentation if include_global_section else None,
    )
    return repository, site, manifest, mutable


async def _require_live_state(
    repository: SiteBuilderRepository,
    site: SiteRecord,
    manifest: SiteRevisionManifestV1,
    mutable: _LiveMutationState,
) -> None:
    await _require_live_inputs_match_base(
        repository=repository,
        workspace_id=mutable.workspace_id,
        project_id=mutable.project_id,
        site=site,
        environment_id=mutable.environment_id,
        base_manifest=manifest,
        base_structure=mutable.base_structure,
        conn=cast(BaseDBAsyncClient, object()),
    )


async def test_apply_live_inputs_accept_exact_structure_versions_and_presentations() -> None:
    repository, site, manifest, mutable = _live_state()

    await _require_live_state(repository, site, manifest, mutable)


async def test_apply_live_inputs_accept_exact_global_section_versions_and_presentations() -> None:
    repository, site, manifest, mutable = _live_state(include_global_section=True)

    await _require_live_state(repository, site, manifest, mutable)


async def test_apply_live_inputs_preserve_exact_revision_planning_authority() -> None:
    repository, site, manifest, mutable = _live_state(include_planning=True)

    await _require_live_state(repository, site, manifest, mutable)


async def test_next_revision_advances_only_the_changed_page_pin() -> None:
    repository, site, manifest, mutable = _live_state(include_global_section=True)
    repository_state = _prepare_revision_repository(repository)
    if mutable.global_version is None or mutable.global_presentation is None:
        raise AssertionError("Global section fixture is incomplete")
    next_version = _content_version(item_id=mutable.item.id, version=2)
    next_wireframe = _wireframe_presentation(
        version_id=next_version.id,
        host_item_id=mutable.item.id,
        section_type="proof-grid",
    )
    mutable.item.draft_version = 2
    repository_state.list_content_versions.return_value = [next_version, mutable.global_version]
    repository_state.list_presentations_and_bindings.return_value = (
        [next_wireframe, mutable.global_presentation],
        [],
    )

    result = await _create_next_revision(repository, site, manifest, mutable)

    assert result.site_revision.page_versions[0].item_id == mutable.item.id
    assert result.site_revision.page_versions[0].version_number == 2
    assert result.site_revision.global_section_versions == manifest.global_section_versions
    assert result.site_revision.presentation_set_hash != manifest.presentation_set_hash


async def test_next_revision_advances_only_the_changed_global_section_pin() -> None:
    repository, site, manifest, mutable = _live_state(include_global_section=True)
    repository_state = _prepare_revision_repository(repository)
    if mutable.global_item is None:
        raise AssertionError("Global section fixture is incomplete")
    next_version = _content_version(item_id=mutable.global_item.id, version=2)
    next_wireframe = _wireframe_presentation(
        version_id=next_version.id,
        host_item_id=mutable.global_item.id,
        section_type="navigation",
    )
    mutable.global_item.draft_version = 2
    repository_state.list_content_versions.return_value = [mutable.version, next_version]
    repository_state.list_presentations_and_bindings.return_value = (
        [mutable.presentation, next_wireframe],
        [mutable.binding],
    )

    result = await _create_next_revision(repository, site, manifest, mutable)

    assert result.site_revision.page_versions == manifest.page_versions
    assert result.site_revision.global_section_versions[0].item_id == mutable.global_item.id
    assert result.site_revision.global_section_versions[0].version_number == 2
    assert result.site_revision.presentation_set_hash != manifest.presentation_set_hash


async def test_next_revision_adds_created_global_section_node_and_exact_pin() -> None:
    repository, site, manifest, mutable = _live_state()
    repository_state = _prepare_revision_repository(repository)
    global_item_id = uuid4()
    global_item = cast(
        ContentItemRecord,
        SimpleNamespace(
            id=global_item_id,
            workspace_id=mutable.workspace_id,
            site_id=site.id,
            environment_id=mutable.environment_id,
            slug="site-header",
            locale="en-US",
            draft_version=1,
            published_version=None,
        ),
    )
    global_version = _content_version(item_id=global_item_id, version=1)
    repository_state.list_global_section_records.return_value = [global_item]
    repository_state.list_content_versions.return_value = [mutable.version, global_version]
    repository_state.list_presentations_and_bindings.return_value = ([mutable.presentation], [mutable.binding])

    result = await _create_next_revision(repository, site, manifest, mutable)

    assert [node.item_id for node in result.content_structure_revision.snapshot.global_references] == [global_item_id]
    assert len(result.site_revision.global_section_versions) == 1
    assert result.site_revision.global_section_versions[0].item_id == global_item_id
    assert result.site_revision.global_section_versions[0].content_version_id == global_version.id
    assert result.site_revision.global_section_versions[0].version_number == 1


async def test_next_revision_removes_deleted_global_section_node_and_pin() -> None:
    repository, site, manifest, mutable = _live_state(include_global_section=True)
    repository_state = _prepare_revision_repository(repository)
    repository_state.list_global_section_records.return_value = []
    repository_state.list_content_versions.return_value = [mutable.version]
    repository_state.list_presentations_and_bindings.return_value = ([mutable.presentation], [mutable.binding])

    result = await _create_next_revision(repository, site, manifest, mutable)

    assert result.content_structure_revision.snapshot.global_references == ()
    assert result.site_revision.global_section_versions == ()


@pytest.mark.parametrize("drift", ["route", "version", "presentation"])
async def test_apply_live_inputs_reject_structure_version_or_presentation_drift(drift: str) -> None:
    repository, site, manifest, mutable = _live_state()
    if drift == "route":
        mutable.route.path = "/about-us"
    elif drift == "version":
        mutable.item.draft_version = 2
    else:
        mutable.presentation.payload = {"sections": [{"type": "feature-grid"}]}

    with pytest.raises(Conflict) as exc_info:
        await _require_live_state(repository, site, manifest, mutable)

    assert exc_info.value.error == "SITE_REVISION_STALE"


def _prepare_revision_repository(repository: SiteBuilderRepository) -> SimpleNamespace:
    state = cast(SimpleNamespace, repository)
    state.create_structure_revision = AsyncMock(side_effect=lambda *, values, conn: SimpleNamespace(**values))
    state.create_site_revision = AsyncMock()
    state.get_status = AsyncMock(
        return_value=SimpleNamespace(
            status_revision=1,
            readiness_findings=[],
            validator_version="builder-foundation-v1",
        )
    )
    state.update_status = AsyncMock()
    state.create_status = AsyncMock()
    return state


def _content_version(*, item_id: UUID, version: int) -> ContentVersionRecord:
    return cast(
        ContentVersionRecord,
        SimpleNamespace(
            id=uuid4(),
            item_id=item_id,
            version=version,
            state=ContentVersionState.DRAFT,
        ),
    )


def _wireframe_presentation(
    *,
    version_id: UUID,
    host_item_id: UUID,
    section_type: str,
) -> PresentationDocumentRecord:
    return cast(
        PresentationDocumentRecord,
        SimpleNamespace(
            id=uuid4(),
            version_id=version_id,
            kind=ContentPresentationKind.WIREFRAME,
            payload={
                "schemaVersion": 1,
                "pageItemId": str(host_item_id),
                "sections": [{"type": section_type}],
            },
        ),
    )


async def _create_next_revision(
    repository: SiteBuilderRepository,
    site: SiteRecord,
    manifest: SiteRevisionManifestV1,
    mutable: _LiveMutationState,
):
    return await create_next_builder_revision(
        repository=repository,
        workspace_id=mutable.workspace_id,
        project_id=mutable.project_id,
        site_id=site.id,
        environment_id=mutable.environment_id,
        default_locale="en-US",
        fallback_locale="en-US",
        base_manifest=manifest,
        base_structure=mutable.base_structure,
        base_structure_revision_number=1,
        planning_overrides={},
        provenance_source=BuilderProvenanceSource.HUMAN,
        actor_user_id=uuid4(),
        agent_run_id=None,
        agent_id=None,
        agent_version_id=None,
        agent_assignment_id=None,
        conn=cast(BaseDBAsyncClient, object()),
    )
