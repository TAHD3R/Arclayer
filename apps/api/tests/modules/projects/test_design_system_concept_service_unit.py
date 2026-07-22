from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.models.design_systems._enums import DesignSystemOwnerKind
from src.modules.ai.agent_builder_context_schema import (
    AgentRunBuilderContextInputV1,
    AgentRunBuilderContextV1,
)
from src.modules.ai.agent_builder_context_service import AgentBuilderContextResolver
from src.modules.ai.agent_catalog_schema import ResolvedAgentAssignment
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.ai.agent_design_system_context_schema import (
    AgentRunDesignSystemContextInputV1,
    AgentRunDesignSystemContextV1,
)
from src.modules.ai.agent_design_system_context_service import AgentDesignSystemContextResolver
from src.modules.ai.agent_tool_grants import BUILDER_STYLE_GUIDE_GENERATE_TOOL
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.design_systems.concept_repository import (
    DesignSystemConceptGenerationRepository,
)
from src.modules.projects.design_systems.concept_schema import (
    DesignSystemConceptGenerationCreateRequest,
)
from src.modules.projects.design_systems.concept_service import (
    DesignSystemConceptGenerationService,
)
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository

pytestmark = pytest.mark.unit


class _AgentCatalog:
    def __init__(self, resolved: ResolvedAgentAssignment) -> None:
        self.resolved = resolved
        self.calls: list[dict[str, object]] = []

    async def resolve_lead(self, **kwargs):  # type: ignore[no-untyped-def]
        self.calls.append(kwargs)
        return self.resolved


class _ContextResolver:
    def __init__(self, result: object) -> None:
        self.result = result
        self.calls: list[dict[str, object]] = []

    async def resolve_run_context(self, **kwargs):  # type: ignore[no-untyped-def]
        self.calls.append(kwargs)
        return self.result


def _payload(*, agent_id: UUID | None = None, agent_run_id: UUID | None = None):
    return DesignSystemConceptGenerationCreateRequest(
        base_version_id=uuid4(),
        expected_base_checksum="sha256:" + "a" * 64,
        base_revision_id=uuid4(),
        base_etag="sha256:" + "b" * 64,
        agent_id=agent_id,
        agent_run_id=agent_run_id,
        objective="Create one accessible Style Guide direction.",
        candidate_count=1,
    )


def test_concept_request_requires_exactly_one_agent_authority_source() -> None:
    with pytest.raises(ValidationError, match="exactly one of agentRunId or agentId"):
        _payload()
    with pytest.raises(ValidationError, match="exactly one of agentRunId or agentId"):
        _payload(agent_id=uuid4(), agent_run_id=uuid4())

    assert _payload(agent_id=uuid4()).agent_run_id is None
    assert _payload(agent_run_id=uuid4()).agent_id is None


