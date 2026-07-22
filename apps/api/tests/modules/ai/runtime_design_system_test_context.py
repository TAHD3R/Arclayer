from __future__ import annotations

from typing import cast
from uuid import UUID, uuid4

from src.modules.ai.agent_design_system_context_schema import (
    AgentRunDesignSystemContextInputV1,
    AgentRunDesignSystemContextV1,
)
from src.modules.ai.agent_design_system_context_service import AgentDesignSystemContextResolver
from src.modules.workspaces.design_systems.manifest import DesignSystemManifestV1


class _FixedDesignSystemContextResolver:
    def __init__(self, *, project_id: UUID) -> None:
        self.project_id = project_id

    async def resolve_run_context(self, **_kwargs) -> AgentRunDesignSystemContextInputV1:
        return fixed_design_system_context(self.project_id)


def fixed_design_system_context(project_id: UUID) -> AgentRunDesignSystemContextInputV1:
    checksum = f"sha256:{'1' * 64}"
    manifest = DesignSystemManifestV1.model_validate({
        "manifestVersion": 1,
        "name": "Run snapshot fixture",
        "primitiveTokens": {},
        "semanticTokens": {},
        "componentTokens": {},
        "themes": [{"key": "light", "name": "Light", "mode": "light", "overrides": {}}],
        "typographyRoles": [],
        "componentRecipes": [],
        "motionTokens": [],
        "breakpoints": {},
        "assetReferences": [],
        "componentCatalogVersion": None,
        "extensions": {},
        "checksum": checksum,
    })
    context = AgentRunDesignSystemContextV1(
        project_id=project_id,
        assignment_id=uuid4(),
        assignment_revision=1,
        design_system_id=uuid4(),
        version_id=uuid4(),
        owner_kind="workspace",
        manifest_checksum=checksum,
        validation_finding_hash=f"sha256:{'2' * 64}",
        token_index_hash=f"sha256:{'3' * 64}",
        context_hash=f"sha256:{'4' * 64}",
        manifest=manifest,
        validation_findings=(),
        compatibility={"renderer": "not_evaluated"},
    )
    return AgentRunDesignSystemContextInputV1(context=context, context_byte_size=1)


def fixed_design_system_context_resolver(project_id: UUID) -> AgentDesignSystemContextResolver:
    return cast(
        AgentDesignSystemContextResolver,
        _FixedDesignSystemContextResolver(project_id=project_id),
    )
