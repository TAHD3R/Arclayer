from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.core.exceptions import Conflict
from src.models.projects.project import ProjectRecord
from src.modules.ai.runtime_project_bootstrap_tool import (
    AgentProjectBootstrapToolExecutionRequest,
    ProjectBootstrapArgsV1,
    ProjectBootstrapRepository,
    ProjectBootstrapResources,
    ProjectBootstrapToolExecutor,
    _require_matching_run_context_snapshot,
)
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope
from src.modules.workspaces.design_systems.schema import WorkspaceDesignSystemDefaultOut

pytestmark = pytest.mark.unit


def test_run_context_snapshot_replay_requires_the_same_context() -> None:
    context_hash = "sha256:" + ("a" * 64)
    snapshot = SimpleNamespace(context_hash=context_hash, context_byte_size=128)

    _require_matching_run_context_snapshot(
        snapshot=snapshot,
        created=False,
        expected_context_hash=context_hash,
        expected_context_byte_size=128,
    )

    with pytest.raises(Conflict) as error:
        _require_matching_run_context_snapshot(
            snapshot=snapshot,
            created=False,
            expected_context_hash="sha256:" + ("b" * 64),
            expected_context_byte_size=128,
        )

    assert error.value.error == "AGENT_RUN_IDEMPOTENCY_CONFLICT"


class _Repository(ProjectBootstrapRepository):
    def __init__(self) -> None:
        self.project: ProjectRecord | None = None
        self.runtime_id = uuid4()
        self.site_id = uuid4()
        self.environment_id = uuid4()
        self.design_system_version_id = uuid4()
        self.thread_id = uuid4()
        self.bindings: list[tuple[UUID, UUID]] = []
        self.events: list[str] = []

    async def find_project(self, *, workspace_id: UUID, slug: str) -> ProjectRecord | None:
        _ = workspace_id, slug
        return self.project

    async def get_primary_runtime_id(self, *, project_id: UUID) -> UUID:
        _ = project_id
        return self.runtime_id

    async def resolve_resources(self, **kwargs) -> ProjectBootstrapResources:  # type: ignore[no-untyped-def]
        _ = kwargs
        self.events.append("resolve_resources")
        return ProjectBootstrapResources(
            site_id=self.site_id,
            environment_id=self.environment_id,
            design_system_version_id=self.design_system_version_id,
            design_system_manifest_checksum="sha256:" + ("a" * 64),
        )

    async def resolve_run_contexts(self, **kwargs):  # type: ignore[no-untyped-def]
        _ = kwargs
        return None, None

    async def bind_run_and_thread(
        self,
        *,
        workspace_id: UUID,
        run_id: UUID,
        actor_user_id: UUID,
        project_id: UUID,
        site_revision_id: UUID | None = None,
        design_system_context=None,
        builder_context=None,
    ) -> UUID:
        _ = workspace_id, actor_user_id, site_revision_id, design_system_context, builder_context
        self.bindings.append((run_id, project_id))
        return self.thread_id


class _ProjectService:
    def __init__(self, repository: _Repository) -> None:
        self.repository = repository
        self.create_calls = 0

    async def create_project(self, **kwargs):  # type: ignore[no-untyped-def]
        _ = kwargs
        self.create_calls += 1
        project_id = uuid4()
        self.repository.project = cast(ProjectRecord, SimpleNamespace(id=project_id))
        return SimpleNamespace(
            id=project_id,
            primary_runtime=SimpleNamespace(id=self.repository.runtime_id),
        )


class _BuilderService:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []
        self.site_revision_id = uuid4()

    async def initialize(self, **kwargs):  # type: ignore[no-untyped-def]
        self.calls.append(kwargs)
        return SimpleNamespace(site_revision=SimpleNamespace(id=self.site_revision_id))


class _StarterDefaultEnsurer:
    def __init__(self, repository: _Repository) -> None:
        self.repository = repository

    async def ensure_default(self, **_kwargs: object) -> WorkspaceDesignSystemDefaultOut:
        self.repository.events.append("ensure_default")
        return cast(WorkspaceDesignSystemDefaultOut, SimpleNamespace())


def _tenant_context(workspace_id: UUID) -> TenantContext:
    return TenantContext(
        identity=TenantIdentity(
            organization_id=uuid4(),
            workspace_id=workspace_id,
            schema_name="public",
            isolation_mode=TenantIsolationMode.PUBLIC,
        ),
        scope=TenantScope.WORKSPACE,
    )


@pytest.mark.asyncio
async def test_project_bootstrap_replays_the_same_project_and_builder_command() -> None:
    workspace_id = uuid4()
    actor_user_id = uuid4()
    run_id = uuid4()
    repository = _Repository()
    project_service = _ProjectService(repository)
    builder_service = _BuilderService()
    starter_default_ensurer = _StarterDefaultEnsurer(repository)
    executor = ProjectBootstrapToolExecutor(
        project_service_factory=lambda: project_service,
        builder_service_factory=lambda _context: builder_service,
        tenant_context_factory=lambda: _tenant_context(workspace_id),
        workspace_design_system_default_ensurer=starter_default_ensurer,
        repository=repository,
    )
    request = AgentProjectBootstrapToolExecutionRequest(
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        agent_run_id=run_id,
        tool_call_id="bootstrap-tool-call",
        args=ProjectBootstrapArgsV1(name="Acme Studio", description="A portfolio site."),
    )

    first = await executor.execute(request=request)
    second = await executor.execute(request=request)

    assert first.project_id == second.project_id
    assert first.editor_path == f"/projects/{first.project_id}/editor?stage=sitemap"
    assert first.site_revision_id == builder_service.site_revision_id
    assert project_service.create_calls == 1
    assert repository.events == ["ensure_default", "resolve_resources", "ensure_default", "resolve_resources"]
    assert repository.bindings == [(run_id, first.project_id), (run_id, first.project_id)]
    assert [call["idempotency_key"] for call in builder_service.calls] == [
        f"agent-bootstrap:{run_id}",
        f"agent-bootstrap:{run_id}",
    ]