@pytest.mark.asyncio
async def test_direct_concept_authority_pins_selected_agent_and_exact_contexts() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    design_system_id = uuid4()
    agent_id = uuid4()
    payload = _payload(agent_id=agent_id)
    resolved = ResolvedAgentAssignment(
        assignment_id=uuid4(),
        agent_id=agent_id,
        version_id=uuid4(),
        version_number=3,
        supported_execution_modes=("build",),
        tool_grants=(BUILDER_STYLE_GUIDE_GENERATE_TOOL,),
        skill_grant_workspace_id=None,
        skill_installation_ids=(),
        delegation_agent_ids=(),
        instructions="Create product-ready visual foundations.",
    )
    design_context = AgentRunDesignSystemContextV1.model_construct(
        design_system_id=design_system_id,
        version_id=payload.base_version_id,
        manifest_checksum=payload.expected_base_checksum,
    )
    builder_context = AgentRunBuilderContextV1.model_construct(
        site_revision_id=payload.base_revision_id,
        manifest_hash=payload.base_etag,
    )
    agents = _AgentCatalog(resolved)
    design_contexts = _ContextResolver(
        AgentRunDesignSystemContextInputV1.model_construct(
            context=design_context,
            context_byte_size=1,
        )
    )
    builder_contexts = _ContextResolver(
        AgentRunBuilderContextInputV1.model_construct(
            context=builder_context,
            context_byte_size=1,
        )
    )
    service = DesignSystemConceptGenerationService(
        repository=cast(DesignSystemConceptGenerationRepository, object()),
        design_system_repository=cast(ProjectDesignSystemsRepository, object()),
        builder_repository=cast(SiteBuilderRepository, object()),
        agent_catalog_service=cast(AgentCatalogService, agents),
        design_system_context_resolver=cast(AgentDesignSystemContextResolver, design_contexts),
        builder_context_resolver=cast(AgentBuilderContextResolver, builder_contexts),
    )

    authority = await service._resolve_direct_agent_authority(
        workspace_id=workspace_id,
        project_id=project_id,
        design_system_id=design_system_id,
        payload=payload,
        conn=cast(BaseDBAsyncClient, object()),
    )

    assert authority.agent_run_id is None
    assert authority.agent_id == agent_id
    assert authority.agent_version_id == resolved.version_id
    assert authority.agent_assignment_id == resolved.assignment_id
    assert authority.design_system_context is design_context
    assert authority.builder_context is builder_context
    assert agents.calls[0]["execution_mode"] == "build"
    assert agents.calls[0]["ensure_catalog"] is False


def test_direct_concept_authority_rejects_context_drift() -> None:
    payload = _payload(agent_id=uuid4())
    with pytest.raises(Conflict):
        DesignSystemConceptGenerationService._require_direct_context_binding(
            design_system_id=uuid4(),
            payload=payload,
            design=AgentRunDesignSystemContextV1.model_construct(
                design_system_id=uuid4(),
                version_id=payload.base_version_id,
                manifest_checksum=payload.expected_base_checksum,
            ),
            builder=AgentRunBuilderContextV1.model_construct(
                site_revision_id=payload.base_revision_id,
                manifest_hash=payload.base_etag,
            ),
        )


@pytest.mark.asyncio
async def test_concept_base_allows_assignment_to_be_newer_than_canvas_revision() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    design_system_id = uuid4()
    payload = _payload(agent_id=uuid4())
    revision = SimpleNamespace(
        id=payload.base_revision_id,
        workspace_id=workspace_id,
        site_id=uuid4(),
        environment_id=uuid4(),
        design_system_id=design_system_id,
        design_system_version_id=uuid4(),
        design_system_manifest_checksum="sha256:" + "c" * 64,
        manifest_hash=payload.base_etag,
    )
    design_systems = SimpleNamespace(
        get_system=AsyncMock(
            return_value=SimpleNamespace(
                owner_kind=DesignSystemOwnerKind.PROJECT,
                owning_project_id=project_id,
            )
        ),
        get_version=AsyncMock(return_value=SimpleNamespace(manifest_checksum=payload.expected_base_checksum)),
        get_assignment=AsyncMock(
            return_value=SimpleNamespace(
                design_system_id=design_system_id,
                design_system_version_id=payload.base_version_id,
                manifest_checksum=payload.expected_base_checksum,
            )
        ),
    )
    builder = SimpleNamespace(
        get_site_revision=AsyncMock(return_value=revision),
        get_latest_site_revision=AsyncMock(return_value=revision),
    )
    service = DesignSystemConceptGenerationService(
        repository=cast(DesignSystemConceptGenerationRepository, object()),
        design_system_repository=cast(ProjectDesignSystemsRepository, design_systems),
        builder_repository=cast(SiteBuilderRepository, builder),
    )

    await service._require_base(
        workspace_id=workspace_id,
        project_id=project_id,
        design_system_id=design_system_id,
        payload=payload,
        conn=cast(BaseDBAsyncClient, object()),
    )
