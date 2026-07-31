from __future__ import annotations

from typing import Final

from src.config import Settings
from src.core.http.pagination import PageData, PageParams, paginate_queryset
from src.core.services import BaseService
from src.models.agents.runtime_v1 import AgentRunStatusV1, AgentRunV1Record
from src.modules.platform_ai.schema import (
    PlatformAIProviderOut,
    PlatformAIProviderReadinessOut,
    PlatformAITaskListQuery,
    PlatformAITaskOut,
)
from src.modules.system.ai_providers.service import SystemAIProviderService

_ACTIONABLE_STATUSES: Final[tuple[AgentRunStatusV1, ...]] = (
    AgentRunStatusV1.CREATED,
    AgentRunStatusV1.QUEUED,
    AgentRunStatusV1.RUNNING,
    AgentRunStatusV1.CANCELLATION_REQUESTED,
    AgentRunStatusV1.INTERRUPTED,
    AgentRunStatusV1.FAILED,
)


class PlatformAIOperationsService(BaseService):
    """Read-only Platform projections over durable AI runtime facts."""

    async def list_tasks(
        self,
        *,
        params: PageParams,
        query: PlatformAITaskListQuery,
    ) -> PageData[PlatformAITaskOut]:
        runs = AgentRunV1Record.all().order_by("-updated_at", "-id")
        if query.status is None:
            runs = runs.filter(status__in=_ACTIONABLE_STATUSES)
        else:
            runs = runs.filter(status=query.status)
        return await paginate_queryset(runs, params=params, out_schema=PlatformAITaskOut)

    async def provider_readiness(self, *, settings: Settings) -> PlatformAIProviderReadinessOut:
        providers = await SystemAIProviderService(settings).list_providers()
        items = tuple(
            PlatformAIProviderOut(
                id=provider.id,
                provider=provider.provider,
                label=provider.label,
                request_model=provider.request_model,
                is_active=provider.is_active,
                configured=provider.has_virtual_key,
                expires_at=provider.expires_at,
                last_used_at=provider.last_used_at,
            )
            for provider in providers
        )
        missing = () if any(item.is_active and item.configured for item in items) else ("ai-provider-configured",)
        return PlatformAIProviderReadinessOut(items=items, missing_prerequisite_codes=missing)
