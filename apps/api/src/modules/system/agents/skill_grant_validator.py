from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Protocol
from uuid import UUID

from src.modules.ai.agent_skill_grant_service import build_agent_skill_grant_resolver
from src.modules.tenancy.router_helpers import ensure_workspace_tenant_context
from src.modules.tenancy.schema import TenantContext

TenantContextResolver = Callable[..., Awaitable[TenantContext]]


class AgentVersionSkillGrantValidator(Protocol):
    async def validate(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        installation_ids: tuple[UUID, ...],
        tool_grants: tuple[str, ...],
    ) -> None: ...


class TenantAgentVersionSkillGrantValidator:
    def __init__(
        self,
        *,
        tenant_context_resolver: TenantContextResolver = ensure_workspace_tenant_context,
    ) -> None:
        self._tenant_context_resolver = tenant_context_resolver

    async def validate(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        installation_ids: tuple[UUID, ...],
        tool_grants: tuple[str, ...],
    ) -> None:
        tenant_context = await self._tenant_context_resolver(
            workspace_id=workspace_id,
            organization_id=organization_id,
        )
        await build_agent_skill_grant_resolver(tenant_context).validate_version_grants(
            workspace_id=workspace_id,
            installation_ids=installation_ids,
            tool_grants=tool_grants,
        )
