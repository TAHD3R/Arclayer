from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from tortoise.exceptions import IntegrityError

from src.models.agents.runtime_knowledge_v1 import (
    AgentRunKnowledgeSnapshotV1Record,
    AgentRunKnowledgeSourceSnapshotV1Record,
)
from src.models.agents.runtime_v1 import AgentRunEventV1Record, AgentRunV1Record, AgentThreadV1Record
from src.models.knowledge._enums import (
    KnowledgeBaseStatus,
    KnowledgeIngestionMode,
    KnowledgeSourceKind,
    KnowledgeSourceStatus,
    KnowledgeVersionStatus,
    KnowledgeVisibility,
)
from src.models.knowledge.knowledge_base import KnowledgeAccessPolicyRecord, KnowledgeBaseRecord
from src.models.knowledge.knowledge_source import KnowledgeSourceRecord
from src.models.knowledge.knowledge_source_version import (
    KnowledgeSourceVersionRecord,
    KnowledgeSourceVersionStateRecord,
)
from src.models.organization.organization import Organization
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.agent_knowledge_context_schema import (
    AgentRunKnowledgeContextInputV1,
    AgentRunKnowledgeContextV1,
    AgentRunKnowledgeSourceSnapshotInputV1,
)
from src.modules.ai.runtime_job_repository import AgentRunJobRepository
from src.modules.ai.runtime_protocol_schema import RunCreatedEventV1
from src.modules.ai.runtime_repository import AgentRuntimeRepository
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_repository_schema import AgentRunCreatePersistenceCommand
from tests.modules.ai.runtime_agent_test_ids import (
    TEST_LEAD_AGENT_ASSIGNMENT_ID,
    TEST_LEAD_AGENT_ID,
    TEST_LEAD_AGENT_VERSION_ID,
)
from tests.modules.ai.runtime_design_system_test_context import fixed_design_system_context

pytestmark = pytest.mark.integration


async def _scope() -> tuple[Workspace, ProjectRecord, AgentThreadV1Record]:
    owner_user_id = uuid4()
    organization = await Organization.create(
        slug=f"agent-knowledge-snapshot-org-{uuid4().hex[:10]}",
        name="Agent Knowledge Snapshot Org",
        owner_user_id=owner_user_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Agent Knowledge Snapshot Workspace",
        is_active=True,
        owner_user_id=owner_user_id,
        created_by_user_id=owner_user_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"agent-knowledge-snapshot-project-{uuid4().hex[:10]}",
        name="Agent Knowledge Snapshot Project",
        is_active=True,
        created_by_user_id=owner_user_id,
    )
    thread = await AgentThreadV1Record.create(
        workspace_id=workspace.id,
        project_id=project.id,
        owner_user_id=owner_user_id,
        lead_agent_id=str(TEST_LEAD_AGENT_ID),
        lead_agent_version_id=TEST_LEAD_AGENT_VERSION_ID,
        lead_agent_assignment_id=TEST_LEAD_AGENT_ASSIGNMENT_ID,
        title="Pinned Knowledge context",
    )
    return workspace, project, thread


async def _ready_source_versions(
    *,
    workspace: Workspace,
    owner_user_id: UUID,
) -> tuple[KnowledgeBaseRecord, KnowledgeSourceRecord, KnowledgeSourceVersionRecord, KnowledgeSourceVersionRecord]:
    base = await KnowledgeBaseRecord.create(
        workspace_id=workspace.id,
        name="Brand guidance references",
        normalized_name="brand guidance references",
        default_locale="en-US",
        status=KnowledgeBaseStatus.ACTIVE,
        current_policy_revision=1,
        created_by_user_id=owner_user_id,
        request_idempotency_key=f"base-{uuid4().hex}",
        request_fingerprint="a" * 64,
    )
    await KnowledgeAccessPolicyRecord.create(
        knowledge_base_id=base.id,
        workspace_id=workspace.id,
        policy_revision=1,
        visibility=KnowledgeVisibility.WORKSPACE,
        created_by_user_id=owner_user_id,
    )
    source = await KnowledgeSourceRecord.create(
        knowledge_base_id=base.id,
        workspace_id=workspace.id,
        source_kind=KnowledgeSourceKind.MANUAL,
        display_name="Approved terminology",
        locale="en-US",
        status=KnowledgeSourceStatus.READY,
        locator={"kind": "manual"},
        created_by_user_id=owner_user_id,
        request_idempotency_key=f"source-{uuid4().hex}",
        request_fingerprint="b" * 64,
    )
    first = await _ready_version(
        workspace_id=workspace.id,
        source_id=source.id,
        version_number=1,
        content_hash=f"sha256:{'1' * 64}",
        content="Use the approved product terminology.",
        owner_user_id=owner_user_id,
    )
    second = await _ready_version(
        workspace_id=workspace.id,
        source_id=source.id,
        version_number=2,
        content_hash=f"sha256:{'2' * 64}",
        content="Use the revised product terminology.",
        owner_user_id=owner_user_id,
    )
    source.active_ready_version_id = first.id
    await source.save(update_fields=["active_ready_version_id", "updated_at"])
    return base, source, first, second


