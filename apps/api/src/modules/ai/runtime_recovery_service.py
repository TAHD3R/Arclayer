from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.services import BaseService
from src.models.agents.runtime_recovery_v1 import AgentRunRecoveryStatus
from src.modules.ai.runtime_recovery_repository import AgentRunRecoveryRepository


class AgentRunRecoveryLifecycleService(BaseService):
    """Persist the execution lifecycle of one Platform-requested recovery Job."""

    def __init__(
        self,
        settings: Settings,
        *,
        recoveries: AgentRunRecoveryRepository | None = None,
    ) -> None:
        super().__init__(settings, event_publisher=None, default_event_source="agent-run-recovery")
        self._recoveries = recoveries or AgentRunRecoveryRepository()

    async def mark_running(self, *, recovery_id: UUID, recovery_job_id: UUID) -> None:
        async with self.tx() as conn:
            await self._recoveries.mark_running(
                recovery_id=recovery_id,
                recovery_job_id=recovery_job_id,
                conn=conn,
            )

    async def complete(
        self,
        *,
        recovery_id: UUID,
        recovery_job_id: UUID,
        status: AgentRunRecoveryStatus,
        evidence: JsonObject,
    ) -> None:
        async with self.tx() as conn:
            await self._recoveries.complete(
                recovery_id=recovery_id,
                recovery_job_id=recovery_job_id,
                status=status,
                completed_at=datetime.now(UTC),
                evidence=evidence,
                conn=conn,
            )
