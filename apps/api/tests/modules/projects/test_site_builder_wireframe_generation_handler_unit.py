from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.models.builder._enums import BuilderGenerationStatus, BuilderProvenanceSource
from src.models.builder.generation import BuilderGenerationRecord
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.ai.agent_tool_grants import (
    BUILDER_WIREFRAME_APPLY_TOOL,
    BUILDER_WIREFRAME_GENERATE_TOOL,
)
from src.modules.jobs.execution_registry import JobExecutionContext
from src.modules.projects.builder import generation_handler
from src.modules.projects.builder.generation_context import build_wireframe_generation_context
from src.modules.projects.builder.generation_handler import BuilderGenerationJobHandler
from src.modules.projects.builder.generation_job_contract import (
    BuilderGenerationJobTarget,
    BuilderWireframeGenerationJobInput,
    BuilderWireframeGenerationJobResult,
)
from src.modules.projects.builder.generation_provider import (
    BuilderSitemapGenerator,
    BuilderWireframeCandidateV1,
    BuilderWireframeGenerationContextV1,
    BuilderWireframeGenerationTargetContextV1,
    BuilderWireframeGenerator,
)
from src.modules.projects.builder.generation_repository import BuilderGenerationRepository
from src.modules.projects.builder.generation_schema import BuilderGenerationTargetV1
from src.modules.projects.builder.global_section_schema import BuilderGlobalSectionDependencyGraphOut
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import (
    BuilderPageNodeSnapshotV1,
    BuilderPageVersionPinV1,
    BuilderSectionIntentV1,
    ContentStructureSnapshotV1,
    SiteRevisionManifestV1,
)
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.projects.builder.wireframe_change_set_schema import (
    BuilderWireframeInitializeOperationV1,
)
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry


class _Context:
    def __init__(self, record: BuilderGenerationRecord) -> None:
        self.lease = SimpleNamespace(job_id=record.job_id)
        self.target = BuilderGenerationJobTarget(
            workspace_id=record.workspace_id,
            project_id=record.project_id,
            runtime_id=record.runtime_id,
            environment_id=record.environment_id,
        )
        self.input_reference = BuilderWireframeGenerationJobInput(
            generation_id=record.id,
            base_site_revision_id=record.base_site_revision_id,
            agent_version_id=record.agent_version_id,
            request_hash=record.request_fingerprint,
        )
        self.actor_user_id = record.actor_user_id
        self.source_revision = record.base_manifest_hash
        self.progress = []

    def idempotency_key(self, *, step: str) -> str:
        return f"wireframe:{self.input_reference.generation_id}:{step}"

    async def checkpoint(self):  # type: ignore[no-untyped-def]
        return SimpleNamespace(cancellation_requested=False)

    async def report_progress(self, update):  # type: ignore[no-untyped-def]
        self.progress.append(update)
        return SimpleNamespace(cancellation_requested=False)

    async def run_fenced_domain_commit(self, operation):  # type: ignore[no-untyped-def]
        return await operation()


class _Repository:
    def __init__(self, record: BuilderGenerationRecord) -> None:
        self.record = record

    async def get_generation(self, **_kwargs):  # type: ignore[no-untyped-def]
        return self.record

    async def update_generation(self, *, record, values, conn):  # type: ignore[no-untyped-def]
        assert record is self.record
        assert conn is None
        for key, value in values.items():
            setattr(record, key, value)
        return record