async def _ready_version(
    *,
    workspace_id: UUID,
    source_id: UUID,
    version_number: int,
    content_hash: str,
    content: str,
    owner_user_id: UUID,
) -> KnowledgeSourceVersionRecord:
    version = await KnowledgeSourceVersionRecord.create(
        source_id=source_id,
        workspace_id=workspace_id,
        version_number=version_number,
        content_hash=content_hash,
        normalized_content_hash=content_hash,
        content_text=content,
        parser_name="plain-text",
        parser_version="1",
        ingestion_mode=KnowledgeIngestionMode.INITIAL,
        locale="en-US",
        chunker_name="paragraph",
        chunker_version="1",
        provenance_actor_user_id=owner_user_id,
        request_idempotency_key=f"version-{version_number}-{uuid4().hex}",
        request_fingerprint=str(version_number) * 64,
    )
    await KnowledgeSourceVersionStateRecord.create(
        source_version_id=version.id,
        workspace_id=workspace_id,
        status=KnowledgeVersionStatus.READY,
    )
    return version


def _knowledge_input(
    *,
    workspace_id: UUID,
    project_id: UUID,
    base_id: UUID,
    source_id: UUID,
    source_version_id: UUID,
    source_version_content_hash: str,
) -> AgentRunKnowledgeContextInputV1:
    context = AgentRunKnowledgeContextV1(
        workspace_id=workspace_id,
        project_id=project_id,
        workspace_layer_id=uuid4(),
        workspace_revision_id=uuid4(),
        workspace_revision_number=3,
        workspace_content_hash=f"sha256:{'3' * 64}",
        project_layer_id=None,
        project_revision_id=None,
        project_revision_number=None,
        project_content_hash=None,
        project_mode=None,
        precedence=("workspace",),
        effective_guidance="Use approved language and cite attached evidence.",
        attached_knowledge_base_ids=(base_id,),
        context_hash=f"sha256:{'4' * 64}",
    )
    return AgentRunKnowledgeContextInputV1(
        context=context,
        sources=(
            AgentRunKnowledgeSourceSnapshotInputV1(
                source_order=0,
                knowledge_base_id=base_id,
                policy_revision=1,
                source_id=source_id,
                source_version_id=source_version_id,
                source_name="Approved terminology",
                source_version_content_hash=source_version_content_hash,
            ),
        ),
        context_byte_size=512,
    )


def _create_contract(
    *,
    workspace: Workspace,
    project: ProjectRecord,
    thread: AgentThreadV1Record,
    knowledge_context: AgentRunKnowledgeContextInputV1,
    run_id: UUID,
    idempotency_key: str,
) -> tuple[AgentRunCreatePersistenceCommand, RunCreatedEventV1]:
    occurred_at = datetime(2026, 8, 2, 12, 0, tzinfo=UTC)
    correlation_id = f"correlation-{idempotency_key}"
    command = AgentRunCreatePersistenceCommand(
        run_id=run_id,
        workspace_id=workspace.id,
        project_id=project.id,
        thread_id=thread.id,
        owner_user_id=thread.owner_user_id,
        lead_agent_id=TEST_LEAD_AGENT_ID,
        lead_agent_version_id=TEST_LEAD_AGENT_VERSION_ID,
        lead_agent_assignment_id=TEST_LEAD_AGENT_ASSIGNMENT_ID,
        knowledge_context=knowledge_context,
        design_system_context=fixed_design_system_context(project.id),
        execution_mode="plan",
        site_revision_id=None,
        message="Apply the exact Knowledge snapshot.",
        idempotency_key=idempotency_key,
        correlation_id=correlation_id,
    )
    event = RunCreatedEventV1.model_validate({
        "eventVersion": 1,
        "eventId": f"event-{idempotency_key}",
        "cursor": f"cursor-{idempotency_key}",
        "type": "run.created",
        "runId": str(run_id),
        "threadId": str(thread.id),
        "sequence": 1,
        "occurredAt": occurred_at.isoformat().replace("+00:00", "Z"),
        "correlationId": correlation_id,
        "spanId": None,
        "parentSpanId": None,
        "data": {
            "run": {
                "status": "created",
                "executionMode": "plan",
                "leadAgentId": str(TEST_LEAD_AGENT_ID),
                "createdAt": occurred_at.isoformat().replace("+00:00", "Z"),
            }
        },
    })
    return command, event


