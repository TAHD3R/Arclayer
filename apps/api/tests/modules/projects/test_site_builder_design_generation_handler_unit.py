from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.config import get_settings
from src.models.builder._enums import BuilderGenerationStatus
from src.models.builder.generation import BuilderGenerationRecord
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.ai.agent_tool_grants import BUILDER_DESIGN_APPLY_TOOL, BUILDER_DESIGN_GENERATE_TOOL
from src.modules.jobs.execution_registry import JobExecutionContext
from src.modules.projects.builder import generation_handler
from src.modules.projects.builder.design_change_set_schema import BuilderDesignInitializeOperationV1
from src.modules.projects.builder.generation_context import build_design_generation_context
from src.modules.projects.builder.generation_handler import BuilderGenerationJobHandler
from src.modules.projects.builder.generation_job_contract import (
    BuilderDesignGenerationJobInput,
    BuilderDesignGenerationJobResult,
    BuilderGenerationJobTarget,
)
from src.modules.projects.builder.generation_provider import (
    BuilderDesignGenerationCandidateV1,
    BuilderDesignGenerator,
    BuilderDesignGeneratorError,
    BuilderSitemapGenerator,
    BuilderWireframeGenerator,
)
from src.modules.projects.builder.generation_repository import BuilderGenerationRepository
from src.modules.projects.builder.generation_schema import BuilderGenerationTargetV1
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1, WireframeSectionV1
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry
from tests.modules.projects.test_site_builder_design_generation_provider_unit import _design_manifest
from tests.modules.projects.test_site_builder_wireframe_generation_context_unit import _builder_context

pytestmark = pytest.mark.unit


class _Context:
    def __init__(self, record: BuilderGenerationRecord) -> None:
        self.lease = SimpleNamespace(job_id=record.job_id)
        self.target = BuilderGenerationJobTarget(
            workspace_id=record.workspace_id,
            project_id=record.project_id,
            runtime_id=record.runtime_id,
            environment_id=record.environment_id,
        )
        self.input_reference = BuilderDesignGenerationJobInput(
            generation_id=record.id,
            base_site_revision_id=record.base_site_revision_id,
            agent_version_id=record.agent_version_id,
            request_hash=record.request_fingerprint,
        )
        self.actor_user_id = record.actor_user_id
        self.source_revision = record.base_manifest_hash
        self.progress = []

    def idempotency_key(self, *, step: str) -> str:
        return f"design:{self.input_reference.generation_id}:{step}"

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


async def test_design_handler_persists_preview_and_returns_partial_result_from_frozen_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    builder_context, target, design_context = _generation_context()
    record = _record(candidate_count=2)
    record.workspace_id = builder_context.workspace_id
    record.project_id = builder_context.project_id
    record.site_id = builder_context.site_id
    record.environment_id = builder_context.environment_id
    record.base_site_revision_id = builder_context.site_revision_id
    record.base_manifest_hash = builder_context.manifest_hash
    record.base_etag = builder_context.manifest_hash
    record.targets = [target.model_dump(mode="json", by_alias=True)]
    repository = _Repository(record)
    frozen_target = design_context.targets[0]
    candidate = BuilderDesignGenerationCandidateV1(
        summary="Initialize a restrained visual direction.",
        operations=(
            BuilderDesignInitializeOperationV1(
                operation_id="initialize-page-design",
                type="design.initialize",
                item_id=frozen_target.item_id,
                expected_draft_version=frozen_target.expected_draft_version,
                source_wireframe_checksum=frozen_target.source_wireframe_checksum,
            ),
        ),
    )
    design_generator = SimpleNamespace(
        generate=AsyncMock(
            side_effect=(
                candidate,
                BuilderDesignGeneratorError("BUILDER_GENERATION_OUTPUT_INVALID", continue_candidates=True),
            )
        )
    )
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
        wireframe_generator=cast(BuilderWireframeGenerator, SimpleNamespace()),
        design_generator=cast(BuilderDesignGenerator, design_generator),
    )

    async def state(_context):  # type: ignore[no-untyped-def]
        return generation_handler._ExecutionState(
            record=record,
            builder_context=builder_context,
            planning_context=None,
            composition_context=None,
            design_context=design_context,
            agent_instructions="Create exact typed Design operations.",
            candidates=tuple(generation_handler._CandidateReference.model_validate(item) for item in record.candidates),
            failures=tuple(
                generation_handler.BuilderGenerationFailureOut.model_validate(item) for item in record.failures
            ),
        )

    monkeypatch.setattr(handler, "_state", state)
    change_set_id = uuid4()
    preview = AsyncMock(return_value=SimpleNamespace(change_set_id=change_set_id))
    monkeypatch.setattr(generation_handler.SiteBuilderChangeSetService, "preview", preview)

    result = await handler.execute(
        context=cast(
            JobExecutionContext[BuilderGenerationJobTarget, BuilderDesignGenerationJobInput],
            _Context(record),
        )
    )

    assert isinstance(result, BuilderDesignGenerationJobResult)
    assert result.generation_id == record.id
    assert result.base_site_revision_id == record.base_site_revision_id
    assert result.status == "partial"
    assert result.candidate_change_set_ids == (change_set_id,)
    assert result.failed_candidate_count == 1
    assert record.status == BuilderGenerationStatus.PARTIAL
    assert record.candidates[0]["changeSetId"] == str(change_set_id)
    assert record.failures[0]["code"] == "BUILDER_GENERATION_OUTPUT_INVALID"
    requests = [call.kwargs["request"] for call in design_generator.generate.await_args_list]
    assert [request.candidate_index for request in requests] == [0, 1]
    assert all(request.design_context == design_context for request in requests)
    preview_call = preview.await_args
    assert preview_call is not None
    payload = preview_call.kwargs["payload"]
    assert payload.tool_name == BUILDER_DESIGN_APPLY_TOOL
    assert payload.agent_run_id is None
    assert payload.agent_id == record.agent_id
    assert payload.operations == candidate.operations