async def test_wireframe_handler_previews_one_coordinated_candidate_for_all_persisted_targets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    record = _record()
    repository = _Repository(record)
    page_id, global_section_id = uuid4(), uuid4()
    record.targets = [
        {"kind": "page", "itemId": str(page_id)},
        {"kind": "global_section", "itemId": str(global_section_id)},
    ]
    catalog = get_official_component_catalog_registry().resolve("arclayer-wireframe-v1")
    assert catalog is not None
    composition_context = BuilderWireframeGenerationContextV1(
        targets=(
            BuilderWireframeGenerationTargetContextV1(
                kind="page",
                item_id=page_id,
                expected_draft_version=3,
                purpose="Explain the product",
                section_intents=(
                    BuilderSectionIntentV1(
                        id="intent.hero",
                        label="Hero",
                        goal="Explain the value",
                    ),
                ),
                current_wireframe=None,
            ),
            BuilderWireframeGenerationTargetContextV1(
                kind="global_section",
                item_id=global_section_id,
                expected_draft_version=5,
                purpose="Provide consistent navigation",
                section_intents=(
                    BuilderSectionIntentV1(
                        id="intent.navigation",
                        label="Navigation",
                        goal="Connect every primary destination",
                    ),
                ),
                current_wireframe=None,
            ),
        ),
        design_system_version_id=uuid4(),
        component_catalog=catalog,
        global_section_graph=BuilderGlobalSectionDependencyGraphOut(),
    )
    candidate = BuilderWireframeCandidateV1(
        summary="Initialize the selected page and global navigation Wireframes.",
        operations=(
            BuilderWireframeInitializeOperationV1(
                type="wireframe.initialize",
                operation_id="initialize-page-wireframe",
                item_id=page_id,
                expected_draft_version=3,
                component_catalog_version=catalog.catalog_version,
                sections=(),
            ),
            BuilderWireframeInitializeOperationV1(
                type="wireframe.initialize",
                operation_id="initialize-global-navigation",
                item_id=global_section_id,
                expected_draft_version=5,
                component_catalog_version=catalog.catalog_version,
                sections=(),
            ),
        ),
    )
    wireframe_generator = SimpleNamespace(generate=AsyncMock(return_value=candidate))
    builder_repository = SimpleNamespace(
        tenant_context=SimpleNamespace(identity=SimpleNamespace(organization_id=uuid4()))
    )
    handler = BuilderGenerationJobHandler(
        settings=get_settings(),
        repository_factory=lambda: cast(BuilderGenerationRepository, repository),
        builder_repository_factory=lambda: cast(SiteBuilderRepository, builder_repository),
        design_system_repository_factory=lambda: cast(ProjectDesignSystemsRepository, SimpleNamespace()),
        component_catalog_resolver=get_official_component_catalog_registry(),
        generator=cast(BuilderSitemapGenerator, SimpleNamespace()),
        wireframe_generator=cast(BuilderWireframeGenerator, wireframe_generator),
    )

    async def state(_context):  # type: ignore[no-untyped-def]
        return generation_handler._ExecutionState(
            record=record,
            builder_context=None,
            planning_context=None,
            composition_context=composition_context,
            design_context=None,
            agent_instructions="Build an exact Wireframe candidate.",
            candidates=tuple(generation_handler._CandidateReference.model_validate(item) for item in record.candidates),
            failures=(),
        )

    monkeypatch.setattr(handler, "_state", state)
    preview = AsyncMock(return_value=SimpleNamespace(change_set_id=uuid4()))
    monkeypatch.setattr(generation_handler.SiteBuilderChangeSetService, "preview", preview)

    result = await handler.execute(
        context=cast(
            JobExecutionContext[BuilderGenerationJobTarget, BuilderWireframeGenerationJobInput],
            _Context(record),
        )
    )

    assert isinstance(result, BuilderWireframeGenerationJobResult)
    preview_call = preview.await_args
    assert preview_call is not None
    payload = preview_call.kwargs["payload"]
    assert payload.agent_run_id is None
    assert payload.agent_id == record.agent_id
    assert payload.tool_name == BUILDER_WIREFRAME_APPLY_TOOL
    assert tuple(operation.item_id for operation in payload.operations) == (page_id, global_section_id)
    wireframe_generator.generate.assert_awaited_once()
    request = wireframe_generator.generate.await_args.kwargs["request"]
    assert request.wireframe_context == composition_context
    preview.assert_awaited_once()


async def test_wireframe_handler_state_validates_exact_persisted_snapshots_and_agent_grant() -> None:
    builder_context, page_id = _builder_context()
    target = BuilderGenerationTargetV1(kind="page", item_id=page_id)
    catalog = get_official_component_catalog_registry().resolve("arclayer-wireframe-v1")
    assert catalog is not None
    composition_context = build_wireframe_generation_context(
        builder_context=builder_context,
        targets=(target,),
        wireframes_by_item={page_id: None},
        component_catalog=catalog,
    )
    record = _record()
    record.workspace_id = builder_context.workspace_id
    record.project_id = builder_context.project_id
    record.site_id = builder_context.site_id
    record.environment_id = builder_context.environment_id
    record.base_site_revision_id = builder_context.site_revision_id
    record.base_manifest_hash = builder_context.manifest_hash
    record.base_etag = builder_context.manifest_hash
    record.targets = [target.model_dump(mode="json", by_alias=True)]
    record.builder_context = builder_context.model_dump(mode="json", by_alias=True)
    record.composition_context = composition_context.model_dump(mode="json", by_alias=True)
    repository = _Repository(record)
    resolved_agent = SimpleNamespace(
        tool_grants=(BUILDER_WIREFRAME_GENERATE_TOOL,),
        instructions="Build an exact Wireframe candidate.",
    )
    agents = SimpleNamespace(
        validate_run_snapshot=AsyncMock(return_value=(resolved_agent, ())),
    )
    handler = BuilderGenerationJobHandler(
        settings=get_settings(),
        repository_factory=lambda: cast(BuilderGenerationRepository, repository),
        builder_repository_factory=lambda: cast(SiteBuilderRepository, SimpleNamespace()),
        design_system_repository_factory=lambda: cast(ProjectDesignSystemsRepository, SimpleNamespace()),
        component_catalog_resolver=get_official_component_catalog_registry(),
        generator=cast(BuilderSitemapGenerator, SimpleNamespace()),
        wireframe_generator=cast(BuilderWireframeGenerator, SimpleNamespace()),
        agent_catalog_service=cast(AgentCatalogService, agents),
    )
    context = cast(
        JobExecutionContext[BuilderGenerationJobTarget, BuilderWireframeGenerationJobInput],
        _Context(record),
    )

    state = await handler._state(context)

    assert state.builder_context == builder_context
    assert state.composition_context == composition_context
    assert state.agent_instructions == resolved_agent.instructions
    agents.validate_run_snapshot.assert_awaited_once_with(
        workspace_id=record.workspace_id,
        project_id=record.project_id,
        lead_agent_id=record.agent_id,
        lead_agent_version_id=record.agent_version_id,
        lead_agent_assignment_id=record.agent_assignment_id,
        mentioned_agent_ids=(),
        mentioned_agent_version_ids=(),
        mentioned_agent_assignment_ids=(),
        execution_mode="build",
    )