@pytest.mark.asyncio
async def test_knowledge_snapshot_is_atomic_replay_stable_and_version_pinned(prepared_db) -> None:
    _ = prepared_db
    workspace, project, thread = await _scope()
    base, source, first_version, second_version = await _ready_source_versions(
        workspace=workspace,
        owner_user_id=thread.owner_user_id,
    )
    knowledge_context = _knowledge_input(
        workspace_id=workspace.id,
        project_id=project.id,
        base_id=base.id,
        source_id=source.id,
        source_version_id=first_version.id,
        source_version_content_hash=first_version.content_hash,
    )
    command, event = _create_contract(
        workspace=workspace,
        project=project,
        thread=thread,
        knowledge_context=knowledge_context,
        run_id=uuid4(),
        idempotency_key="knowledge-snapshot-stable",
    )
    repository = AgentRuntimeRepository()

    first = await repository.create_run_with_first_event(command=command, event=event)
    source.active_ready_version_id = second_version.id
    await source.save(update_fields=["active_ready_version_id", "updated_at"])
    repeated = await repository.create_run_with_first_event(command=command, event=event)

    snapshot = await AgentRunKnowledgeSnapshotV1Record.get(run_id=command.run_id)
    source_snapshot = await AgentRunKnowledgeSourceSnapshotV1Record.get(run_id=command.run_id)
    run = await AgentRunV1Record.get(id=command.run_id)
    loaded_context, source_count = await AgentRunJobRepository._knowledge_context(run=run, conn=None)
    assert repeated == first
    assert snapshot.context_hash == knowledge_context.context.context_hash
    assert snapshot.source_snapshot_count == 1
    assert source_snapshot.source_version_id == first_version.id
    assert source.active_ready_version_id == second_version.id
    assert loaded_context == knowledge_context.context
    assert source_count == 1


@pytest.mark.asyncio
async def test_knowledge_snapshot_rejects_hash_and_source_count_drift(prepared_db) -> None:
    _ = prepared_db
    workspace, project, thread = await _scope()
    base, source, first_version, _second_version = await _ready_source_versions(
        workspace=workspace,
        owner_user_id=thread.owner_user_id,
    )
    knowledge_context = _knowledge_input(
        workspace_id=workspace.id,
        project_id=project.id,
        base_id=base.id,
        source_id=source.id,
        source_version_id=first_version.id,
        source_version_content_hash=first_version.content_hash,
    )
    command, event = _create_contract(
        workspace=workspace,
        project=project,
        thread=thread,
        knowledge_context=knowledge_context,
        run_id=uuid4(),
        idempotency_key="knowledge-snapshot-drift",
    )
    await AgentRuntimeRepository().create_run_with_first_event(command=command, event=event)
    run = await AgentRunV1Record.get(id=command.run_id)
    snapshot = await AgentRunKnowledgeSnapshotV1Record.get(run_id=command.run_id)

    snapshot.context_hash = f"sha256:{'9' * 64}"
    await snapshot.save(update_fields=["context_hash", "updated_at"])
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_KNOWLEDGE_SNAPSHOT_INVALID"):
        await AgentRunJobRepository._knowledge_context(run=run, conn=None)

    snapshot.context_hash = knowledge_context.context.context_hash
    snapshot.source_snapshot_count = 2
    await snapshot.save(update_fields=["context_hash", "source_snapshot_count", "updated_at"])
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_KNOWLEDGE_SNAPSHOT_INVALID"):
        await AgentRunJobRepository._knowledge_context(run=run, conn=None)


@pytest.mark.asyncio
async def test_knowledge_snapshot_source_failure_rolls_back_entire_run_graph(prepared_db) -> None:
    _ = prepared_db
    workspace, project, thread = await _scope()
    base, source, first_version, second_version = await _ready_source_versions(
        workspace=workspace,
        owner_user_id=thread.owner_user_id,
    )
    knowledge_context = _knowledge_input(
        workspace_id=workspace.id,
        project_id=project.id,
        base_id=base.id,
        source_id=source.id,
        source_version_id=first_version.id,
        source_version_content_hash=first_version.content_hash,
    )
    duplicate_source = knowledge_context.sources[0].model_copy(
        update={
            "source_order": 1,
            "source_version_id": second_version.id,
            "source_version_content_hash": second_version.content_hash,
        }
    )
    invalid_context = knowledge_context.model_copy(update={"sources": (*knowledge_context.sources, duplicate_source)})
    run_id = uuid4()
    command, event = _create_contract(
        workspace=workspace,
        project=project,
        thread=thread,
        knowledge_context=invalid_context,
        run_id=run_id,
        idempotency_key="knowledge-snapshot-atomicity",
    )

    with pytest.raises(IntegrityError):
        await AgentRuntimeRepository().create_run_with_first_event(command=command, event=event)

    assert not await AgentRunV1Record.filter(id=run_id).exists()
    assert not await AgentRunKnowledgeSnapshotV1Record.filter(run_id=run_id).exists()
    assert not await AgentRunKnowledgeSourceSnapshotV1Record.filter(run_id=run_id).exists()
    assert not await AgentRunEventV1Record.filter(run_id=run_id).exists()
