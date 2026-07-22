from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.models.builder._enums import BuilderProvenanceSource
from src.modules.ai.agent_catalog_schema import ResolvedAgentAssignment
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.projects.builder.change_set_context import resolve_builder_agent_provenance
from src.modules.projects.builder.change_set_schema import (
    BuilderChangeSetPreviewRequest,
    BuilderPageReorderOperationV1,
)
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.snapshot import canonical_hash


def _direct_agent_payload(*, agent_id, tool_name: str) -> BuilderChangeSetPreviewRequest:
    return BuilderChangeSetPreviewRequest(
        base_revision_id=uuid4(),
        base_etag=canonical_hash({"revision": 1}),
        operations=(
            BuilderPageReorderOperationV1(
                type="page.reorder",
                operation_id="reorder-home",
                item_id=uuid4(),
                sort_order=1,
            ),
        ),
        provenance_source="agent",
        agent_id=agent_id,
        tool_name=tool_name,
    )


async def test_direct_agent_preview_resolves_exact_assignment_version_and_tool_grant() -> None:
    workspace_id, project_id, actor_user_id, agent_id = (uuid4() for _ in range(4))
    resolved = ResolvedAgentAssignment(
        assignment_id=uuid4(),
        agent_id=agent_id,
        version_id=uuid4(),
        version_number=4,
        supported_execution_modes=("plan", "build"),
        tool_grants=("builder.wireframe.apply",),
        skill_grant_workspace_id=None,
        skill_installation_ids=(),
        delegation_agent_ids=(),
        instructions="Build the selected page wireframe.",
    )
    agents = SimpleNamespace(resolve_lead=AsyncMock(return_value=resolved))
    payload = _direct_agent_payload(agent_id=agent_id, tool_name="builder.wireframe.apply")
    conn = cast(BaseDBAsyncClient, object())

    provenance = await resolve_builder_agent_provenance(
        repository=cast(SiteBuilderRepository, SimpleNamespace()),
        agent_catalog_service=cast(AgentCatalogService, agents),
        provenance=BuilderProvenanceSource.AGENT,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        base_revision_id=uuid4(),
        payload=payload,
        conn=conn,
    )

    assert provenance is not None
    assert provenance.agent_run_id is None
    assert provenance.agent_id == agent_id
    assert provenance.agent_version_id == resolved.version_id
    assert provenance.agent_assignment_id == resolved.assignment_id
    assert provenance.tool_name == "builder.wireframe.apply"
    agents.resolve_lead.assert_awaited_once_with(
        workspace_id=workspace_id,
        project_id=project_id,
        agent_id=agent_id,
        execution_mode="build",
        conn=conn,
        ensure_catalog=False,
    )


async def test_direct_agent_preview_rejects_missing_apply_tool_grant() -> None:
    agent_id = uuid4()
    agents = SimpleNamespace(
        resolve_lead=AsyncMock(
            return_value=ResolvedAgentAssignment(
                assignment_id=uuid4(),
                agent_id=agent_id,
                version_id=uuid4(),
                version_number=4,
                supported_execution_modes=("build",),
                tool_grants=("builder.wireframe.generate",),
                skill_grant_workspace_id=None,
                skill_installation_ids=(),
                delegation_agent_ids=(),
                instructions="Build the selected page wireframe.",
            )
        )
    )

    with pytest.raises(Conflict) as exc_info:
        await resolve_builder_agent_provenance(
            repository=cast(SiteBuilderRepository, SimpleNamespace()),
            agent_catalog_service=cast(AgentCatalogService, agents),
            provenance=BuilderProvenanceSource.AGENT,
            workspace_id=uuid4(),
            project_id=uuid4(),
            actor_user_id=uuid4(),
            base_revision_id=uuid4(),
            payload=_direct_agent_payload(agent_id=agent_id, tool_name="builder.wireframe.apply"),
            conn=cast(BaseDBAsyncClient, object()),
        )

    assert exc_info.value.error == "AGENT_BUILDER_TOOL_NOT_GRANTED"