def _record() -> BuilderGenerationRecord:
    return BuilderGenerationRecord(
        id=uuid4(),
        workspace_id=uuid4(),
        project_id=uuid4(),
        runtime_id=uuid4(),
        site_id=uuid4(),
        environment_id=uuid4(),
        base_site_revision_id=uuid4(),
        base_manifest_hash="sha256:" + "a" * 64,
        base_etag="sha256:" + "a" * 64,
        job_id=uuid4(),
        actor_user_id=uuid4(),
        agent_run_id=None,
        agent_id=uuid4(),
        agent_version_id=uuid4(),
        agent_assignment_id=uuid4(),
        tool_name="builder.wireframe.generate",
        target_stage="wireframe",
        objective="Generate the selected page Wireframe.",
        locale="en-US",
        candidate_count=1,
        targets=[],
        knowledge_reference_ids=[],
        builder_context={},
        composition_context={},
        request_fingerprint="f" * 64,
        status=BuilderGenerationStatus.QUEUED,
        candidates=[],
        failures=[],
    )


def _builder_context() -> tuple[AgentRunBuilderContextV1, UUID]:
    workspace_id, project_id, site_id, environment_id, revision_id, page_id = (uuid4() for _ in range(6))
    structure_id, content_version_id, design_system_id, design_system_version_id = (uuid4() for _ in range(4))
    page = BuilderPageNodeSnapshotV1(
        item_id=page_id,
        sort_order=0,
        purpose="Explain the product clearly",
        section_intents=(
            BuilderSectionIntentV1(
                id="intent.hero",
                label="Hero",
                goal="Establish the primary value proposition",
            ),
        ),
    )
    structure = ContentStructureSnapshotV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        locales=("en-US",),
        pages=(page,),
    )
    structure_hash = canonical_hash(structure.model_dump(mode="json", by_alias=True))
    pin = BuilderPageVersionPinV1(
        item_id=page_id,
        content_version_id=content_version_id,
        version_number=7,
        presentation_set_hash=canonical_hash([]),
        component_binding_set_hash=canonical_hash([]),
    )
    manifest = SiteRevisionManifestV1(
        id=revision_id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        revision_number=4,
        project_authoring_mode="builder_managed",
        content_structure_revision_id=structure_id,
        content_structure_hash=structure_hash,
        page_versions=(pin,),
        presentation_set_hash=canonical_hash([pin.presentation_set_hash]),
        design_system_id=design_system_id,
        design_system_version_id=design_system_version_id,
        design_system_manifest_checksum=canonical_hash({"tokens": {}}),
        provenance_source=BuilderProvenanceSource.HUMAN,
        actor_user_id=uuid4(),
        created_at=datetime(2026, 7, 22, tzinfo=UTC),
        manifest_hash=canonical_hash({"revision": 4}),
    )
    return (
        AgentRunBuilderContextV1(
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            site_revision_id=revision_id,
            revision_number=4,
            manifest_hash=manifest.manifest_hash,
            status_etag=canonical_hash({"status": 4}),
            content_structure_revision_id=structure_id,
            content_structure_hash=structure_hash,
            manifest=manifest,
            content_structure=structure,
            context_hash=canonical_hash({"context": 4}),
        ),
        page_id,
    )