async def test_design_handler_state_validates_persisted_snapshots_and_agent_grant() -> None:
    builder_context, target, design_context = _generation_context()
    record = _record(candidate_count=1)
    record.workspace_id = builder_context.workspace_id
    record.project_id = builder_context.project_id
    record.site_id = builder_context.site_id
    record.environment_id = builder_context.environment_id
    record.base_site_revision_id = builder_context.site_revision_id
    record.base_manifest_hash = builder_context.manifest_hash
    record.base_etag = builder_context.manifest_hash
    record.targets = [target.model_dump(mode="json", by_alias=True)]
    record.builder_context = builder_context.model_dump(mode="json", by_alias=True)
    record.design_context = design_context.model_dump(mode="json", by_alias=True)
    repository = _Repository(record)
    resolved_agent = SimpleNamespace(
        tool_grants=(BUILDER_DESIGN_GENERATE_TOOL,),
        instructions="Create exact typed Design operations.",
    )
    agents = SimpleNamespace(validate_run_snapshot=AsyncMock(return_value=(resolved_agent, ())))
    handler = BuilderGenerationJobHandler(
        settings=get_settings(),
        repository_factory=lambda: cast(BuilderGenerationRepository, repository),
        builder_repository_factory=lambda: cast(SiteBuilderRepository, SimpleNamespace()),
        design_system_repository_factory=lambda: cast(ProjectDesignSystemsRepository, SimpleNamespace()),
        component_catalog_resolver=get_official_component_catalog_registry(),
        generator=cast(BuilderSitemapGenerator, SimpleNamespace()),
        wireframe_generator=cast(BuilderWireframeGenerator, SimpleNamespace()),
        design_generator=cast(BuilderDesignGenerator, SimpleNamespace()),
        agent_catalog_service=cast(AgentCatalogService, agents),
    )
    context = cast(
        JobExecutionContext[BuilderGenerationJobTarget, BuilderDesignGenerationJobInput],
        _Context(record),
    )

    state = await handler._state(context)

    assert state.builder_context == builder_context
    assert state.design_context == design_context
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


def _generation_context():  # type: ignore[no-untyped-def]
    builder_context, page_id = _builder_context()
    target = BuilderGenerationTargetV1(kind="page", item_id=page_id)
    catalog = get_official_component_catalog_registry().resolve("arclayer-wireframe-v1")
    assert catalog is not None
    wireframe = WireframeDocumentV1(
        page_item_id=page_id,
        design_system_version_id=builder_context.manifest.design_system_version_id,
        component_catalog_version=catalog.catalog_version,
        sections=(
            WireframeSectionV1(
                id="section.hero",
                intent_id="intent.hero",
                component_key="landing.hero",
                variant_key="default",
                label="Hero",
            ),
        ),
    )
    design_context = build_design_generation_context(
        builder_context=builder_context,
        targets=(target,),
        wireframes_by_item={page_id: wireframe},
        blueprints_by_item={page_id: None},
        design_system_manifest=_design_manifest(),
        component_catalog=catalog,
    )
    assert design_context.targets[0].source_wireframe_checksum == canonical_hash(
        wireframe.model_dump(mode="json", by_alias=True)
    )
    return builder_context, target, design_context


def _record(*, candidate_count: int) -> BuilderGenerationRecord:
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
        tool_name=BUILDER_DESIGN_GENERATE_TOOL,
        target_stage="design",
        objective="Generate revision-pinned Design candidates.",
        locale="en-US",
        candidate_count=candidate_count,
        targets=[],
        knowledge_reference_ids=[],
        builder_context={},
        design_context={},
        request_fingerprint="f" * 64,
        status=BuilderGenerationStatus.QUEUED,
        candidates=[],
        failures=[],
    )
