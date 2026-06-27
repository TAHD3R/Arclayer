from __future__ import annotations

from uuid import uuid4

import pytest

from src.agents.session import AgentSessionManager
from src.agents.types import AgentRunContext, AgentRunStatus
from src.core.exceptions import NotFound
from src.models.organization.organization import Organization, OrganizationKind
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.projects.agents.repository import AgentRunRepository

pytestmark = pytest.mark.integration


async def _create_project() -> tuple[Workspace, ProjectRecord]:
    organization = await Organization.create(
        slug=f"agent-org-{uuid4().hex[:12]}",
        name="Agent Repository Org",
        kind=OrganizationKind.TEAM,
        owner_user_id=None,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Agent Repository Workspace",
        is_active=True,
        created_by_user_id=uuid4(),
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"agent-project-{uuid4().hex[:12]}",
        name="Agent Repository Project",
        is_active=True,
        created_by_user_id=None,
    )
    return workspace, project


@pytest.mark.asyncio
async def test_agent_run_repository_persists_restores_and_scopes_runs(prepared_db) -> None:
    _ = prepared_db
    workspace, project = await _create_project()
    _, other_project = await _create_project()
    user_id = uuid4()
    ctx = AgentRunContext(
        workspace_id=workspace.id,
        project_id=project.id,
        user_id=user_id,
        correlation_id="corr_agent_repo",
        runtime_id=uuid4(),
        site_id=uuid4(),
        environment_id=uuid4(),
    )
    writer = AgentSessionManager(store=AgentRunRepository())
    reader = AgentSessionManager(store=AgentRunRepository())

    state = await writer.create_run(context=ctx, agent_id="content_analyzer", prompt="inspect", model="gpt-4o-mini")
    await writer.complete_run(run_id=state.id, result={"content": "done"})

    restored = await reader.get_run(run_id=state.id, context=ctx)

    assert restored.status is AgentRunStatus.COMPLETED
    assert restored.result == {"content": "done"}
    assert restored.correlation_id == "corr_agent_repo"
    assert restored.runtime_id == ctx.runtime_id
    assert [event.event for event in restored.events] == ["run.created", "run.completed"]
    assert restored.langgraph_thread_id == f"agent-run:{state.id}"
    assert restored.langgraph_checkpoint_id == f"{state.id}:run.completed"
    assert restored.langgraph_checkpoint_node == "run.completed"

    with pytest.raises(NotFound):
        await reader.get_run(run_id=state.id, context=ctx.model_copy(update={"project_id": other_project.id}))

    with pytest.raises(NotFound):
        await reader.get_run(run_id=state.id, context=ctx.model_copy(update={"user_id": uuid4()}))
