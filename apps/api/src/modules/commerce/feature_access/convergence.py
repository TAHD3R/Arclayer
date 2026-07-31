from __future__ import annotations

from tortoise.backends.base.client import BaseDBAsyncClient

from src.modules.commerce.convergence.schema import FeatureAccessConvergenceCommand
from src.modules.commerce.feature_access.contracts import FeatureAccessConvergencePersistence


class FeatureAccessPlanConvergenceParticipant:
    """Feature Access side of Commerce's reviewed convergence transaction."""

    def __init__(self, persistence: FeatureAccessConvergencePersistence) -> None:
        self._persistence = persistence

    async def apply_feature_access_convergence(
        self,
        *,
        command: FeatureAccessConvergenceCommand,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._persistence.apply_convergence_serialized(command=command, conn=conn)
